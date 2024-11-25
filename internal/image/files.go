package image

import (
	"fmt"
	"os"
	"path/filepath"
)

type Service struct{}

type FileInfo struct {
	Name        string
	Path        string
	IsDirectory bool
}

func (service *Service) ReadInitialDirectory() (string, error) {
	// TODO: load an initial directroy from the past result
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("os.UserHomeDir: %w", err)
	}
	return home, nil
}

func (service *Service) ReadDirectory(path string) ([]FileInfo, error) {
	entries, err := os.ReadDir(path)
	if err != nil {
		return nil, fmt.Errorf("os.ReadDir: %w", err)
	}

	result := make([]FileInfo, 0, len(entries))
	for _, entry := range entries {
		filename := entry.Name()

		result = append(result, FileInfo{
			Name:        filename,
			Path:        filepath.Join(path, filename),
			IsDirectory: entry.IsDir(),
		})
	}
	return result, nil
}
