package image

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"slices"

	"github.com/wailsapp/wails/v3/pkg/application"
)

type Service struct {
	ctx context.Context
}

type Directory struct {
	Name        string
	Path        string
	IsDirectory bool
	Children    []Directory
}

func (service *Service) OnStartup(ctx context.Context, options application.ServiceOptions) error {
	service.ctx = ctx
	return nil
}

func (service *Service) ReadInitialDirectory() (string, error) {
	return "/mnt/d/private/anime/images", nil
	// TODO: load an initial directroy from the past result
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("os.UserHomeDir: %w", err)
	}
	return home + "/Downloads", nil
}

func (service *Service) ReadChildDirectoriesRecursively(directoryPath string) ([]Directory, error) {
	entries, err := os.ReadDir(directoryPath)
	if err != nil {
		return nil, fmt.Errorf("os.ReadDir: %w", err)
	}

	errors := make([]error, 0)
	result := make([]Directory, 0, len(entries))
	for _, entry := range entries {
		filename := entry.Name()
		if !entry.IsDir() {
			continue
		}

		children, err := service.ReadChildDirectoriesRecursively(filepath.Join(directoryPath, filename))
		if err != nil {
			errors = append(errors, err)
			continue
		}

		result = append(result, Directory{
			Name:        filename,
			Path:        filepath.Join(directoryPath, filename),
			IsDirectory: entry.IsDir(),
			Children:    children,
		})
	}
	if len(errors) > 0 {
		return result, fmt.Errorf("failed to read some directories: %v", errors)
	}
	return result, nil
}

type ImageFile struct {
	Name        string
	Path        string
	ContentType string
}

var (
	supportedContentTypes = []string{
		"image/jpeg",
		"image/png",
	}
)

func getContentType(file *os.File) (string, error) {
	// https://stackoverflow.com/a/38175140
	data := make([]byte, 512)
	_, err := file.Read(data)
	if err != nil {
		return "", fmt.Errorf("file.Read: %w", err)
	}
	return http.DetectContentType(data), nil
}

func (service *Service) ReadImageFiles(directoryPath string) ([]ImageFile, error) {
	entries, err := os.ReadDir(directoryPath)
	if err != nil {
		return nil, fmt.Errorf("os.ReadDir: %w", err)
	}

	errors := make([]error, 0)
	result := make([]ImageFile, 0, len(entries))
	for _, entry := range entries {
		filename := entry.Name()
		if entry.IsDir() {
			continue
		}
		filePath := filepath.Join(directoryPath, filename)
		file, err := os.Open(filePath)
		if err != nil {
			errors = append(errors, fmt.Errorf("os.Open: %w", err))
			continue
		}
		defer file.Close()

		contentType, err := getContentType(file)
		if err != nil {
			errors = append(errors, err)
			continue
		}
		slog.DebugContext(service.ctx,
			"the content type of a file",
			"contentType", contentType,
			"filePath", filePath,
		)
		if !slices.Contains(supportedContentTypes, contentType) {
			continue
		}

		result = append(result, ImageFile{
			Name:        filename,
			Path:        filePath,
			ContentType: contentType,
		})
	}
	if len(errors) > 0 {
		return result, fmt.Errorf("failed to read some image files: %v", errors)
	}
	return result, nil
}
