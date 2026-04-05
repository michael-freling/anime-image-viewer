package image

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestFileCreator_BuildImageFile(t *testing.T) {
	tester := newTester(t)

	fileCreator := tester.newFileCreator(t).
		CreateDirectory(Directory{ID: 1, Name: "dir1"}).
		CreateImage(ImageFile{ID: 10, Name: "image.jpg", ParentID: 1}, TestImageFileJpeg)

	imageFile := fileCreator.BuildImageFile(10)

	assert.Equal(t, uint(10), imageFile.ID)
	assert.Equal(t, "image.jpg", imageFile.Name)
	assert.Equal(t, uint(1), imageFile.ParentID)
	assert.NotEmpty(t, imageFile.LocalFilePath)
	assert.NotEmpty(t, imageFile.Path)
}

func TestFileCreator_BuildImageFile_notFound(t *testing.T) {
	tester := newTester(t)

	fileCreator := tester.newFileCreator(t).
		CreateDirectory(Directory{ID: 1, Name: "dir1"})

	// BuildImageFile of a nonexistent ID returns zero value
	imageFile := fileCreator.BuildImageFile(999)
	assert.Zero(t, imageFile.ID)
}

func TestFileCreator_AddImageCreatedAt(t *testing.T) {
	tester := newTester(t)

	fileCreator := tester.newFileCreator(t).
		CreateDirectory(Directory{ID: 1, Name: "dir1"}).
		CreateImage(ImageFile{ID: 10, Name: "image.jpg", ParentID: 1}, TestImageFileJpeg)

	customTime := time.Date(2023, 6, 15, 12, 0, 0, 0, time.UTC)
	fileCreator.AddImageCreatedAt(10, customTime)

	dbFile := fileCreator.BuildDBImageFile(10)
	assert.Equal(t, uint(customTime.Unix()), dbFile.ImageCreatedAt)
}

func TestFileCreator_CreateImage_none(t *testing.T) {
	tester := newTester(t)

	fileCreator := tester.newFileCreator(t).
		CreateDirectory(Directory{ID: 1, Name: "dir1"}).
		CreateImage(ImageFile{ID: 10, Name: "empty_image.jpg", ParentID: 1}, TestImageFileNone)

	imageFile := fileCreator.BuildImageFile(10)

	assert.Equal(t, uint(10), imageFile.ID)
	assert.Equal(t, "empty_image.jpg", imageFile.Name)
}

func TestFileCreator_BuildDBImageFile(t *testing.T) {
	tester := newTester(t)

	fileCreator := tester.newFileCreator(t).
		CreateDirectory(Directory{ID: 1, Name: "dir1"}).
		CreateImage(ImageFile{ID: 10, Name: "image.jpg", ParentID: 1}, TestImageFileJpeg)

	dbFile := fileCreator.BuildDBImageFile(10)

	assert.Equal(t, uint(10), dbFile.ID)
	assert.Equal(t, "image.jpg", dbFile.Name)
	assert.Equal(t, uint(1), dbFile.ParentID)
	assert.Equal(t, "image", string(dbFile.Type))
	assert.NotZero(t, dbFile.ImageCreatedAt)
}

func TestFileCreator_BuildDBDirectory(t *testing.T) {
	tester := newTester(t)

	fileCreator := tester.newFileCreator(t).
		CreateDirectory(Directory{ID: 1, Name: "dir1"}).
		CreateDirectory(Directory{ID: 2, Name: "subdir", ParentID: 1})

	dbDir := fileCreator.BuildDBDirectory(2)

	assert.Equal(t, uint(2), dbDir.ID)
	assert.Equal(t, "subdir", dbDir.Name)
	assert.Equal(t, uint(1), dbDir.ParentID)
	assert.Equal(t, "directory", string(dbDir.Type))
}

func TestFileCreator_BuildDirectory(t *testing.T) {
	tester := newTester(t)

	fileCreator := tester.newFileCreator(t).
		CreateDirectory(Directory{ID: 1, Name: "dir1"}).
		CreateDirectory(Directory{ID: 2, Name: "subdir", ParentID: 1})

	dir := fileCreator.BuildDirectory(2)

	assert.Equal(t, uint(2), dir.ID)
	assert.Equal(t, "subdir", dir.Name)
	assert.Equal(t, uint(1), dir.ParentID)
	assert.Contains(t, dir.Path, "subdir")
	assert.Equal(t, "dir1/subdir", dir.RelativePath)
}

func TestFileCreator_GetImagePath(t *testing.T) {
	tester := newTester(t)

	fileCreator := tester.newFileCreator(t).
		CreateDirectory(Directory{ID: 1, Name: "dir1"}).
		CreateImage(ImageFile{ID: 10, Name: "image.jpg", ParentID: 1}, TestImageFileJpeg)

	parentDir := fileCreator.BuildDirectory(1)
	imageFile := fileCreator.BuildImageFile(10)

	path := fileCreator.GetImagePath(parentDir, imageFile)

	assert.Equal(t, "/files/dir1/image.jpg", path)
}

func TestNewFileCreator(t *testing.T) {
	creator := NewFileCreator(t, "/tmp/test")

	require.NotNil(t, creator)
	assert.Equal(t, "/tmp/test", creator.localFilePrefix)
	assert.Equal(t, "/files", creator.staticFilePrefix)
}
