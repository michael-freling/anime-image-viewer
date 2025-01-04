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
	rootTag, err := batchImporter.tagReader.ReadRootNode()
	if err != nil {
		return fmt.Errorf("tagReader.ReadAllTagTree: %w", err)
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

		// because tag can be created from a previous image, this cannot run concurrently
		for _, t := range importedImage.xmp.RDF.TagsList {
			if strings.TrimSpace(t) == "" {
				continue OUTER_LOOP
			}
			importedTags := strings.Split(t, "/")
			if len(importedTags) == 0 {
				continue
			}

			// find existing tags by names
			parent := &rootTag
			index := 0
			for ; index < len(importedTags); index++ {
				currentTag := parent.FindChildByName(importedTags[index])
				if currentTag == nil {
					// Not found
					break
				}

				parent = currentTag
			}

			for i := index; i < len(importedTags); i++ {
				if importedTags[i] == "" {
					continue
				}

				dbTag := db.Tag{
					Name:     importedTags[i],
					ParentID: parent.ID,
				}
				if err := tagORMClient.Create(ctx, &dbTag); err != nil {
					return fmt.Errorf("tagORMClient.Create: %w", err)
				}

				newTag := tag.Tag{
					ID:   dbTag.ID,
					Name: importedTags[i],
					// parent id is set only the first new tag
					ParentID: parent.ID,
				}
				// add new tag to a tree so that it can be searched later
				parent.AddChild(&newTag)
				parent = &newTag
			}
			newFileTags = append(newFileTags, db.FileTag{
				FileID:  importedImage.image.ID,
				TagID:   parent.ID,
				AddedBy: db.FileTagAddedByImport,
			})
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
