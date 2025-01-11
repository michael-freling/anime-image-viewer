package frontend

import (
	"testing"

	"github.com/michael-freling/anime-image-viewer/internal/image"
)

type fileCreator struct {
	*image.FileCreator

	directoryChildrenMap map[uint][]image.Directory
}

func (creator *fileCreator) CreateDirectory(t *testing.T, directory image.Directory) *fileCreator {
	creator.FileCreator.CreateDirectory(t, directory)
	if _, ok := creator.directoryChildrenMap[directory.ParentID]; !ok {
		creator.directoryChildrenMap[directory.ParentID] = make([]image.Directory, 0)
	}
	creator.directoryChildrenMap[directory.ParentID] = append(creator.directoryChildrenMap[directory.ParentID], directory)
	return creator
}

func (creator fileCreator) buildFrontendDirectory(id uint) Directory {
	directory := creator.BuildDirectory(id)

	var children []Directory
	if len(creator.directoryChildrenMap[id]) > 0 {
		children = make([]Directory, len(creator.directoryChildrenMap[id]))
		for i, child := range creator.directoryChildrenMap[id] {
			children[i] = creator.buildFrontendDirectory(child.ID)
		}
	}

	return Directory{
		ID:       directory.ID,
		Name:     directory.Name,
		Path:     directory.Path,
		Children: children,
	}
}

func (builder fileCreator) buildFrontendImage(id uint) Image {
	image := builder.BuildImageFile(id)
	return Image{
		ID:   image.ID,
		Name: image.Name,
		Path: image.Path,
	}
}
