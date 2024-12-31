package frontend

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/michael-freling/anime-image-viewer/internal/image"
	"github.com/michael-freling/anime-image-viewer/internal/import_images"
	"github.com/wailsapp/wails/v3/pkg/application"
)

type BatchImportImageService struct {
	logger *slog.Logger

	directoryReader    *image.DirectoryReader
	batchImageImporter *import_images.BatchImageImporter
}

func NewBatchImportImageService(
	logger *slog.Logger,
	reader *image.DirectoryReader,
	batchImageImporter *import_images.BatchImageImporter,
) *BatchImportImageService {
	return &BatchImportImageService{
		logger: logger,

		directoryReader:    reader,
		batchImageImporter: batchImageImporter,
	}
}

type ImportProgressEventFailure struct {
	Path  string `json:"path"`
	Error string `json:"error"`
}
type ImportProgressEvent struct {
	Total     int                          `json:"total"`
	Completed int                          `json:"completed"`
	Failed    int                          `json:"failed"`
	Failures  []ImportProgressEventFailure `json:"failures"`
}

// ImportImages imports images from the selected paths in a dialog shown in this method
// This method emits an ImportImages:progress event to show the progress of importing images on the frontend
func (service BatchImportImageService) ImportImages(ctx context.Context, directoryID uint) ([]Image, error) {
	directory, err := service.directoryReader.ReadDirectory(directoryID)
	if err != nil {
		return nil, fmt.Errorf("service.ReadDirectory: %w", err)
	}

	paths, err := application.OpenFileDialog().
		// CanChooseFiles(true).
		// CanChooseDirectories(true).

		// This image filter doesn't work on WSL
		AddFilter("Images", "*.jpg;*.jpeg;*.png").
		AddFilter("All files", "*").
		AttachToWindow(application.Get().CurrentWindow()).
		PromptForMultipleSelection()
	if err != nil {
		return nil, fmt.Errorf("application.OpenFileDialog: %w", err)
	}
	if len(paths) == 0 {
		return nil, nil
	}

	app := application.Get()
	service.logger.DebugContext(ctx, "ImportImages",
		"directory", directory.Path,
		"selectedPaths", paths,
	)
	images, err := service.batchImageImporter.ImportImages(ctx, directory, paths, func(progressEvent import_images.ProgressEvent) {
		failures := make([]ImportProgressEventFailure, 0)
		for i, path := range progressEvent.FailedPath {
			failures = append(failures, ImportProgressEventFailure{
				Path:  path,
				Error: progressEvent.FailedErrors[i].Error(),
			})
		}

		app.EmitEvent("ImportImages:progress", ImportProgressEvent{
			Total:     progressEvent.Total,
			Completed: progressEvent.Completed,
			Failed:    progressEvent.Failed,
			Failures:  failures,
		})
	})
	if err != nil {
		return nil, fmt.Errorf("service.batchImageImporter.ImportImages: %w", err)
	}
	return newBatchImageConverter(images).Convert(), nil
}
