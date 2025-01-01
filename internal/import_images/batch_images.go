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
	"golang.org/x/sync/errgroup"
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
	progressNotifier *ProgressNotifier,
) ([]image.ImageFile, error) {
	validator := newBatchImportImageValidator(
		batchImporter.dbClient,
		progressNotifier,
	)
	newImages, newImagePaths, err := validator.validateImages(
		ctx,
		paths,
		destinationParentDirectory,
	)
	if err != nil {
		// unexpected error occurred and not to keep running the process
		return nil, fmt.Errorf("validateImages: %w", err)
	}
	batchImporter.logger.DebugContext(ctx, "importImageFiles",
		"directory", destinationParentDirectory,
		"paths", paths,
		"newImages", newImages,
	)
	if len(newImages) == 0 {
		return nil, errors.Join(progressNotifier.FailedErrors...)
	}

	if err := db.BatchCreate(batchImporter.dbClient, newImages); err != nil {
		return nil, errors.Join(
			fmt.Errorf("BatchCreate: %w", err),
			errors.Join(progressNotifier.FailedErrors...),
		)
	}

	eg, _ := errgroup.WithContext(ctx)
	resultImageFiles := make([]image.ImageFile, len(newImages))
	for index, newImage := range newImages {
		sourceFilePath := newImagePaths[index]
		destinationFilePath := filepath.Join(destinationParentDirectory.Path, newImage.Name)

		eg.Go(func() error {
			if _, err := image.Copy(sourceFilePath, destinationFilePath); err != nil {
				progressNotifier.addFailure(sourceFilePath, fmt.Errorf("image.copy: %w", err))
				return nil
			}
			resultImage, err := batchImporter.imageFileConverter.ConvertImageFile(destinationParentDirectory, newImage)
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
	paths []string,
	destinationParentDirectory image.Directory,
) (
	[]db.File,
	[]string,
	error,
) {
	newImages := make([]db.File, len(paths))
	newImagePaths := make([]string, len(paths))

	eg, _ := errgroup.WithContext(ctx)
	for index, sourceFilePath := range paths {
		eg.Go(func() error {
			fileName := filepath.Base(sourceFilePath)
			pathStat, err := os.Stat(sourceFilePath)
			if err != nil {
				batchValidator.progressNotifier.addFailure(sourceFilePath,
					fmt.Errorf("os.Stat: %w: %s", err, sourceFilePath),
				)
				return nil
			}
			if pathStat.IsDir() {
				// if it's a directory, import it recursively
				// todo
				return nil
			}
			if err := batchValidator.validateImportImageFile(sourceFilePath, destinationParentDirectory); err != nil {
				batchValidator.progressNotifier.addFailure(sourceFilePath, err)
				return nil
			}

			newImages[index] = db.File{
				Name:     fileName,
				ParentID: destinationParentDirectory.ID,
				Type:     db.FileTypeImage,
			}
			newImagePaths[index] = sourceFilePath
			return nil
		})
	}
	if err := eg.Wait(); err != nil {
		return nil, nil, errors.Join(
			fmt.Errorf("errgroup.Wait: %w", err),
			errors.Join(batchValidator.progressNotifier.FailedErrors...),
		)
	}

	// filter failed images
	resultImages := make([]db.File, 0, len(newImages))
	resultImagePaths := make([]string, 0, len(newImagePaths))
	for index := range newImages {
		if newImagePaths[index] == "" {
			continue
		}

		resultImages = append(resultImages, newImages[index])
		resultImagePaths = append(resultImagePaths, newImagePaths[index])
	}
	return resultImages, resultImagePaths, nil
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
