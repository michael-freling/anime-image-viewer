package import_images

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/michael-freling/anime-image-viewer/internal/image"
	"github.com/michael-freling/anime-image-viewer/internal/tag"
	"golang.org/x/sync/errgroup"
)

type importImage struct {
	image          db.File
	sourceFilePath string
	xmp            *XMP
}

type BatchImageImporter struct {
	logger   *slog.Logger
	dbClient *db.Client

	imageFileConverter *image.ImageFileConverter
	tagReader          *tag.Reader
}

func NewBatchImageImporter(
	logger *slog.Logger,
	dbClient *db.Client,
	imageFileConverter *image.ImageFileConverter,
	tagReader *tag.Reader,
) *BatchImageImporter {
	return &BatchImageImporter{
		logger:   logger,
		dbClient: dbClient,

		imageFileConverter: imageFileConverter,
		tagReader:          tagReader,
	}
}

func (batchImporter *BatchImageImporter) readImageFilePaths(
	ctx context.Context,
	paths []string,
	destinationParentDirectory image.Directory,
	progressNotifier *ProgressNotifier,
) (
	[]importImage,
	error,
) {
	importImages := make([]importImage, len(paths))

	xmpReader := newXMPReader(batchImporter.dbClient)
	eg, _ := errgroup.WithContext(ctx)
	for index, sourceFilePath := range paths {
		eg.Go(func() error {
			pathStat, err := os.Stat(sourceFilePath)
			if err != nil {
				progressNotifier.addFailure(sourceFilePath,
					fmt.Errorf("os.Stat: %w: %s", err, sourceFilePath),
				)
				return nil
			}
			if pathStat.IsDir() {
				// if it's a directory, import it recursively
				// todo
				return nil
			}

			// read XMP files
			xmpFile, err := xmpReader.read(sourceFilePath + ".xmp")
			if err != nil && !os.IsNotExist(err) {
				batchImporter.logger.InfoContext(ctx, "failed to read a XMP file for an image",
					"error", err,
					"image", sourceFilePath,
				)
			}

			importImage := importImage{
				image: db.File{
					Name:     filepath.Base(sourceFilePath),
					ParentID: destinationParentDirectory.ID,
					Type:     db.FileTypeImage,
				},
				sourceFilePath: sourceFilePath,
				xmp:            xmpFile,
			}
			importImages[index] = importImage
			return nil
		})
	}
	if err := eg.Wait(); err != nil {
		// this is unexpected error and shouldn't happen
		return nil, errors.Join(
			fmt.Errorf("errgroup.Wait: %w", err),
			errors.Join(progressNotifier.FailedErrors...),
		)
	}

	// filter failed images
	result := make([]importImage, 0, len(importImages))
	for _, importImage := range importImages {
		if importImage.sourceFilePath == "" {
			continue
		}

		result = append(result, importImage)
	}
	return result, nil

}

func (batchImporter *BatchImageImporter) ImportImages(
	ctx context.Context,
	destinationParentDirectory image.Directory,
	paths []string,
	progressNotifier *ProgressNotifier,
) ([]image.ImageFile, error) {
	importedImages, err := batchImporter.readImageFilePaths(ctx, paths, destinationParentDirectory, progressNotifier)
	if err != nil {
		return nil, fmt.Errorf("readImageFilePaths: %w", err)
	}

	validator := newBatchImportImageValidator(
		batchImporter.dbClient,
		progressNotifier,
	)
	newImportedImages, err := validator.validateImages(
		ctx,
		importedImages,
		destinationParentDirectory,
	)
	if err != nil {
		// unexpected error occurred and not to keep running the process
		return nil, fmt.Errorf("validateImages: %w", err)
	}
	batchImporter.logger.DebugContext(ctx, "importImageFiles",
		"directory", destinationParentDirectory,
		"newImages", newImportedImages,
	)
	if len(newImportedImages) == 0 {
		return nil, errors.Join(progressNotifier.FailedErrors...)
	}

	if err := db.NewTransaction(ctx, batchImporter.dbClient, func(ctx context.Context) error {
		files := make([]db.File, len(newImportedImages))
		for index, newImage := range newImportedImages {
			files[index] = newImage.image
		}

		if err := batchImporter.dbClient.File().BatchCreate(ctx, files); err != nil {
			return fmt.Errorf("BatchCreate: %w", err)
		}
		// set an id back
		for index := range newImportedImages {
			newImportedImages[index].image.ID = files[index].ID
		}

		tagImporter := newBatchTagImporter(batchImporter.dbClient, batchImporter.tagReader)
		if err := tagImporter.importTags(ctx, newImportedImages); err != nil {
			return fmt.Errorf("importTags: %w", err)
		}

		return nil
	}); err != nil {
		return nil, errors.Join(
			fmt.Errorf("NewTransaction: %w", err),
			errors.Join(progressNotifier.FailedErrors...),
		)
	}

	eg, _ := errgroup.WithContext(ctx)
	resultImageFiles := make([]image.ImageFile, len(newImportedImages))
	for index, newImage := range newImportedImages {
		sourceFilePath := newImportedImages[index].sourceFilePath
		destinationFilePath := filepath.Join(destinationParentDirectory.Path, newImage.image.Name)

		eg.Go(func() error {
			if _, err := image.Copy(sourceFilePath, destinationFilePath); err != nil {
				progressNotifier.addFailure(sourceFilePath, fmt.Errorf("image.copy: %w", err))
				return nil
			}
			resultImage, err := batchImporter.imageFileConverter.ConvertImageFile(destinationParentDirectory, newImage.image)
			if err != nil {
				progressNotifier.addFailure(sourceFilePath, fmt.Errorf("convertImageFile: %w", err))
				return nil
			}

			resultImageFiles[index] = resultImage
			progressNotifier.addSuccess()
			return nil
		})
	}
	if err := eg.Wait(); err != nil {
		return nil, errors.Join(
			fmt.Errorf("errgroup.Wait: %w", err),
			errors.Join(progressNotifier.FailedErrors...),
		)
	}
	if len(progressNotifier.FailedErrors) > 0 {
		return resultImageFiles, errors.Join(progressNotifier.FailedErrors...)
	}

	return resultImageFiles, nil
}

