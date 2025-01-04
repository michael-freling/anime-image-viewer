package image

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/stretchr/testify/require"
)

type FileCreator struct {
	staticFilePrefix string
	localFilePrefix  string

	directories        map[uint]Directory
	localDirectoryPath map[uint]string
	imageFiles         map[uint]ImageFile

	imageCreatedAtMap map[uint]time.Time
}

func NewFileCreator(localFilePrefix string) *FileCreator {
	return &FileCreator{
		localFilePrefix:  localFilePrefix,
		staticFilePrefix: "/files",

		localDirectoryPath: map[uint]string{},
		directories:        map[uint]Directory{},
		imageFiles:         map[uint]ImageFile{},
		imageCreatedAtMap:  map[uint]time.Time{},
	}
}

func (creator *FileCreator) CreateDirectory(t *testing.T, directory Directory) *FileCreator {
	if directory.ParentID != 0 {
		parent := creator.directories[directory.ParentID]
		directory.Path = filepath.Join(parent.Path, directory.Name)
		directory.RelativePath = filepath.Join(parent.RelativePath, directory.Name)
	} else {
		directory.Path = filepath.Join(creator.localFilePrefix, directory.Name)
		directory.RelativePath = directory.Name
	}

	require.NoError(t, os.MkdirAll(directory.Path, 0755))

	creator.directories[directory.ID] = directory
	return creator
}

type TestImageFile string

const (
	TestImageFileNone     TestImageFile = ""
	TestImageFileJpeg     TestImageFile = "image.jpg"
	TestImageFilePng      TestImageFile = "image.png"
	TestImageFileNonImage TestImageFile = "image.txt"
)

func (creator *FileCreator) GetImagePath(parentDirectory Directory, imageFile ImageFile) string {
	return filepath.Join(creator.staticFilePrefix, parentDirectory.RelativePath, imageFile.Name)
}

func (creator *FileCreator) CreateImage(t *testing.T, imageFile ImageFile, source TestImageFile) *FileCreator {
	require.NotZero(t, imageFile.ParentID)
	parentDirectory := creator.directories[imageFile.ParentID]
	imageFile.LocalFilePath = filepath.Join(parentDirectory.Path, imageFile.Name)
	imageFile.Path = creator.GetImagePath(parentDirectory, imageFile)

	if source != TestImageFileNone {
		sourceFilePath := filepath.Join("..", "..", "testdata", string(source))
		destinationFilePath := imageFile.LocalFilePath
		_, err := Copy(
			sourceFilePath,
			destinationFilePath,
		)
		require.NoError(t, err)
		sourceStat, err := os.Stat(imageFile.LocalFilePath)
		require.NoError(t, err)
		destinationStat, err := os.Stat(destinationFilePath)
		require.NoError(t, err)
		require.Equal(t, sourceStat, destinationStat)

		creator.imageCreatedAtMap[imageFile.ID] = sourceStat.ModTime()
	}

	creator.imageFiles[imageFile.ID] = imageFile
	return creator
}

func (creator FileCreator) BuildDirectory(id uint) Directory {
	return creator.directories[id]
}

func (creator FileCreator) BuildDBDirectory(t *testing.T, id uint) db.File {
	directory, ok := creator.directories[id]
	require.True(t, ok, "directory %d not found", id)
	return db.File{
		ID:       directory.ID,
		Name:     directory.Name,
		ParentID: directory.ParentID,
		Type:     db.FileTypeDirectory,
	}
}

func (creator FileCreator) BuildImageFile(id uint) ImageFile {
	return creator.imageFiles[id]
}

func (creator FileCreator) AddImageCreatedAt(t *testing.T, id uint, imageCreatedAt time.Time) {
	require.Contains(t, creator.imageFiles, id, "image file %d not found", id)
	creator.imageCreatedAtMap[id] = imageCreatedAt
}

func (creator FileCreator) BuildDBImageFile(t *testing.T, id uint) db.File {
	require.Contains(t, creator.imageFiles, id, "image file %d not found", id)

	createdAt := time.Date(2021, 1, 1, 0, 0, 0, 0, time.UTC).AddDate(0, 0, int(id))

	imageFile, ok := creator.imageFiles[id]
	require.True(t, ok, "image file %d not found", id)

	result := db.File{
		ID:        imageFile.ID,
		Name:      imageFile.Name,
		ParentID:  imageFile.ParentID,
		Type:      db.FileTypeImage,
		CreatedAt: uint(createdAt.Unix()),
	}
	if imageStat, ok := creator.imageCreatedAtMap[id]; ok {
		result.ImageCreatedAt = uint(imageStat.Unix())
	}

	return result
}
