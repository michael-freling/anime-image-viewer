package image

import (
	"path/filepath"
	"testing"

	"github.com/michael-freling/anime-image-viewer/internal/db"
)

type FileBuilder struct {
	staticFilePrefix string
	localFilePrefix  string

	directories        map[uint]Directory
	localDirectoryPath map[uint]string
	imageFiles         map[uint]ImageFile
}

func NewFileBuilder(localFilePrefix string) *FileBuilder {
	return &FileBuilder{
		localFilePrefix:  localFilePrefix,
		staticFilePrefix: "/files",

		localDirectoryPath: map[uint]string{},
		directories:        map[uint]Directory{},
		imageFiles:         map[uint]ImageFile{},
	}
}

func (builder *FileBuilder) AddDirectory(directory Directory) *FileBuilder {
	if directory.ParentID != 0 {
		parent := builder.directories[directory.ParentID]
		directory.Path = filepath.Join(parent.Path, directory.Name)
		directory.RelativePath = filepath.Join(parent.RelativePath, directory.Name)
	} else {
		directory.Path = filepath.Join(builder.localFilePrefix, directory.Name)
		directory.RelativePath = directory.Name
	}

	builder.directories[directory.ID] = directory
	return builder
}

func (builder *FileBuilder) AddImageFile(imageFile ImageFile) *FileBuilder {
	if imageFile.ParentID != 0 {
		parentDirectory := builder.directories[imageFile.ParentID]
		imageFile.LocalFilePath = filepath.Join(parentDirectory.Path, imageFile.Name)
		imageFile.Path = filepath.Join(builder.staticFilePrefix, parentDirectory.RelativePath, imageFile.Name)
	}

	builder.imageFiles[imageFile.ID] = imageFile
	return builder
}

func (builder FileBuilder) BuildDirectory(id uint) Directory {
	return builder.directories[id]
}

func (builder FileBuilder) BuildDBDirectory(t *testing.T, id uint) db.File {
	directory, ok := builder.directories[id]
	if !ok {
		t.Fatalf("directory %d not found", id)
	}
	return db.File{
		ID:       directory.ID,
		Name:     directory.Name,
		ParentID: directory.ParentID,
		Type:     db.FileTypeDirectory,
	}
}

func (builder FileBuilder) BuildImageFile(id uint) ImageFile {
	return builder.imageFiles[id]
}

func (builder FileBuilder) BuildDBImageFile(t *testing.T, id uint) db.File {
	imageFile, ok := builder.imageFiles[id]
	if !ok {
		t.Fatalf("image file %d not found", id)
	}

	return db.File{
		ID:       imageFile.ID,
		Name:     imageFile.Name,
		ParentID: imageFile.ParentID,
		Type:     db.FileTypeImage,
	}
}
