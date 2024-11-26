package image

import (
	"fmt"
	"os"
	"path/filepath"
)

type Service struct{}

type Directory struct {
	Name        string
	Path        string
	IsDirectory bool
	Children    []Directory
}

func (service *Service) ReadInitialDirectory() (string, error) {
	// TODO: load an initial directroy from the past result
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("os.UserHomeDir: %w", err)
	}
	return home + "/Downloads", nil
}

func (service *Service) FindChildDirectoriesRecursively(path string) ([]Directory, error) {
	entries, err := os.ReadDir(path)
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

		children, err := service.FindChildDirectoriesRecursively(filepath.Join(path, filename))
		if err != nil {
			errors = append(errors, err)
			continue
		}

		result = append(result, Directory{
			Name:        filename,
			Path:        filepath.Join(path, filename),
			IsDirectory: entry.IsDir(),
			Children:    children,
		})
	}
	if len(errors) > 0 {
		return result, fmt.Errorf("failed to read some directories: %v", errors)
	}
	return result, nil
}
