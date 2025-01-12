package export

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"math/rand"
	"os"
	"path/filepath"
	"sync/atomic"
	"time"

	"github.com/michael-freling/anime-image-viewer/internal/config"
	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/michael-freling/anime-image-viewer/internal/image"
	"github.com/michael-freling/anime-image-viewer/internal/tag"
	"golang.org/x/sync/errgroup"
)

type BatchImageExporter struct {
	logger          *slog.Logger
	dbClient        *db.Client
	directoryReader *image.DirectoryReader
	tagReader       *tag.Reader
}

func NewBatchImageExporter(logger *slog.Logger, conf config.Config, dbClient *db.Client) *BatchImageExporter {
	directoryReader := image.NewDirectoryReader(conf, dbClient)
	tagReader := tag.NewReader(
		dbClient,
		directoryReader,
	)

	return &BatchImageExporter{
		logger:          logger,
		dbClient:        dbClient,
		directoryReader: directoryReader,
		tagReader:       tagReader,
	}
}

// This is compatible with transformers' metadata
// See https://huggingface.co/docs/datasets/video_dataset
type Metadata struct {
	FileName string    `json:"file_name"`
	Tags     []float64 `json:"tags"`
}

func (service BatchImageExporter) ExportAll(ctx context.Context, exportDirectory string) error {
	// imageFileService := image.NewFileService(logger, dbClient)
	// imageDirectoryService := image.NewDirectoryService(logger, conf, dbClient, imageFileService)
	allTags, err := service.tagReader.ReadAllTags()
	if err != nil {
		return fmt.Errorf("tagReader.ReadAllTags: %w", err)
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

func (service BatchImageExporter) ExportImages(ctx context.Context, rootExportDirectory string, allTags []tag.Tag) error {
	const trainSplit = "train"
	const validationSplit = "validation"
	splits := []string{trainSplit, validationSplit}
	for _, split := range splits {
		exportDirectory := filepath.Join(rootExportDirectory, split)
		if err := os.MkdirAll(exportDirectory, 0755); err != nil {
			return fmt.Errorf("os.MkdirAll: %w", err)
		}
	}

	maxTagID := tag.GetMaxTagID(allTags)
	rootDirectory, err := service.directoryReader.ReadDirectoryTree()
	if err != nil {
		return fmt.Errorf("readDirectoryTree: %w", err)
	}

	eg, _ := errgroup.WithContext(ctx)
	allImageFiles := make(map[int][]image.ImageFile, len(rootDirectory.Children))
	for index, directory := range rootDirectory.Children {
		eg.Go(func() error {
			imageFiles, err := service.directoryReader.ReadImageFilesRecursively(*directory)
			if err != nil {
				return fmt.Errorf("readImageFilesRecursively: %w", err)
			}
			allImageFiles[index] = imageFiles

			for _, imageFile := range imageFiles {
				if _, err := os.Stat(imageFile.LocalFilePath); err != nil {
					return fmt.Errorf("os.Stat: %w for %s", err, imageFile.LocalFilePath)
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

	batchTagChecker, err := service.tagReader.CreateBatchTagCheckerByFileIDs(ctx, allImageFileIDs)
	if err != nil {
		return fmt.Errorf("ReadTagsByFileIDs: %w", err)
	}

	var copiedImageCount int64
	eg, _ = errgroup.WithContext(ctx)
	allMetadata := make(map[string][]Metadata, 0)
	for directoryIndex := range rootDirectory.Children {
		imageFiles := allImageFiles[directoryIndex]
		for _, imageFile := range imageFiles {
			metadata := Metadata{
				FileName: imageFile.Name,
				Tags:     make([]float64, maxTagID+1),
			}

			split := ""
			for tagID, addedBy := range batchTagChecker.GetTagCheckerForImageFileID(imageFile.ID).GetTagMap() {
				if addedBy == db.FileTagAddedBySuggestion {
					split = trainSplit
				}
				metadata.Tags[tagID] = 1.0
			}
			if split == "" {
				odd := rand.Intn(100)
				if odd < 80 {
					split = trainSplit
				} else {
					split = validationSplit
				}
			}

			allMetadata[split] = append(allMetadata[split], metadata)
			imageFile := imageFile
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
			for _, metadata := range allMetadata[split] {
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
		totalCopyImageCount := len(allImageFileIDs)
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

func (service *BatchImageExporter) exportImageFile(imageFile image.ImageFile, exportDirectory string) error {
	destinationFilePath := fmt.Sprintf("%s/%s", exportDirectory, imageFile.Name)
	if _, err := image.Copy(imageFile.LocalFilePath, destinationFilePath); err != nil {
		return fmt.Errorf("copy: %w", err)
	}

	return nil
}
