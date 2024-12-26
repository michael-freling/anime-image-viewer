package image

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"sync/atomic"
	"time"

	"github.com/michael-freling/anime-image-viewer/internal/config"
	"github.com/michael-freling/anime-image-viewer/internal/db"
	"golang.org/x/sync/errgroup"
)

type ExportService struct {
	logger           *slog.Logger
	dbClient         *db.Client
	directoryService *DirectoryService
	tagService       *TagService
}

func NewExportService(logger *slog.Logger, conf config.Config, dbClient *db.Client) *ExportService {
	imageFileService := NewFileService(logger, dbClient)
	directoryService := NewDirectoryService(logger, conf, dbClient, imageFileService)
	tagService := NewTagService(logger, dbClient, directoryService)
	return &ExportService{
		logger:           logger,
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

	if err := service.ExportImages(ctx, exportDirectory, allTags); err != nil {
		return fmt.Errorf("service.ExportImages: %w", err)
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

func (service ExportService) ExportImages(ctx context.Context, rootExportDirectory string, allTags []Tag) error {
	// splits := []string{"train", "validation"}
	splits := []string{"train"}
	for _, split := range splits {
		exportDirectory := filepath.Join(rootExportDirectory, split)
		if err := os.MkdirAll(exportDirectory, 0755); err != nil {
			return fmt.Errorf("os.MkdirAll: %w", err)
		}
	}

	maxTagID := getMaxTagID(allTags)
	rootDirectory, err := service.directoryService.readDirectoryTree()
	if err != nil {
		return fmt.Errorf("readDirectoryTree: %w", err)
	}

	eg, _ := errgroup.WithContext(ctx)
	allImageFiles := make(map[int][]ImageFile, len(rootDirectory.Children))
	for index, directory := range rootDirectory.Children {
		eg.Go(func() error {
			imageFiles, err := service.directoryService.readImageFilesRecursively(*directory)
			if err != nil {
				return fmt.Errorf("readImageFilesRecursively: %w", err)
			}
			allImageFiles[index] = imageFiles

			for _, imageFile := range imageFiles {
				if _, err := os.Stat(imageFile.localFilePath); err != nil {
					return fmt.Errorf("os.Stat: %w for %s", err, imageFile.localFilePath)
				}
				for _, split := range splits {
					destinationFilePath := filepath.Join(rootExportDirectory, split, imageFile.Name)
					if _, err := os.Stat(destinationFilePath); err == nil {
						return fmt.Errorf("file already exists: %s", destinationFilePath)
					}
				}
			}
			return nil
		})
	}
	if err := eg.Wait(); err != nil {
		return fmt.Errorf("validation errors: %w", err)
	}
	service.logger.Info("Validation completed successfully. Start exporting images",
		"exportDirectory", rootExportDirectory)

	allImageFileIDs := make([]uint, 0)
	for _, imageFiles := range allImageFiles {
		for _, imageFile := range imageFiles {
			allImageFileIDs = append(allImageFileIDs, imageFile.ID)
		}
	}

	batchTagChecker, err := service.tagService.createBatchTagCheckerByFileIDs(ctx, allImageFileIDs)
	if err != nil {
		return fmt.Errorf("ReadTagsByFileIDs: %w", err)
	}

	var copiedImageCount int64
	eg, _ = errgroup.WithContext(ctx)
	allMetadata := make([]Metadata, 0)
	for directoryIndex := range rootDirectory.Children {
		imageFiles := allImageFiles[directoryIndex]
		for _, imageFile := range imageFiles {
			metadata := Metadata{
				FileName: imageFile.Name,
				Tags:     make([]float64, maxTagID+1),
			}
			for tagID := range batchTagChecker.getTagCheckerForImageFileID(imageFile.ID).getTagCounts() {
				metadata.Tags[tagID] = 1.0
			}
			allMetadata = append(allMetadata, metadata)

			for _, split := range splits {
				eg.Go(func() error {
					err := service.exportImageFile(imageFile, filepath.Join(rootExportDirectory, split))
					atomic.AddInt64(&copiedImageCount, 1)
					if err != nil {
						return fmt.Errorf("exportImageFile: %w", err)
					}
					return nil
				})
			}
		}
	}
	for _, split := range splits {
		exportDirectory := filepath.Join(rootExportDirectory, split)
		eg.Go(func() error {
			metadataFile, err := os.OpenFile(
				filepath.Join(exportDirectory, "metadata.jsonl"),
				os.O_RDWR|os.O_CREATE|os.O_TRUNC,
				0644,
			)
			if err != nil {
				return fmt.Errorf("os.Open: %w", err)
			}
			defer metadataFile.Close()

			buffer := bufio.NewWriter(metadataFile)
			metadataJsonEncoder := json.NewEncoder(buffer)
			for _, metadata := range allMetadata {
				if err := metadataJsonEncoder.Encode(metadata); err != nil {
					return fmt.Errorf("json.Encode: %w", err)
				}
			}
			if err := buffer.Flush(); err != nil {
				return fmt.Errorf("buffer.Flush: %w", err)
			}
			return nil
		})
	}
	eg.Go(func() error {
		totalCopyImageCount := len(allImageFileIDs) * len(splits)
		for {
			if atomic.LoadInt64(&copiedImageCount) == int64(totalCopyImageCount) {
				break
			}

			select {
			case <-ctx.Done():
				return nil
			case <-time.After(10 * time.Second):
				service.logger.Info("Copying images is in progress",
					"completed", atomic.LoadInt64(&copiedImageCount),
					"total", totalCopyImageCount,
					"percentage", float64(atomic.LoadInt64(&copiedImageCount))/float64(totalCopyImageCount)*100,
				)
			}
		}
		return nil
	})
	if err := eg.Wait(); err != nil {
		return fmt.Errorf("export errors: %w", err)
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
