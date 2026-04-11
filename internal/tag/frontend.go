package tag

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"slices"

	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/michael-freling/anime-image-viewer/internal/image"
	"github.com/michael-freling/anime-image-viewer/internal/xerrors"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type TagFrontendService struct {
	logger   *slog.Logger
	dbClient *db.Client

	reader            *Reader
	suggestionService *SuggestionService
}

func NewFrontendService(
	logger *slog.Logger,
	dbClient *db.Client,
	reader *Reader,
	suggestionService *SuggestionService,
) *TagFrontendService {
	return &TagFrontendService{
		logger:            logger,
		dbClient:          dbClient,
		reader:            reader,
		suggestionService: suggestionService,
	}
}

func (service TagFrontendService) CreateTopTag(name string) (Tag, error) {
	tag := db.Tag{
		Name: name,
	}
	err := db.Create(service.dbClient, &tag)
	if err != nil {
		return Tag{}, fmt.Errorf("db.Create: %w", err)
	}

	return Tag{
		ID:       tag.ID,
		Name:     tag.Name,
		Category: tag.Category,
	}, nil
}

type TagInput struct {
	Name string
}

func (service TagFrontendService) Create(ctx context.Context, input TagInput) (Tag, error) {
	tag := db.Tag{
		Name: input.Name,
	}
	err := db.Create(service.dbClient, &tag)
	if err != nil {
		return Tag{}, fmt.Errorf("db.Create: %w", err)
	}
	return Tag{
		ID:       tag.ID,
		Name:     tag.Name,
		Category: tag.Category,
	}, nil
}

func (service TagFrontendService) UpdateName(ctx context.Context, id uint, name string) (Tag, error) {
	var newTag db.Tag
	err := db.NewTransaction(ctx, service.dbClient, func(ctx context.Context) error {
		ormClient := service.dbClient.Tag()
		var err error
		newTag, err = ormClient.FindByValue(ctx, &db.Tag{
			ID: id,
		})
		if err != nil {
			return fmt.Errorf("ormClient.FindByValue: %w", err)
		}

		newTag.Name = name
		if err := ormClient.Update(ctx, &newTag); err != nil {
			return fmt.Errorf("ormClient.Update: %w", err)
		}
		return nil
	})
	if err != nil {
		return Tag{}, err
	}

	return Tag{
		ID:       newTag.ID,
		Name:     newTag.Name,
		Category: newTag.Category,
	}, nil
}

func (service TagFrontendService) UpdateCategory(ctx context.Context, id uint, category string) (Tag, error) {
	var newTag db.Tag
	err := db.NewTransaction(ctx, service.dbClient, func(ctx context.Context) error {
		ormClient := service.dbClient.Tag()
		var err error
		newTag, err = ormClient.FindByValue(ctx, &db.Tag{
			ID: id,
		})
		if err != nil {
			return fmt.Errorf("ormClient.FindByValue: %w", err)
		}

		newTag.Category = category
		if err := ormClient.Update(ctx, &newTag); err != nil {
			return fmt.Errorf("ormClient.Update: %w", err)
		}
		return nil
	})
	if err != nil {
		return Tag{}, err
	}

	return Tag{
		ID:       newTag.ID,
		Name:     newTag.Name,
		Category: newTag.Category,
	}, nil
}

func (service TagFrontendService) GetTagFileCount(tagID uint) (uint, error) {
	fileTags, err := service.dbClient.FileTag().FindAllByTagIDs([]uint{tagID})
	return uint(len(fileTags)), err
}

func (service TagFrontendService) DeleteTag(ctx context.Context, tagID uint) error {
	return db.NewTransaction(ctx, service.dbClient, func(ctx context.Context) error {
		if err := service.dbClient.FileTag().DeleteByTagIDs(ctx, []uint{tagID}); err != nil {
			return fmt.Errorf("FileTag.DeleteByTagIDs: %w", err)
		}
		if err := service.dbClient.Tag().BatchDelete(ctx, []db.Tag{{ID: tagID}}); err != nil {
			return fmt.Errorf("Tag.BatchDelete: %w", err)
		}
		return nil
	})
}

func (service TagFrontendService) MergeTags(ctx context.Context, sourceTagID uint, targetTagID uint) error {
	if sourceTagID == targetTagID {
		return fmt.Errorf("%w: source and target tags must be different", xerrors.ErrInvalidArgument)
	}

	return db.NewTransaction(ctx, service.dbClient, func(ctx context.Context) error {
		// Verify both tags exist
		tagClient := service.dbClient.Tag()
		if _, err := tagClient.FindByValue(ctx, &db.Tag{ID: sourceTagID}); err != nil {
			return fmt.Errorf("source tag not found: %w", err)
		}
		if _, err := tagClient.FindByValue(ctx, &db.Tag{ID: targetTagID}); err != nil {
			return fmt.Errorf("target tag not found: %w", err)
		}

		// Get all file associations for source tag
		sourceFileTags, err := service.dbClient.FileTag().FindAllByTagIDs([]uint{sourceTagID})
		if err != nil {
			return fmt.Errorf("FileTag.FindAllByTagIDs for source: %w", err)
		}

		// Get existing file associations for target tag to avoid duplicates
		targetFileTags, err := service.dbClient.FileTag().FindAllByTagIDs([]uint{targetTagID})
		if err != nil {
			return fmt.Errorf("FileTag.FindAllByTagIDs for target: %w", err)
		}
		targetFileIDSet := make(map[uint]bool)
		for _, ft := range targetFileTags {
			targetFileIDSet[ft.FileID] = true
		}

		// Create new file-tag associations for the target tag (skip duplicates)
		newFileTags := make([]db.FileTag, 0)
		for _, ft := range sourceFileTags {
			if targetFileIDSet[ft.FileID] {
				continue // target already has this file
			}
			newFileTags = append(newFileTags, db.FileTag{
				TagID:   targetTagID,
				FileID:  ft.FileID,
				AddedBy: ft.AddedBy,
			})
		}
		if len(newFileTags) > 0 {
			if err := service.dbClient.FileTag().BatchCreate(ctx, newFileTags); err != nil {
				return fmt.Errorf("FileTag.BatchCreate: %w", err)
			}
		}

		// Delete source tag's file associations (no-op if none)
		if err := service.dbClient.FileTag().DeleteByTagIDs(ctx, []uint{sourceTagID}); err != nil {
			return fmt.Errorf("FileTag.DeleteByTagIDs: %w", err)
		}

		// Delete the source tag
		if err := tagClient.BatchDelete(ctx, []db.Tag{{ID: sourceTagID}}); err != nil {
			return fmt.Errorf("Tag.BatchDelete: %w", err)
		}

		return nil
	})
}

