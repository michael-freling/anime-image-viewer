package frontend

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/michael-freling/anime-image-viewer/internal/image"
	"github.com/michael-freling/anime-image-viewer/internal/import_images"
	"github.com/wailsapp/wails/v3/pkg/application"
)

type ImportService struct {
	logger *slog.Logger

	directoryReader    *image.DirectoryReader
	batchImageImporter *import_images.BatchImageImporter
}

func NewImportService(
	logger *slog.Logger,
	reader *image.DirectoryReader,
	batchImageImporter *import_images.BatchImageImporter,
) *ImportService {
	return &ImportService{
		logger: logger,

		directoryReader:    reader,
		batchImageImporter: batchImageImporter,
	}
}

func (service ImportService) ImportImages(ctx context.Context, directoryID uint) ([]image.ImageFile, error) {
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

	service.logger.DebugContext(ctx, "ImportImages",
		"directory", directory.Path,
		"selectedPaths", paths,
	)

	return service.batchImageImporter.ImportImages(ctx, directory, paths)
}
