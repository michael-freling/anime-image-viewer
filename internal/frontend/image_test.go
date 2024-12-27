package frontend

import (
	"path/filepath"
)

type fileBuilder struct {
	directories map[uint]Directory
	imageFiles  map[uint]Image
}

// todo: consolidate fileBuilder with internal/image/files_test.go
func newFileBuilder() *fileBuilder {
	return &fileBuilder{
		directories: map[uint]Directory{},
		imageFiles:  map[uint]Image{},
	}
}

func (builder *fileBuilder) addDirectory(directory Directory) *fileBuilder {
	if directory.ParentID != 0 {
		parent := builder.directories[directory.ParentID]
		directory.Path = filepath.Join(parent.Path, directory.Name)
	} else {
		directory.Path = filepath.Join("/files", directory.Name)
	}

	builder.directories[directory.ID] = directory
	return builder
}

func (builder *fileBuilder) addImage(imageFile Image) *fileBuilder {
	if imageFile.parentID != 0 {
		parent := builder.directories[imageFile.parentID]
		imageFile.Path = filepath.Join(parent.Path, imageFile.Name)
	}

	builder.imageFiles[imageFile.ID] = imageFile
	return builder
}

func (builder fileBuilder) buildImage(id uint) Image {
	return builder.imageFiles[id]
}
