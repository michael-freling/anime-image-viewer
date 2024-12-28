package frontend

import (
	"fmt"
	"path/filepath"

	"github.com/michael-freling/anime-image-viewer/internal/db"
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

func (builder fileBuilder) buildDBDirectory(id uint) db.File {
	dir, ok := builder.directories[id]
	if !ok {
		panic(fmt.Errorf("image not found: %d", id))
	}

	return db.File{
		ID:       dir.ID,
		Name:     dir.Name,
		Type:     db.FileTypeDirectory,
		ParentID: dir.ParentID,
	}
}

func (builder fileBuilder) buildImage(id uint) Image {
	result, ok := builder.imageFiles[id]
	if !ok {
		panic(fmt.Errorf("image not found: %d", id))
	}
	return result
}

func (builder fileBuilder) buildImages() []Image {
	result := make([]Image, 0, len(builder.imageFiles))
	for id := range builder.imageFiles {
		result = append(result, builder.buildImage(id))
	}
	return result
}

func (builder fileBuilder) buildDBImage(id uint) db.File {
	image := builder.imageFiles[id]
	return db.File{
		ID:       image.ID,
		Name:     image.Name,
		Type:     db.FileTypeImage,
		ParentID: image.parentID,
	}
}
