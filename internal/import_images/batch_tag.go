package import_images

import (
	"context"
	"fmt"
	"strings"

	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/michael-freling/anime-image-viewer/internal/tag"
)

type batchTagImporter struct {
	dbClient  *db.Client
	tagReader *tag.Reader
}

func newBatchTagImporter(dbClient *db.Client, tagReader *tag.Reader) batchTagImporter {
	return batchTagImporter{
		dbClient:  dbClient,
		tagReader: tagReader,
	}
}

func (batchImporter batchTagImporter) importTags(
	ctx context.Context,
	importedImages []importImage,
) error {
	allTags, err := batchImporter.tagReader.ReadAllTags()
	if err != nil {
		return fmt.Errorf("tagReader.ReadAllTags: %w", err)
	}

	// Build a name-to-tag map for dedup
	tagByName := make(map[string]*tag.Tag)
	for i := range allTags {
		tagByName[allTags[i].Name] = &allTags[i]
	}

	tagORMClient := batchImporter.dbClient.Tag()
	newFileTags := make([]db.FileTag, 0)
OUTER_LOOP:
	for _, importedImage := range importedImages {
		if importedImage.image.ID == 0 {
			continue
		}
		if importedImage.xmp == nil {
			continue
		}

		for _, t := range importedImage.xmp.RDF.TagsList {
			if strings.TrimSpace(t) == "" {
				continue OUTER_LOOP
			}
			importedTags := strings.Split(t, "/")
			if len(importedTags) == 0 {
				continue
			}

			// Create all tags in the path as flat tags
			for _, tagName := range importedTags {
				if tagName == "" {
					continue
				}
				if _, exists := tagByName[tagName]; exists {
					continue
				}
				dbTag := db.Tag{
					Name: tagName,
				}
				if err := tagORMClient.Create(ctx, &dbTag); err != nil {
					return fmt.Errorf("tagORMClient.Create: %w", err)
				}
				newTag := tag.Tag{
					ID:   dbTag.ID,
					Name: tagName,
				}
				tagByName[tagName] = &newTag
			}

			// Tag the image with the leaf tag (last in path)
			leafTagName := importedTags[len(importedTags)-1]
			if leafTagName == "" && len(importedTags) > 1 {
				leafTagName = importedTags[len(importedTags)-2]
			}
			if leafTag, ok := tagByName[leafTagName]; ok {
				newFileTags = append(newFileTags, db.FileTag{
					FileID:  importedImage.image.ID,
					TagID:   leafTag.ID,
					AddedBy: db.FileTagAddedByImport,
				})
			}
		}
	}
	if len(newFileTags) == 0 {
		return nil
	}

	if err := batchImporter.dbClient.FileTag().BatchCreate(ctx, newFileTags); err != nil {
		return fmt.Errorf("FileTag.BatchCreate: %w", err)
	}
	return nil
}