func (service TagFrontendService) BatchUpdateTagsForFiles(ctx context.Context, fileIDs []uint, addedTagIDs []uint, deletedTagIDs []uint) error {
	fileTagClient := service.dbClient.FileTag()
	fileTags, err := fileTagClient.FindAllByFileID(fileIDs)
	if err != nil {
		return fmt.Errorf("fileTagClient.FindAllByFileID: %w", err)
	}

	createdFileTags := make([]db.FileTag, 0)
	for _, tagID := range addedTagIDs {
		filesForTag := fileTags.ToTagMap()[tagID]
		for _, fileID := range fileIDs {
			if _, ok := filesForTag[fileID]; ok {
				continue
			}

			createdFileTags = append(createdFileTags, db.FileTag{
				TagID:   tagID,
				FileID:  fileID,
				AddedBy: db.FileTagAddedByUser,
			})
		}
	}
	if len(deletedTagIDs) == 0 && len(createdFileTags) == 0 {
		return nil
	}

	return db.NewTransaction(ctx, service.dbClient, func(ctx context.Context) error {
		ormClient := service.dbClient.FileTag()
		if len(deletedTagIDs) > 0 {
			if err := ormClient.BatchDelete(ctx, deletedTagIDs, fileIDs); err != nil {
				return fmt.Errorf("ormClient.DeleteByFileIDs: %w", err)
			}
		}
		if len(createdFileTags) > 0 {
			if err := ormClient.BatchCreate(ctx, createdFileTags); err != nil {
				return fmt.Errorf("ormClient.BatchCreate: %w", err)
			}
		}
		return nil
	})
}

type SuggestTagsResponse struct {
	ImageFiles []image.ImageFile `json:"imageFiles"`

	// Suggestions maps image file IDs to tag suggestions
	Suggestions map[uint][]TagSuggestion `json:"suggestions"`

	// AllTags maps tag IDs to tags
	AllTags map[uint]Tag `json:"allTags"`
}

func (service TagFrontendService) SuggestTags(ctx context.Context, imageFileIDs []uint) (SuggestTagsResponse, error) {
	if len(imageFileIDs) == 0 {
		return SuggestTagsResponse{}, fmt.Errorf("%w: imageFileIDs is required", xerrors.ErrInvalidArgument)
	}
	response, err := service.suggestionService.suggestTags(ctx, imageFileIDs)
	if err != nil {
		grpcStatusCode := status.Code(err)
		unexpectedErrorCode := []codes.Code{
			codes.Internal,
			codes.Unknown,
		}
		if !slices.Contains(unexpectedErrorCode, grpcStatusCode) {
			return SuggestTagsResponse{}, fmt.Errorf("suggestionService.suggestTags > %w", err)
		}
		if errors.Is(err, image.ErrImageFileNotFound) {
			return SuggestTagsResponse{}, fmt.Errorf("failed to find an image: %w", err)
		}

		service.logger.Error("failed to suggest tags",
			"imageFileIDs", imageFileIDs,
			"error", err,
		)
		return SuggestTagsResponse{}, fmt.Errorf("failed to suggest tags")
	}
	return response, nil
}

type AddSuggestedTagsRequest struct {
	// fileID -> tagID
	SelectedTags map[uint][]uint `json:"selectedTags"`
}

type AddSuggestedTagsResponse struct {
	// todo: add addedTags if necessary
	// addedTags      map[uint][]uint `json:"succeededTags"`
	DuplicatedTags map[uint][]uint `json:"duplicatedTags"`
}

func (service TagFrontendService) AddSuggestedTags(ctx context.Context, request AddSuggestedTagsRequest) (AddSuggestedTagsResponse, error) {
	if len(request.SelectedTags) == 0 {
		return AddSuggestedTagsResponse{}, nil
	}

	logger := service.logger
	logger.DebugContext(ctx, "add suggested tags request",
		"request", request,
	)

	duplicatedTags, err := service.suggestionService.addSuggestedTags(ctx, request.SelectedTags)
	if len(duplicatedTags) == 0 {
		duplicatedTags = nil
	}
	response := AddSuggestedTagsResponse{
		DuplicatedTags: duplicatedTags,
	}
	if err != nil {
		logger.Error("failed to add suggested tags",
			"request", request,
			"error", err,
		)
		return response, fmt.Errorf("failed to add tags")
		// return response, err
	}
	return response, nil
}
