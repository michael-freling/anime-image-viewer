package tag

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/michael-freling/anime-image-viewer/internal/image"
)

type TagFrontendService struct {
	logger   *slog.Logger
	dbClient *db.Client

	reader *Reader
}

func NewFrontendService(
	logger *slog.Logger,
	dbClient *db.Client,
	reader *Reader,
) *TagFrontendService {
	return &TagFrontendService{
		logger:   logger,
		dbClient: dbClient,
		reader:   reader,
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
		ID:   tag.ID,
		Name: tag.Name,
	}, nil
}

type TagInput struct {
	Name     string
	ParentID uint
}

func (service TagFrontendService) Create(input TagInput) (Tag, error) {
	parentTag, err := db.FindByValue(service.dbClient, &db.Tag{
		ID: input.ParentID,
	})
	if err != nil {
		return Tag{}, fmt.Errorf("db.FindByValue: %w", err)
	}

	tag := db.Tag{
		Name:     input.Name,
		ParentID: input.ParentID,
	}
	if parentTag.Type == db.TagTypeSeason {
		tag.Type = db.TagTypeSeason
	}
	if parentTag.Type == db.TagTypeSeries && parentTag.ParentID == 0 {
		// series tags are only the first level, for example
		// Series > Attack on Titan, but not
		// Series > Attack on Titan > Season 1
		tag.Type = db.TagTypeSeries
	}

	err = db.NewTransaction(service.dbClient, func(ormClient *db.ORMClient[db.Tag]) error {
		_, err := ormClient.FindByValue(&db.Tag{
			ID: input.ParentID,
		})
		if err != nil {
			return fmt.Errorf("ormClient.FindByValue: %w", err)
		}

		if err := ormClient.Create(&tag); err != nil {
			return fmt.Errorf("ormClient.Create: %w", err)
		}

		// create some tags automatically
		if parentTag.Type == db.TagTypeSeries && parentTag.ParentID == 0 {
			seriesTags := []db.Tag{
				{Name: "Characters", ParentID: tag.ID},
				{Name: "Seasons", ParentID: tag.ID},
			}
			if err := ormClient.BatchCreate(seriesTags); err != nil {
				return fmt.Errorf("ormClient.BatchCreate: %w", err)
			}
			if err := ormClient.Create(&db.Tag{
				Name:     "Season 1",
				Type:     db.TagTypeSeason,
				ParentID: seriesTags[1].ID,
			}); err != nil {
				return fmt.Errorf("ormClient.Create: %w", err)
			}
		}
		if parentTag.Type == db.TagTypeSeason && parentTag.ParentID == 0 {
			err = ormClient.BatchCreate([]db.Tag{
				{Name: "Winter", ParentID: tag.ID},
				{Name: "Spring", ParentID: tag.ID},
				{Name: "Summer", ParentID: tag.ID},
				{Name: "Fall", ParentID: tag.ID},
			})
			if err != nil {
				return fmt.Errorf("ormClient.BatchCreate: %w", err)
			}
		}

		return nil
	})
	if err != nil {
		return Tag{}, err
	}

	return Tag{
		ID:   tag.ID,
		Name: tag.Name,
	}, nil
}

func (service TagFrontendService) UpdateName(id uint, name string) (Tag, error) {
	var newTag db.Tag
	err := db.NewTransaction(service.dbClient, func(ormClient *db.ORMClient[db.Tag]) error {
		var err error
		newTag, err = ormClient.FindByValue(&db.Tag{
			ID: id,
		})
		if err != nil {
			return fmt.Errorf("ormClient.FindByValue: %w", err)
		}

		newTag.Name = name
		if err := ormClient.Update(&newTag); err != nil {
			return fmt.Errorf("ormClient.Update: %w", err)
		}
		return nil
	})
	if err != nil {
		return Tag{}, err
	}

	return Tag{
		ID:   newTag.ID,
		Name: newTag.Name,
	}, nil
}

func (service TagFrontendService) GetAll() ([]Tag, error) {
	tags, err := service.reader.ReadAllTags()
	if err != nil {
		return nil, fmt.Errorf("ReadAllTags: %w", err)
	}

	// sort tags based on a tag type
	result := make([]Tag, 0)
	seriesTags := make([]Tag, 0)
	seasonTags := make([]Tag, 0)
	otherTags := make([]Tag, 0)
	for _, tag := range tags {
		switch tag.tagType {
		case db.TagTypeSeries:
			seriesTags = append(seriesTags, tag)
		case db.TagTypeSeason:
			seasonTags = append(seasonTags, tag)
		default:
			otherTags = append(otherTags, tag)
		}
	}
	result = append(result, seriesTags...)
	result = append(result, seasonTags...)
	result = append(result, otherTags...)
	if len(result) == 0 {
		return nil, nil
	}
	return result, nil
}

type ReadImageFilesResponse struct {
	// tag includes descendants
	Tags       []Tag
	ImageFiles map[uint][]image.ImageFile
}

func (service TagFrontendService) ReadImageFiles(tagID uint) (ReadImageFilesResponse, error) {
	return service.reader.readImageFiles(tagID)
}

type ReadTagsByFileIDsResponse struct {
	// AncestorMap maps tag IDs to their ancestors
	AncestorMap map[uint][]image.File

	// TagCounts maps tag IDs to the number of files that have the tag
	TagCounts map[uint]uint
}

func (service TagFrontendService) ReadTagsByFileIDs(
	ctx context.Context,
	fileIDs []uint,
) (ReadTagsByFileIDsResponse, error) {
	batchImageTagChecker, err := service.reader.CreateBatchTagCheckerByFileIDs(ctx, fileIDs)
	if err != nil {
		return ReadTagsByFileIDsResponse{}, fmt.Errorf("service.createBatchTagCheckerByFileIDs: %w", err)
	}
	response := ReadTagsByFileIDsResponse{
		AncestorMap: batchImageTagChecker.getTagsMapFromAncestors(),
		TagCounts:   batchImageTagChecker.getTagCounts(),
	}
	return response, nil
}

func (service TagFrontendService) BatchUpdateTagsForFiles(fileIDs []uint, addedTagIDs []uint, deletedTagIDs []uint) error {
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
				TagID:  tagID,
				FileID: fileID,
			})
		}
	}
	if len(deletedTagIDs) == 0 && len(createdFileTags) == 0 {
		return nil
	}

	err = fileTagClient.WithTransaction(func(ormClient *db.FileTagClient) error {
		if len(deletedTagIDs) > 0 {
			if err := ormClient.BatchDelete(deletedTagIDs, fileIDs); err != nil {
				return fmt.Errorf("ormClient.DeleteByFileIDs: %w", err)
			}
		}
		if len(createdFileTags) > 0 {
			if err := ormClient.BatchCreate(createdFileTags); err != nil {
				return fmt.Errorf("ormClient.BatchCreate: %w", err)
			}
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("db.NewTransaction: %w", err)
	}
	return nil
}
