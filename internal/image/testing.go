package image

import (
	"path/filepath"
	"strings"
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

		parentLocalFilePath := builder.localDirectoryPath[directory.ParentID]
		builder.localDirectoryPath[directory.ID] = filepath.Join(parentLocalFilePath, directory.Name)
	} else {
		directory.Path = filepath.Join(builder.localFilePrefix, directory.Name)
		builder.localDirectoryPath[directory.ID] = filepath.Join(builder.localFilePrefix, directory.Name)
	}

	builder.directories[directory.ID] = directory
	return builder
}

func (builder *FileBuilder) AddImageFile(imageFile ImageFile) *FileBuilder {
	if imageFile.ParentID != 0 {
		parentLocalFilePath := builder.localDirectoryPath[imageFile.ParentID]
		imageFile.LocalFilePath = filepath.Join(parentLocalFilePath, imageFile.Name)

		// todo: workaround
		imageFile.Path = "/files" + strings.TrimPrefix(imageFile.LocalFilePath, builder.localFilePrefix)
		// filepath.Join(parent.Path, imageFile.Name)
	}

	builder.imageFiles[imageFile.ID] = imageFile
	return builder
}

func (builder FileBuilder) BuildDirectory(id uint) Directory {
	return builder.directories[id]
}

func (builder FileBuilder) BuildImageFile(id uint) ImageFile {
	return builder.imageFiles[id]
}
