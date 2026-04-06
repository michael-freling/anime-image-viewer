package frontend

import (
	"bufio"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/michael-freling/anime-image-viewer/internal/backup"
	"github.com/michael-freling/anime-image-viewer/internal/config"
	"github.com/michael-freling/anime-image-viewer/internal/image"
)

type StaticFileService struct {
	rootDirectory  string
	fileServer     http.Handler
	logger         *slog.Logger
	imageResizer   *image.Resizer
	restoreService *backup.RestoreService
}

func NewStaticFileService(
	logger *slog.Logger,
	conf config.Config,
	restoreService *backup.RestoreService,
) *StaticFileService {
	return &StaticFileService{
		rootDirectory:  conf.ImageRootDirectory,
		fileServer:     http.FileServer(http.Dir(conf.ImageRootDirectory)),
		logger:         logger,
		imageResizer:   image.NewResizer(logger),
		restoreService: restoreService,
	}
}

func (service StaticFileService) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	localImageFilePath, width, err := service.validateRequest(r)
	if err != nil {
		// If the file is not found, attempt restore before returning an error
		if service.restoreService != nil && os.IsNotExist(err) {
			relPath, relErr := filepath.Rel(service.rootDirectory, filepath.Join(service.rootDirectory, r.URL.Path))
			if relErr == nil {
				if restoreErr := service.tryRestore(r, relPath); restoreErr == nil {
					// Re-validate after successful restore
					localImageFilePath, width, err = service.validateRequest(r)
				}
			}
		}
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
	}

	ctx := r.Context()

	if width == 0 {
		// Full-size image: validate before serving
		if err := image.ValidateImageFile(localImageFilePath); err != nil {
			service.logger.WarnContext(ctx, "corrupted image detected",
				"localImageFilePath", localImageFilePath,
				"error", err,
			)
			if restoreErr := service.tryRestoreAndValidate(r, localImageFilePath); restoreErr != nil {
				http.Error(w, fmt.Sprintf("image corrupted and restore failed: %v", restoreErr), http.StatusInternalServerError)
				return
			}
		}
		service.fileServer.ServeHTTP(w, r)
		return
	}

	encoder, err := service.imageResizer.ResizeImage(
		ctx,
		localImageFilePath,
		width,
	)
	if err != nil {
		// Attempt restore on decode errors
		service.logger.WarnContext(ctx, "ResizeImage failed, attempting restore",
			"localImageFilePath", localImageFilePath,
			"error", err,
		)
		if restoreErr := service.tryRestoreAndValidate(r, localImageFilePath); restoreErr != nil {
			service.logger.ErrorContext(ctx, "restore failed after ResizeImage error",
				"localImageFilePath", localImageFilePath,
				"restoreError", restoreErr,
			)
			http.Error(w, fmt.Sprintf("image corrupted and restore failed: %v", restoreErr), http.StatusInternalServerError)
			return
		}
		// Retry resize after successful restore
		encoder, err = service.imageResizer.ResizeImage(ctx, localImageFilePath, width)
		if err != nil {
			service.logger.ErrorContext(ctx, "ResizeImage failed after restore",
				"localImageFilePath", localImageFilePath,
				"error", err,
			)
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}
	bufWriter := bufio.NewWriter(w)
	defer bufWriter.Flush()
	if err := encoder.Encode(bufWriter); err != nil {
		service.logger.ErrorContext(ctx, "Encode",
			"error", err,
		)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

// tryRestoreAndValidate computes the relative path of localImageFilePath and
// attempts to restore it from backup.
func (service StaticFileService) tryRestoreAndValidate(r *http.Request, localImageFilePath string) error {
	if service.restoreService == nil {
		return fmt.Errorf("no restore service configured")
	}

	relPath, err := filepath.Rel(service.rootDirectory, localImageFilePath)
	if err != nil {
		return fmt.Errorf("compute relative path: %w", err)
	}

	return service.tryRestore(r, relPath)
}

// tryRestore attempts to restore a single file from backup using its relative path.
func (service StaticFileService) tryRestore(r *http.Request, relPath string) error {
	if service.restoreService == nil {
		return fmt.Errorf("no restore service configured")
	}

	ctx := r.Context()
	service.logger.InfoContext(ctx, "attempting to restore file from backup",
		"relativeFilePath", relPath,
	)

	if err := service.restoreService.RestoreSingleFile(ctx, relPath, service.rootDirectory); err != nil {
		return fmt.Errorf("restore single file: %w", err)
	}

	service.logger.InfoContext(ctx, "file restored successfully from backup",
		"relativeFilePath", relPath,
	)
	return nil
}

func (service StaticFileService) validateRequest(r *http.Request) (string, int, error) {
	// check if a localImageFilePath is under the root directory
	localImageFilePath := filepath.Join(service.rootDirectory, r.URL.Path)
	if !strings.HasPrefix(localImageFilePath, service.rootDirectory) {
		return "", 0, fmt.Errorf("forbidden path: %s", r.URL.Path)
	}
	if _, err := os.Stat(localImageFilePath); err != nil {
		return "", 0, err
	}

	widthStr := r.URL.Query().Get("width")
	var width int64
	if widthStr == "" {
		return localImageFilePath, 0, nil
	}
	width, err := strconv.ParseInt(widthStr, 10, 64)
	if err != nil {
		return "", 0, fmt.Errorf("invalid width: %w", err)
	}
	if width > 4000 {
		return "", 0, fmt.Errorf("width must be less than 4000")
	}
	return localImageFilePath, int(width), nil
}
