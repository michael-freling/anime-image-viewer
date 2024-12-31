package image

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/stretchr/testify/require"
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

func (builder *FileBuilder) AddDirectory(t *testing.T, directory Directory) *FileBuilder {
	if directory.ParentID != 0 {
		parent := builder.directories[directory.ParentID]
		directory.Path = filepath.Join(parent.Path, directory.Name)
		directory.RelativePath = filepath.Join(parent.RelativePath, directory.Name)
	} else {
		directory.Path = filepath.Join(builder.localFilePrefix, directory.Name)
		directory.RelativePath = directory.Name
	}

	require.NoError(t, os.MkdirAll(directory.Path, 0755))

	builder.directories[directory.ID] = directory
	return builder
}

type TestImageFile string

const (
	TestImageFileNone     TestImageFile = ""
	TestImageFileJpeg     TestImageFile = "image.jpg"
	TestImageFilePng      TestImageFile = "image.png"
	TestImageFileNonImage TestImageFile = "image.txt"
)

func (builder *FileBuilder) AddImageFile(t *testing.T, imageFile ImageFile, source TestImageFile) *FileBuilder {
	require.NotZero(t, imageFile.ParentID)
	parentDirectory := builder.directories[imageFile.ParentID]
	imageFile.LocalFilePath = filepath.Join(parentDirectory.Path, imageFile.Name)
	imageFile.Path = filepath.Join(builder.staticFilePrefix, parentDirectory.RelativePath, imageFile.Name)

	if source != TestImageFileNone {
		_, err := Copy(
			filepath.Join("..", "..", "testdata", string(source)),
			imageFile.LocalFilePath,
		)
		require.NoError(t, err)
	}

	builder.imageFiles[imageFile.ID] = imageFile
	return builder
}

func (builder FileBuilder) BuildDirectory(id uint) Directory {
	return builder.directories[id]
}

func (builder FileBuilder) BuildDBDirectory(t *testing.T, id uint) db.File {
	directory, ok := builder.directories[id]
	require.True(t, ok, "directory %d not found", id)
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
	createdAt := time.Date(2021, 1, 1, 0, 0, 0, 0, time.UTC).AddDate(0, 0, int(id))

	imageFile, ok := builder.imageFiles[id]
	require.True(t, ok, "image file %d not found", id)

	return db.File{
		ID:        imageFile.ID,
		Name:      imageFile.Name,
		ParentID:  imageFile.ParentID,
		Type:      db.FileTypeImage,
		CreatedAt: uint(createdAt.Unix()),
	}
}
