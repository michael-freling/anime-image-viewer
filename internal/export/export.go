package export

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
	"github.com/michael-freling/anime-image-viewer/internal/image"
	"github.com/michael-freling/anime-image-viewer/internal/tag"
	"golang.org/x/sync/errgroup"
)

type BatchImageExporter struct {
	logger          *slog.Logger
	dbClient        *db.Client
	directoryReader *image.DirectoryReader
	tagReader       *tag.Reader
	options         BatchImageExporterOptions
}

type BatchImageExporterOptions struct {
	IsDirectoryTagExcluded bool
	progressSleepDuration  time.Duration
}

func NewBatchImageExporter(logger *slog.Logger, conf config.Config, dbClient *db.Client, options BatchImageExporterOptions) *BatchImageExporter {
	directoryReader := image.NewDirectoryReader(conf, dbClient)
	tagReader := tag.NewReader(
		dbClient,
		directoryReader,
	)

	if options.progressSleepDuration == 0 {
		options.progressSleepDuration = 10 * time.Second
	}
	return &BatchImageExporter{
		logger:          logger,
		dbClient:        dbClient,
		directoryReader: directoryReader,
		tagReader:       tagReader,
		options:         options,
	}
}

// This is compatible with transformers' metadata
// See https://huggingface.co/docs/datasets/video_dataset
type Metadata struct {
	FileName string    `json:"file_name"`
	Tags     []float64 `json:"tags"`
}

func (batchExporter BatchImageExporter) Export(ctx context.Context, exportDirectory string) error {
	// imageFileService := image.NewFileService(logger, dbClient)
	// imageDirectoryService := image.NewDirectoryService(logger, conf, dbClient, imageFileService)
	allTags, err := batchExporter.tagReader.ReadAllTags()
	if err != nil {
		return fmt.Errorf("tagReader.ReadAllTags: %w", err)
	}
	alLTagsMarshaled, err := json.Marshal(allTags)
	if err != nil {
		return fmt.Errorf("json.Marshal: %w", err)
	}

	if err := batchExporter.ExportImages(ctx, exportDirectory, allTags); err != nil {
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

func (batchExporter BatchImageExporter) ExportImages(ctx context.Context, rootExportDirectory string, allTags []tag.Tag) error {
	const trainSplit = "train"
	splits := []string{trainSplit}
	for _, split := range splits {
		exportDirectory := filepath.Join(rootExportDirectory, split)
		if err := os.MkdirAll(exportDirectory, 0755); err != nil {
			return fmt.Errorf("os.MkdirAll: %w", err)
		}
	}

	maxTagID := tag.GetMaxTagID(allTags)
	rootDirectory, err := batchExporter.directoryReader.ReadDirectoryTree()
	if err != nil {
		return fmt.Errorf("readDirectoryTree: %w", err)
	}

	eg, _ := errgroup.WithContext(ctx)
	allImageFiles := make(map[int][]image.ImageFile, len(rootDirectory.Children))
	for index, directory := range rootDirectory.Children {
		eg.Go(func() error {
			imageFiles, err := batchExporter.directoryReader.ReadImageFilesRecursively(*directory)
			if err != nil {
				return fmt.Errorf("readImageFilesRecursively: %w", err)
			}
			allImageFiles[index] = imageFiles
			return nil
		})
	}
	if err := eg.Wait(); err != nil {
		return fmt.Errorf("validation errors: %w", err)
	}

	allImageFileIDs := make([]uint, 0)
	for _, imageFiles := range allImageFiles {
		for _, imageFile := range imageFiles {
			allImageFileIDs = append(allImageFileIDs, imageFile.ID)
		}
	}
	batchTagChecker, err := batchExporter.tagReader.CreateBatchTagCheckerByFileIDs(ctx, allImageFileIDs)
	if err != nil {
		return fmt.Errorf("ReadTagsByFileIDs: %w", err)
	}

	allImages := make([]image.ImageFile, 0)
	allImageFileIDs = make([]uint, 0)
	for _, imageFiles := range allImageFiles {
		for _, imageFile := range imageFiles {
			tagChecker := batchTagChecker.GetTagCheckerForImageFileID(imageFile.ID)
			if !tagChecker.HasAnyTag() {
				// remove an image without any tag is removed from the dataset
				continue
			}
			if batchExporter.options.IsDirectoryTagExcluded && !tagChecker.HasDirectTag() {
				// prevent not to export an image if it is not tagged or a tag is added by an ancestor
				continue
			}

			allImages = append(allImages, imageFile)
			allImageFileIDs = append(allImageFileIDs, imageFile.ID)
		}
	}

	eg, _ = errgroup.WithContext(ctx)
	for _, imageFile := range allImages {
		eg.Go(func() error {
			if _, err := os.Stat(imageFile.LocalFilePath); err != nil {
				return fmt.Errorf("os.Stat: %w for %s", err, imageFile.LocalFilePath)
			}
			for _, split := range splits {
				destinationFilePath := filepath.Join(rootExportDirectory, split, imageFile.Name)
				if _, err := os.Stat(destinationFilePath); err == nil {
					return fmt.Errorf("file already exists: %s", destinationFilePath)
				}
			}

			return nil
		})
	}
	if err := eg.Wait(); err != nil {
		return fmt.Errorf("validation errors: %w", err)
	}

	batchExporter.logger.Info("Validation completed successfully. Start exporting images",
		"exportDirectory", rootExportDirectory)

	var copiedImageCount int64
	eg, _ = errgroup.WithContext(ctx)
	allMetadata := make(map[string][]Metadata, 0)
	for _, imageFile := range allImages {
		metadata := Metadata{
			FileName: imageFile.Name,
			Tags:     make([]float64, maxTagID+1),
		}

		split := trainSplit
		for tagID := range batchTagChecker.GetTagCheckerForImageFileID(imageFile.ID).GetTagMap() {
			metadata.Tags[tagID] = 1.0
		}

		allMetadata[split] = append(allMetadata[split], metadata)
		imageFile := imageFile
		eg.Go(func() error {
			err := batchExporter.exportImageFile(imageFile, filepath.Join(rootExportDirectory, split))
			atomic.AddInt64(&copiedImageCount, 1)
			if err != nil {
				return fmt.Errorf("exportImageFile: %w", err)
			}
			return nil
		})
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
			case <-time.After(batchExporter.options.progressSleepDuration):
				batchExporter.logger.Info("Copying images is in progress",
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

func (batchExporter *BatchImageExporter) exportImageFile(imageFile image.ImageFile, exportDirectory string) error {
	destinationFilePath := fmt.Sprintf("%s/%s", exportDirectory, imageFile.Name)
	if _, err := image.Copy(imageFile.LocalFilePath, destinationFilePath); err != nil {
		return fmt.Errorf("copy: %w", err)
	}

	return nil
}
