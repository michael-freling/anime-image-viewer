package frontend

import (
	"context"
	"fmt"
	"log/slog"
	"os"

	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/michael-freling/anime-image-viewer/internal/image"
	"github.com/wailsapp/wails/v3/pkg/application"
)

type ImageService struct {
	imageReader *image.Reader
	dbClient    *db.Client
}

func NewImageService(imageReader *image.Reader, dbClient *db.Client) *ImageService {
	return &ImageService{
		imageReader: imageReader,
		dbClient:    dbClient,
	}
}

func (service *ImageService) ReadImagesByIDs(ctx context.Context, imageIDs []uint) (map[uint]image.ImageFile, error) {
	list, err := service.imageReader.ReadImagesByIDs(imageIDs)
	if err != nil {
		return nil, err
	}
	return list.ToMap(), nil
}

func (service *ImageService) OpenImageInOS(ctx context.Context, imageID uint) error {
	imageFiles, err := service.imageReader.ReadImagesByIDs([]uint{imageID})
	if err != nil {
		return fmt.Errorf("ReadImagesByIDs: %w", err)
	}
	if len(imageFiles) == 0 {
		return fmt.Errorf("image not found: %d", imageID)
	}

	app := application.Get()
	return app.BrowserOpenFile(imageFiles[0].LocalFilePath)
}

// ShowImageInExplorer opens the system file explorer with the image's file
// selected. On Windows this uses `explorer /select,`, on macOS `open -R`,
// and on Linux `xdg-open` on the parent directory.
func (service *ImageService) ShowImageInExplorer(ctx context.Context, imageID uint) error {
	imageFiles, err := service.imageReader.ReadImagesByIDs([]uint{imageID})
	if err != nil {
		return fmt.Errorf("ReadImagesByIDs: %w", err)
	}
	if len(imageFiles) == 0 {
		return fmt.Errorf("image not found: %d", imageID)
	}

	return showInExplorer(imageFiles[0].LocalFilePath)
}

// DeleteImages removes images from the database and from disk.
// It deletes all associated tag and character links within a transaction,
// then removes the file records, and finally deletes the physical files
// from disk (best-effort: missing files are logged and skipped).
func (service *ImageService) DeleteImages(ctx context.Context, imageIDs []uint) error {
	if len(imageIDs) == 0 {
		return nil
	}

	// Resolve file paths before deleting DB records. This is best-effort:
	// if the reader fails (e.g. files already missing from disk), we still
	// proceed with the DB deletion and skip disk cleanup.
	imageFiles, err := service.imageReader.ReadImagesByIDs(imageIDs)
	if err != nil {
		slog.Warn("ReadImagesByIDs failed during delete; will skip disk cleanup",
			"error", err,
		)
		imageFiles = nil
	}

	// Delete DB records in a transaction.
	if err := db.NewTransaction(ctx, service.dbClient, func(txCtx context.Context) error {
		if err := service.dbClient.FileTag().DeleteByFileIDs(txCtx, imageIDs); err != nil {
			return fmt.Errorf("DeleteByFileIDs (tags): %w", err)
		}
		if err := service.dbClient.FileCharacter().DeleteByFileIDs(txCtx, imageIDs); err != nil {
			return fmt.Errorf("DeleteByFileIDs (characters): %w", err)
		}
		if err := service.dbClient.File().DeleteByIDs(txCtx, imageIDs); err != nil {
			return fmt.Errorf("DeleteByIDs: %w", err)
		}
		return nil
	}); err != nil {
		return fmt.Errorf("transaction: %w", err)
	}

	// Delete physical files (best-effort after successful DB transaction).
	for _, imgFile := range imageFiles {
		if imgFile.LocalFilePath == "" {
			continue
		}
		if err := os.Remove(imgFile.LocalFilePath); err != nil && !os.IsNotExist(err) {
			slog.Warn("failed to delete image file from disk",
				"path", imgFile.LocalFilePath,
				"error", err,
			)
		}
	}

	return nil
}

type Image struct {
	ID     uint   `json:"id"`
	Name   string `json:"name"`
	Path   string `json:"path"`
	Width  uint   `json:"width"`
	Height uint   `json:"height"`
}

type imageConverter struct {
	converted Image
}

func newImageConverterFromImageFiles(imageFile image.ImageFile) *imageConverter {
	return &imageConverter{
		converted: Image{
			ID:     imageFile.ID,
			Name:   imageFile.Name,
			Path:   imageFile.Path,
			Width:  imageFile.Width,
			Height: imageFile.Height,
		},
	}
}

func (converter *imageConverter) Convert() Image {
	return converter.converted
}

type batchImageConverter struct {
	imageFiles []image.ImageFile
}

func newBatchImageConverter(imageFiles []image.ImageFile) *batchImageConverter {
	return &batchImageConverter{
		imageFiles: imageFiles,
	}
}

func (converter batchImageConverter) Convert() []Image {
	images := make([]Image, len(converter.imageFiles))
	for i, imageFile := range converter.imageFiles {
		images[i] = newImageConverterFromImageFiles(imageFile).
			Convert()
	}
	return images
}
