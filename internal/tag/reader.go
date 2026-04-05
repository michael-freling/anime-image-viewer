package tag

import (
	"context"
	"fmt"

	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/michael-freling/anime-image-viewer/internal/image"
)

type Reader struct {
	dbClient        *db.Client
	directoryReader *image.DirectoryReader
}

func NewReader(
	dbClient *db.Client,
	directoryReader *image.DirectoryReader,
) *Reader {
	return &Reader{
		dbClient:        dbClient,
		directoryReader: directoryReader,
	}
}

func (reader Reader) ReadAllTags() ([]Tag, error) {
	allTags, err := db.GetAll[db.Tag](reader.dbClient)
	if err != nil {
		return nil, fmt.Errorf("db.GetAll: %w", err)
	}
	if len(allTags) == 0 {
		return nil, nil
	}
	result := make([]Tag, len(allTags))
	for i, t := range allTags {
		result[i] = Tag{
			ID:   t.ID,
			Name: t.Name,
		}
	}
	return result, nil
}

func (reader Reader) ReadDBTagRecursively(tagID uint) (db.FileTagList, error) {
	fileTags, err := reader.dbClient.FileTag().FindAllByTagIDs([]uint{tagID})
	if err != nil {
		return nil, fmt.Errorf("db.FindAllByTagIDs: %w", err)
	}
	return fileTags, nil
}

func (reader Reader) ReadDirectoryTags(ctx context.Context, directory image.Directory) ([]db.FileTag, error) {
	fileIDs := make([]uint, 0)
	fileIDs = append(fileIDs, directory.ID)
	for _, descendant := range directory.GetDescendants() {
		fileIDs = append(fileIDs, descendant.ID)
	}

	dbFileTagClient := reader.dbClient.FileTag()
	fileTags, err := dbFileTagClient.FindAllByFileID(fileIDs)
	if err != nil {
		return nil, fmt.Errorf("db.FindAllByFileID: %w", err)
	}

	return fileTags, nil
}

func (reader Reader) CreateBatchTagCheckerByFileIDs(
	ctx context.Context,
	fileIDs []uint,
) (BatchImageTagChecker, error) {
	fileTags, err := reader.dbClient.FileTag().FindAllByFileID(fileIDs)
	if err != nil {
		return BatchImageTagChecker{}, fmt.Errorf("db.FindAllByFileID: %w", err)
	}
	if len(fileTags) == 0 {
		return BatchImageTagChecker{}, nil
	}

	imageTagCheckers := make([]ImageTagChecker, 0)
	for _, fileID := range fileIDs {
		imageTagChecker := ImageTagChecker{
			imageFileID: fileID,
		}
		hasImageFileTag := make(map[uint]db.FileTagAddedBy, 0)
		for _, fileTag := range fileTags {
			if fileID != fileTag.FileID {
				continue
			}
			hasImageFileTag[fileTag.TagID] = fileTag.AddedBy
		}
		imageTagChecker.imageFileTags = hasImageFileTag
		imageTagCheckers = append(imageTagCheckers, imageTagChecker)
	}

	return BatchImageTagChecker{
		imageTagCheckers: imageTagCheckers,
	}, nil
}
