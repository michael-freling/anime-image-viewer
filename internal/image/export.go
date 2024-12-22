package image

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"

	"github.com/michael-freling/anime-image-viewer/internal/config"
	"github.com/michael-freling/anime-image-viewer/internal/db"
	"golang.org/x/sync/errgroup"
)

type ExportService struct {
	dbClient         *db.Client
	directoryService *DirectoryService
	tagService       *TagService
}

func NewExportService(logger *slog.Logger, conf config.Config, dbClient *db.Client) *ExportService {
	imageFileService := NewFileService(logger, dbClient)
	directoryService := NewDirectoryService(logger, conf, dbClient, imageFileService)
	tagService := NewTagService(logger, dbClient, directoryService)
	return &ExportService{
		dbClient:         dbClient,
		directoryService: directoryService,
		tagService:       tagService,
	}
}

// This is compatible with transformers' metadata
// See https://huggingface.co/docs/datasets/video_dataset
type Metadata struct {
	FileName string    `json:"file_name"`
	Tags     []float64 `json:"tags"`
}

func (service ExportService) ExportAll(ctx context.Context, exportDirectory string) error {
	// imageFileService := image.NewFileService(logger, dbClient)
	// imageDirectoryService := image.NewDirectoryService(logger, conf, dbClient, imageFileService)
	allTags, err := service.tagService.GetAll()
	if err != nil {
		return fmt.Errorf("tagService.GetAll: %w", err)
	}
	alLTagsMarshaled, err := json.Marshal(allTags)
	if err != nil {
		return fmt.Errorf("json.Marshal: %w", err)
	}

	eg, childCtx := errgroup.WithContext(ctx)
	for _, split := range []string{"train", "validation"} {
		eg.Go(func() error {
			exportDirectory := filepath.Join(exportDirectory, split)
			if err := service.ExportImages(childCtx, exportDirectory, allTags); err != nil {
				return fmt.Errorf("service.ExportAll: %w", err)
			}
			return nil
		})
	}
	if err := eg.Wait(); err != nil {
		return fmt.Errorf("eg.Wait: %w", err)
	}

	file, err := os.Create(exportDirectory + "/tags.json")
	if err != nil {
		return fmt.Errorf("os.Create: %w", err)
	}
	defer file.Close()
	_, err = file.Write(alLTagsMarshaled)
	if err != nil {
		return fmt.Errorf("file.Write: %w", err)
	}
	return nil
}

func (service ExportService) ExportImages(ctx context.Context, exportDirectory string, allTags []Tag) error {
	if err := os.MkdirAll(exportDirectory, 0755); err != nil {
		return fmt.Errorf("os.MkdirAll: %w", err)
	}
	metadataFile, err := os.OpenFile(
		filepath.Join(exportDirectory, "metadata.jsonl"),
		os.O_RDWR|os.O_CREATE|os.O_TRUNC,
		0644,
	)
	if err != nil {
		return fmt.Errorf("os.Open: %w", err)
	}
	defer metadataFile.Close()
	metadataJsonEncoder := json.NewEncoder(metadataFile)

	maxTagID := getMaxTagID(allTags)
	rootDirectory, err := service.directoryService.readDirectoryTree()
	if err != nil {
		return fmt.Errorf("readDirectoryTree: %w", err)
	}

	validationErrors := make([]error, 0)
	for _, directory := range rootDirectory.Children {
		imageFiles, err := service.directoryService.readImageFilesRecursively(directory)
		if err != nil {
			validationErrors = append(validationErrors, fmt.Errorf("readImageFilesRecursively: %w", err))
		}

		for _, imageFile := range imageFiles {
			if _, err := os.Stat(imageFile.localFilePath); err != nil {
				validationErrors = append(validationErrors, fmt.Errorf("os.Stat: %w for %s", err, imageFile.localFilePath))
			}
			destinationFilePath := fmt.Sprintf("%s/%s", exportDirectory, imageFile.Name)
			if _, err := os.Stat(destinationFilePath); err == nil {
				validationErrors = append(validationErrors, fmt.Errorf("file already exists: %s", destinationFilePath))
			}
		}
	}
	if len(validationErrors) > 0 {
		return fmt.Errorf("validation errors: %w", errors.Join(validationErrors...))
	}

	exportErrors := make([]error, 0)
	for _, directory := range rootDirectory.Children {
		imageFiles, err := service.directoryService.readImageFilesRecursively(directory)
		if err != nil {
			exportErrors = append(exportErrors, fmt.Errorf("readImageFilesRecursively: %w", err))
		}

		imageFileIDs := make([]uint, 0)
		for _, imageFile := range imageFiles {
			imageFileIDs = append(imageFileIDs, imageFile.ID)
		}
		response, err := service.tagService.ReadTagsByFileIDs(ctx, imageFileIDs)
		if err != nil {
			exportErrors = append(exportErrors, fmt.Errorf("ReadTagsByFileIDs: %w", err))
		}

		for _, imageFile := range imageFiles {
			if err := service.exportImageFile(imageFile, exportDirectory); err != nil {
				exportErrors = append(exportErrors, err)
			}

			tags := response.tagsMap[imageFile.ID]
			metadata := Metadata{
				FileName: imageFile.Name,
				Tags:     make([]float64, maxTagID+1),
			}
			for _, tag := range tags {
				metadata.Tags[tag.ID] = 1.0
			}
			if err := metadataJsonEncoder.Encode(metadata); err != nil {
				exportErrors = append(exportErrors, fmt.Errorf("json.Encode: %w", err))
			}
		}
	}
	if len(exportErrors) > 0 {
		return fmt.Errorf("export errors: %w", errors.Join(exportErrors...))
	}

	return nil
}

func (service *ExportService) exportImageFile(imageFile ImageFile, exportDirectory string) error {
	destinationFilePath := fmt.Sprintf("%s/%s", exportDirectory, imageFile.Name)
	if _, err := copy(imageFile.localFilePath, destinationFilePath); err != nil {
		return fmt.Errorf("copy: %w", err)
	}

	return nil
}
