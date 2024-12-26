package image

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	tag_suggestionv1 "github.com/michael-freling/anime-image-viewer/plugins/plugins-protos/gen/go/tag_suggestion/v1"
	"golang.org/x/sync/errgroup"
)

var (
	ErrImageFileNotFound = errors.New("no image file was found")
)

type TagSuggestionService struct {
	suggestServiceClient tag_suggestionv1.TagSuggestionServiceClient
	imageFileService     *ImageFileService
	tagService           *TagService
}

func NewTagSuggestionService(
	tagSuggestionClient tag_suggestionv1.TagSuggestionServiceClient,
	imageFileService *ImageFileService,
	tagService *TagService,
) *TagSuggestionService {
	return &TagSuggestionService{
		suggestServiceClient: tagSuggestionClient,
		imageFileService:     imageFileService,
		tagService:           tagService,
	}
}

type TagSuggestion struct {
	TagID            uint    `json:"tagId"`
	Score            float64 `json:"score"`
	HasTag           bool    `json:"hasTag"`
	HasDescendantTag bool    `json:"hasDescendantTag"`
}

type SuggestTagsResponse struct {
	ImageFiles []ImageFile `json:"imageFiles"`

	// Suggestions maps image file IDs to tag suggestions
	Suggestions map[uint][]TagSuggestion `json:"suggestions"`

	// AllTags maps tag IDs to tags
	AllTags map[uint]Tag `json:"allTags"`
}

func (service *TagSuggestionService) SuggestTags(ctx context.Context, imageFileIDs []uint) (SuggestTagsResponse, error) {
	imageFileMap, err := service.imageFileService.readImagesByIDs(ctx, imageFileIDs)
	if err != nil {
		return SuggestTagsResponse{}, fmt.Errorf("imageFileService.getImagesByIDs: %w", err)
	}
	if len(imageFileMap) == 0 {
		return SuggestTagsResponse{}, fmt.Errorf("%w by IDs: %v", ErrImageFileNotFound, imageFileIDs)
	}

	imageUrls := make([]string, len(imageFileMap))
	for index, imageFileID := range imageFileIDs {
		imageUrls[index] = imageFileMap[imageFileID].localFilePath
	}

	eg, childCtx := errgroup.WithContext(ctx)
	var response *tag_suggestionv1.SuggestResponse
	eg.Go(func() error {
		var err error
		response, err = service.suggestServiceClient.Suggest(childCtx, &tag_suggestionv1.SuggestRequest{
			ImageUrls: imageUrls,
		})
		if err != nil {
			return fmt.Errorf("suggestServiceClient.Suggest: %w", err)
		}
		return nil
	})

	var allTagMap map[uint]Tag
	var tagChecker batchImageTagChecker
	eg.Go(func() error {
		allTags, err := service.tagService.GetAll()
		if err != nil {
			return fmt.Errorf("tagService.GetAll: %w", err)
		}
		allTagMap = convertTagsToMap(allTags)

		tagChecker, err = service.tagService.createBatchTagCheckerByFileIDs(
			childCtx,
			imageFileIDs,
		)
		if err != nil {
			return fmt.Errorf("tagService.createBatchTagCheckerByFileIDs: %w", err)
		}
		return nil
	})
	if err := eg.Wait(); err != nil {
		return SuggestTagsResponse{}, fmt.Errorf("eg.Wait: %w", err)
	}
	if len(response.Suggestions) != len(imageFileIDs) {
		return SuggestTagsResponse{}, nil
	}

	logger := slog.Default()
	logger.DebugContext(ctx, "suggest tag client response",
		"imageFileIDs", imageFileIDs,
		"imageUrls", imageUrls,
		"response", response,
	)

	imageFiles := make([]ImageFile, len(imageFileIDs))
	suggestionsForImageFiles := make(map[uint][]TagSuggestion, len(response.Suggestions))
	for index, imageFileID := range imageFileIDs {
		imageFile := imageFileMap[imageFileID]
		imageFiles[index] = imageFile

		batchTagChecker := tagChecker.getTagCheckerForImageFileID(imageFileID)
		tagSuggestion := response.Suggestions[index]
		suggestions := make([]TagSuggestion, 0, len(tagSuggestion.Scores))
		for _, score := range tagSuggestion.Scores {
			tag, ok := allTagMap[uint(score.TagId)]
			if !ok {
				logger.WarnContext(ctx, "tag was not found",
					"tag_id", score.TagId,
				)
				continue
			}

			suggestions = append(suggestions, TagSuggestion{
				TagID:            uint(score.TagId),
				Score:            score.Score,
				HasTag:           batchTagChecker.hasTag(tag.ID),
				HasDescendantTag: batchTagChecker.hasDecendantTag(tag.ID),
			})
		}
		suggestionsForImageFiles[imageFile.ID] = suggestions
	}

	return SuggestTagsResponse{
		ImageFiles:  imageFiles,
		Suggestions: suggestionsForImageFiles,
		AllTags:     allTagMap,
	}, nil
}