type ProgressNotifier struct {
	Completed    int
	Failed       int
	FailedPaths  []string
	FailedErrors []error

	successMutex sync.Mutex
	failureMutex sync.Mutex
}

func NewProgressNotifier() *ProgressNotifier {
	return &ProgressNotifier{
		FailedPaths:  make([]string, 0),
		FailedErrors: make([]error, 0),
	}
}

func (notifier *ProgressNotifier) addSuccess() {
	notifier.successMutex.Lock()
	notifier.Completed++
	notifier.successMutex.Unlock()
}

func (notifier *ProgressNotifier) addFailure(path string, err error) {
	notifier.failureMutex.Lock()
	notifier.Failed++
	notifier.FailedPaths = append(notifier.FailedPaths, path)
	notifier.FailedErrors = append(notifier.FailedErrors, err)
	notifier.failureMutex.Unlock()
}

func (notifier *ProgressNotifier) Run(done <-chan struct{}, progressCallback func()) {
	isEnded := false
	for !isEnded {
		select {
		case <-done:
			isEnded = true
		case <-time.After(1 * time.Second):
		}

		progressCallback()
	}
}

type batchImportImageValidator struct {
	dbClient         *db.Client
	progressNotifier *ProgressNotifier
}

func newBatchImportImageValidator(dbClient *db.Client, progressNotifier *ProgressNotifier) batchImportImageValidator {
	return batchImportImageValidator{
		dbClient:         dbClient,
		progressNotifier: progressNotifier,
	}
}

func (batchValidator batchImportImageValidator) validateImages(
	ctx context.Context,
	sourceImageFilePaths []importImage,
	destinationParentDirectory image.Directory,
) (
	[]importImage,
	error,
) {
	validatedImages := make([]importImage, len(sourceImageFilePaths))
	eg, _ := errgroup.WithContext(ctx)
	for index, importImage := range sourceImageFilePaths {
		eg.Go(func() error {
			sourceFilePath := importImage.sourceFilePath
			if err := batchValidator.validateImportImageFile(sourceFilePath, destinationParentDirectory); err != nil {
				batchValidator.progressNotifier.addFailure(sourceFilePath, err)
				return nil
			}

			validatedImages[index] = importImage
			return nil
		})
	}
	if err := eg.Wait(); err != nil {
		return nil, errors.Join(
			fmt.Errorf("errgroup.Wait: %w", err),
			errors.Join(batchValidator.progressNotifier.FailedErrors...),
		)
	}

	// filter failed images
	resultImages := make([]importImage, 0, len(validatedImages))
	for index := range validatedImages {
		if validatedImages[index].sourceFilePath == "" {
			continue
		}

		resultImages = append(resultImages, validatedImages[index])
	}
	return resultImages, nil
}

func (validator *batchImportImageValidator) validateImportImageFile(
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

	record, err := db.FindByValue(validator.dbClient, &db.File{
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
