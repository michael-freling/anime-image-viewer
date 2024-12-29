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

	"github.com/michael-freling/anime-image-viewer/internal/config"
	"github.com/michael-freling/anime-image-viewer/internal/image"
)

type StaticFileService struct {
	rootDirectory string
	// fileServer    http.Handler
	logger       *slog.Logger
	imageResizer *image.Resizer
}

func NewStaticFileService(
	logger *slog.Logger,
	conf config.Config,
) *StaticFileService {
	return &StaticFileService{
		rootDirectory: conf.ImageRootDirectory,
		// fileServer:    http.FileServer(http.Dir(conf.ImageRootDirectory)),
		logger:       logger,
		imageResizer: image.NewResizer(logger),
	}
}

func (service StaticFileService) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	localImageFilePath, width, err := service.validateRequest(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	ctx := r.Context()
	encoder, err := service.imageResizer.ResizeImage(
		ctx,
		localImageFilePath,
		width,
	)
	if err != nil {
		service.logger.ErrorContext(ctx, "ResizeImage",
			"localImageFilePath", localImageFilePath,
			"error", err,
		)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
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

func (service StaticFileService) validateRequest(r *http.Request) (string, int, error) {
	widthStr := r.URL.Query().Get("width")
	if widthStr == "" {
		return "", 0, fmt.Errorf("width parameter is required")
	}
	width, err := strconv.ParseInt(widthStr, 10, 64)
	if err != nil {
		return "", 0, fmt.Errorf("invalid width: %w", err)
	}
	if width > 4000 {
		return "", 0, fmt.Errorf("width must be less than 4000")
	}

	// check if a localImageFilePath is under the root directory
	localImageFilePath := filepath.Join(service.rootDirectory, r.URL.Path)
	if !strings.HasPrefix(localImageFilePath, service.rootDirectory) {
		return "", 0, fmt.Errorf("forbidden path: %s", r.URL.Path)
	}
	if _, err := os.Stat(localImageFilePath); err != nil {
		return "", 0, fmt.Errorf("image was not found")
	}

	return localImageFilePath, int(width), nil
}
