package frontend

import (
	"fmt"

	"github.com/michael-freling/anime-image-viewer/internal/image"
)

type Directory struct {
	ID       uint        `json:"id"`
	Name     string      `json:"name"`
	Path     string      `json:"path"`
	Children []Directory `json:"children"`
}

type directoryConverter struct {
}

func newDirectoryConverter() directoryConverter {
	return directoryConverter{}
}

func (converter directoryConverter) convertDirectory(directory image.Directory) Directory {
	children := make([]Directory, 0, len(directory.Children))
	for _, child := range directory.Children {
		children = append(children, converter.convertDirectory(*child))
	}

	return Directory{
		ID:       directory.ID,
		Name:     directory.Name,
		Path:     directory.Path,
		Children: children,
	}
}

type DirectoryService struct {
	directoryReader *image.DirectoryReader
}

func NewDirectoryService(directoryReader *image.DirectoryReader) *DirectoryService {
	return &DirectoryService{
		directoryReader: directoryReader,
	}
}

func (service DirectoryService) ReadDirectoryTree() (Directory, error) {
	directory, err := service.directoryReader.ReadDirectoryTree()
	if err != nil {
		return Directory{}, fmt.Errorf("service.directoryReader.ReadDirectoryTree: %w", err)
	}

	return newDirectoryConverter().convertDirectory(directory), nil
}
