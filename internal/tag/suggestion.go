package tag

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/michael-freling/anime-image-viewer/internal/image"
	tag_suggestionv1 "github.com/michael-freling/anime-image-viewer/plugins/plugins-protos/gen/go/tag_suggestion/v1"
	"golang.org/x/sync/errgroup"
)

type TagSuggestion struct {
	TagID            uint    `json:"tagId"`
	Score            float64 `json:"score"`
	HasTag           bool    `json:"hasTag"`
	HasDescendantTag bool    `json:"hasDescendantTag"`
}

type SuggestionService struct {
	dbClient             *db.Client
	suggestServiceClient tag_suggestionv1.TagSuggestionServiceClient

	reader *Reader

	imageReader *image.Reader
}

func NewSuggestionService(
	dbClient *db.Client,
	tagSuggestionClient tag_suggestionv1.TagSuggestionServiceClient,
	reader *Reader,
	imageReader *image.Reader,
) *SuggestionService {
	return &SuggestionService{
		dbClient:             dbClient,
		suggestServiceClient: tagSuggestionClient,

		reader: reader,

		imageReader: imageReader,
	}
}

func (service *SuggestionService) suggestTags(ctx context.Context, imageFileIDs []uint) (SuggestTagsResponse, error) {
	imageFiles, err := service.imageReader.ReadImagesByIDs(imageFileIDs)
	if err != nil {
		return SuggestTagsResponse{}, fmt.Errorf("imageReader.getImagesByIDs: %w", err)
	}
	if len(imageFiles) == 0 {
		return SuggestTagsResponse{}, fmt.Errorf("%w by IDs: %v", image.ErrImageFileNotFound, imageFileIDs)
	}

	imageFileMap := imageFiles.ToMap()
	imageUrls := make([]string, len(imageFileMap))
	for index, imageFileID := range imageFileIDs {
		imageUrls[index] = imageFileMap[imageFileID].LocalFilePath
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
	var tagChecker BatchImageTagChecker
	eg.Go(func() error {
		allTags, err := service.reader.ReadAllTags()
		if err != nil {
			return fmt.Errorf("reader.ReadAllTags: %w", err)
		}
		allTagMap = ConvertTagsToMap(allTags)

		tagChecker, err = service.reader.CreateBatchTagCheckerByFileIDs(
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

	// imageFiles := make([]image.ImageFile, len(imageFileIDs))
	suggestionsForImageFiles := make(map[uint][]TagSuggestion, len(response.Suggestions))
	for index, imageFileID := range imageFileIDs {
		// imageFile := imageFileMap[imageFileID]
		// imageFiles[index] = imageFile
		batchTagChecker := tagChecker.GetTagCheckerForImageFileID(imageFileID)
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
				HasTag:           batchTagChecker.HasTag(tag.ID),
				HasDescendantTag: batchTagChecker.hasDecendantTag(tag.ID),
			})
		}
		suggestionsForImageFiles[imageFileID] = suggestions
	}

	return SuggestTagsResponse{
		// ImageFiles:  imageFiles,
		Suggestions: suggestionsForImageFiles,
		AllTags:     allTagMap,
	}, nil
}

func (service *SuggestionService) addSuggestedTags(ctx context.Context, selectedTags map[uint][]uint) (map[uint][]uint, error) {
	fileIDs := make([]uint, len(selectedTags))
	for fileID := range selectedTags {
		fileIDs = append(fileIDs, fileID)
	}
	batchTagChecker, err := service.reader.CreateBatchTagCheckerByFileIDs(ctx, fileIDs)
	if err != nil {
		return nil, fmt.Errorf("tagService.CreateBatchTagCheckerByFileIDs: %w", err)
	}

	duplicatedTags := make(map[uint][]uint)
	fileTags := db.FileTagList{}
	for fileID, tags := range selectedTags {
		tagChecker := batchTagChecker.GetTagCheckerForImageFileID(fileID)
		for _, tagID := range tags {
			if tagChecker.HasTag(tagID) || tagChecker.hasDecendantTag(tagID) {
				if _, ok := duplicatedTags[fileID]; !ok {
					duplicatedTags[fileID] = make([]uint, 0)
				}
				duplicatedTags[fileID] = append(duplicatedTags[fileID], tagID)
				continue
			}

			fileTags = append(fileTags, db.FileTag{
				FileID:  fileID,
				TagID:   tagID,
				AddedBy: db.FileTagAddedBySuggestion,
			})
		}
	}
	if len(fileTags) == 0 {
		return duplicatedTags, nil
	}

	if err := db.BatchCreate(service.dbClient, fileTags); err != nil {
		return duplicatedTags, fmt.Errorf("db.BatchCreate: %w", err)
	}
	return duplicatedTags, nil
}
