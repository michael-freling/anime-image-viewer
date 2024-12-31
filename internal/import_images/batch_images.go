package import_images

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"os"
	"path/filepath"

	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/michael-freling/anime-image-viewer/internal/image"
)

type BatchImageImporter struct {
	logger   *slog.Logger
	dbClient *db.Client

	imageFileConverter *image.ImageFileConverter
}

func NewBatchImageImporter(
	logger *slog.Logger,
	dbClient *db.Client,
	directoryReader *image.DirectoryReader,
	imageFileConverter *image.ImageFileConverter,
) *BatchImageImporter {
	return &BatchImageImporter{
		logger:   logger,
		dbClient: dbClient,

		imageFileConverter: imageFileConverter,
	}
}

func (batchImporter *BatchImageImporter) ImportImages(
	ctx context.Context,
	destinationParentDirectory image.Directory,
	paths []string,
) ([]image.ImageFile, error) {
	imageErrors := make([]error, 0)
	newImages := make([]db.File, 0)
	newImagePaths := make([]string, 0)
	for _, sourceFilePath := range paths {
		fileName := filepath.Base(sourceFilePath)
		pathStat, err := os.Stat(sourceFilePath)
		if err != nil {
			imageErrors = append(imageErrors, fmt.Errorf("os.Stat: %w: %s", err, sourceFilePath))
			continue
		}
		if pathStat.IsDir() {
			// if it's a directory, import it recursively
			// todo
			continue
		}
		if err := batchImporter.validateImportImageFile(sourceFilePath, destinationParentDirectory); err != nil {
			imageErrors = append(imageErrors, err)
			continue
		}

		newImages = append(newImages, db.File{
			Name:     fileName,
			ParentID: destinationParentDirectory.ID,
			Type:     db.FileTypeImage,
		})
		newImagePaths = append(newImagePaths, sourceFilePath)
	}
	batchImporter.logger.DebugContext(ctx, "importImageFiles",
		"directory", destinationParentDirectory,
		"paths", paths,
		"newImages", newImages,
		"imageErrors", imageErrors,
	)
	if len(newImages) == 0 {
		return nil, errors.Join(imageErrors...)
	}

	if err := db.BatchCreate(batchImporter.dbClient, newImages); err != nil {
		imageErrors = append(imageErrors, fmt.Errorf("BatchCreate: %w", err))
		return nil, errors.Join(imageErrors...)
	}

	resultImageFiles := make([]image.ImageFile, 0)
	for index, newImage := range newImages {
		sourceFilePath := newImagePaths[index]
		destinationFilePath := filepath.Join(destinationParentDirectory.Path, newImage.Name)
		if _, err := image.Copy(sourceFilePath, destinationFilePath); err != nil {
			imageErrors = append(imageErrors, fmt.Errorf("copy: %w", err))
			continue
		}
		resultImage, err := batchImporter.imageFileConverter.ConvertImageFile(destinationParentDirectory, newImage)
		if err != nil {
			imageErrors = append(imageErrors, fmt.Errorf("convertImageFile: %w", err))
			continue
		}
		resultImageFiles = append(resultImageFiles, resultImage)
	}
	if len(imageErrors) > 0 {
		return resultImageFiles, errors.Join(imageErrors...)
	}

	return resultImageFiles, nil
}

func (service *BatchImageImporter) validateImportImageFile(
	sourceFilePath string,
	destinationDirectory image.Directory,
) error {
	fileName := filepath.Base(sourceFilePath)
	destinationFilePath := filepath.Join(destinationDirectory.Path, fileName)

	if err := image.IsSupportedImageFile(sourceFilePath); err != nil {
		return fmt.Errorf("%w: %s", image.ErrUnsupportedImageFile, sourceFilePath)
	}

	if _, err := os.Stat(destinationFilePath); err == nil {
		return fmt.Errorf("%w: %s", image.ErrFileAlreadyExists, destinationFilePath)
	} else if !errors.Is(err, fs.ErrNotExist) {
		return fmt.Errorf("os.Stat: %w: %s", err, destinationFilePath)
	}

	record, err := db.FindByValue(service.dbClient, &db.File{
		Name:     fileName,
		ParentID: destinationDirectory.ID,
	})
	if err != nil && !errors.Is(err, db.ErrRecordNotFound) {
		return fmt.Errorf("db.FindByValue: %w: %s/%s in DB", err, destinationDirectory.Path, fileName)
	}
	if record.ID != 0 {
		return fmt.Errorf("%w: %s/%s in DB", image.ErrFileAlreadyExists, destinationDirectory.Path, fileName)
	}

	return nil
}
