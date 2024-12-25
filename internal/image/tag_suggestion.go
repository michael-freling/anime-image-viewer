package image

import (
	"context"
	"fmt"
	"log/slog"
	"strings"

	"github.com/michael-freling/anime-image-viewer/internal/xslices"
	tag_suggestionv1 "github.com/michael-freling/anime-image-viewer/plugins/plugins-protos/gen/go/tag_suggestion/v1"
	"golang.org/x/sync/errgroup"
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
	Scores           []float64
	SortedTagIndices []uint
}

type SuggestTagsResponse struct {
	ImageFiles     []ImageFile
	TagSuggestions []TagSuggestion
	// AllTags maps tag IDs to tags
	AllTags map[uint]Tag
}

func (service *TagSuggestionService) SuggestTags(ctx context.Context, imageFileIDs []uint) (SuggestTagsResponse, error) {
	imageFileMap, err := service.imageFileService.readImagesByIDs(ctx, imageFileIDs)
	if err != nil {
		return SuggestTagsResponse{}, fmt.Errorf("imageFileService.getImagesByIDs: %w", err)
	}
	if len(imageFileMap) == 0 {
		return SuggestTagsResponse{}, nil
	}
	imageUrls := make([]string, len(imageFileMap))
	for index, imageFileID := range imageFileIDs {
		imageFile := imageFileMap[imageFileID]

		wslPath := strings.ReplaceAll(
			strings.ReplaceAll(imageFile.localFilePath,
				"C:\\",
				"/mnt/c/",
			),
			"\\",
			"/",
		)
		imageUrls[index] = wslPath
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
	var tagMap map[uint]Tag
	eg.Go(func() error {
		allTags, err := service.tagService.GetAll()
		if err != nil {
			return fmt.Errorf("tagService.GetAll: %w", err)
		}
		tagMap = convertTagsToMap(allTags)
		return nil
	})
	if err := eg.Wait(); err != nil {
		return SuggestTagsResponse{}, fmt.Errorf("eg.Wait: %w", err)
	}
	if len(response.Suggestions) != len(imageFileIDs) {
		return SuggestTagsResponse{}, nil
	}

	slog.Default().DebugContext(ctx, "suggest tag client response",
		"imageFileIDs", imageFileIDs,
		"imageUrls", imageUrls,
		"response", response,
	)

	imageFiles := make([]ImageFile, len(imageFileIDs))
	suggestions := make([]TagSuggestion, len(response.Suggestions))
	for index, imageFileID := range imageFileIDs {
		tagSuggestion := response.Suggestions[index]
		imageFile := imageFileMap[imageFileID]

		imageFiles[index] = imageFile
		suggestions[index] = TagSuggestion{
			Scores: tagSuggestion.Scores,
			SortedTagIndices: xslices.Map(tagSuggestion.SortedScoreIndices, func(index int64) uint {
				return uint(index)
			}),
		}
	}

	return SuggestTagsResponse{
		ImageFiles:     imageFiles,
		TagSuggestions: suggestions,
		AllTags:        tagMap,
	}, nil
}
