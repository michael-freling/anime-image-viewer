package image

import (
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"testing"

	"github.com/michael-freling/anime-image-viewer/internal/config"
	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDecodeImageDimensions(t *testing.T) {
	t.Run("valid jpeg file", func(t *testing.T) {
		tmpDir := t.TempDir()
		filePath := createTestJPEGFile(t, tmpDir, "test.jpg", 200, 150)

		width, height, err := DecodeImageDimensions(filePath)

		assert.NoError(t, err)
		assert.Equal(t, uint(200), width)
		assert.Equal(t, uint(150), height)
	})

	t.Run("valid png file", func(t *testing.T) {
		tmpDir := t.TempDir()
		filePath := createTestPNGFile(t, tmpDir, "test.png", 300, 250)

		width, height, err := DecodeImageDimensions(filePath)

		assert.NoError(t, err)
		assert.Equal(t, uint(300), width)
		assert.Equal(t, uint(250), height)
	})

	t.Run("non-existent file returns error", func(t *testing.T) {
		_, _, err := DecodeImageDimensions("/nonexistent/path/image.jpg")

		assert.Error(t, err)
		assert.True(t, os.IsNotExist(err))
	})

	t.Run("corrupted non-image file returns error", func(t *testing.T) {
		tmpDir := t.TempDir()
		filePath := filepath.Join(tmpDir, "not_an_image.txt")
		require.NoError(t, os.WriteFile(filePath, []byte("this is not an image"), 0644))

		_, _, err := DecodeImageDimensions(filePath)

		assert.Error(t, err)
	})

	t.Run("empty file returns error", func(t *testing.T) {
		tmpDir := t.TempDir()
		filePath := filepath.Join(tmpDir, "empty.jpg")
		require.NoError(t, os.WriteFile(filePath, []byte{}, 0644))

		_, _, err := DecodeImageDimensions(filePath)

		assert.Error(t, err)
	})
}

func TestBackfillImageDimensions(t *testing.T) {
	t.Run("nothing to do when all images have dimensions", func(t *testing.T) {
		logger := slog.New(slog.NewTextHandler(io.Discard, nil))
		dbClient := db.NewTestClient(t)
		dbClient.Truncate(t, db.File{})

		imageRootDir := t.TempDir()
		conf := config.Config{ImageRootDirectory: imageRootDir}

		w := uint(100)
		h := uint(200)
		db.LoadTestData(t, dbClient, []db.File{
			{ID: 1, Name: "photos", ParentID: 0, Type: db.FileTypeDirectory},
			{ID: 2, Name: "img.jpg", ParentID: 1, Type: db.FileTypeImage, ImageWidth: &w, ImageHeight: &h},
		})

		err := BackfillImageDimensions(logger, dbClient.Client, conf)
		assert.NoError(t, err)
	})

	t.Run("backfills dimensions for images with NULL dimensions", func(t *testing.T) {
		logger := slog.New(slog.NewTextHandler(io.Discard, nil))
		dbClient := db.NewTestClient(t)
		dbClient.Truncate(t, db.File{})

		imageRootDir := t.TempDir()
		conf := config.Config{ImageRootDirectory: imageRootDir}

		// Create a directory and image file on disk
		dirPath := filepath.Join(imageRootDir, "photos")
		require.NoError(t, os.MkdirAll(dirPath, 0755))
		createTestJPEGFile(t, dirPath, "good.jpg", 320, 240)

		db.LoadTestData(t, dbClient, []db.File{
			{ID: 1, Name: "photos", ParentID: 0, Type: db.FileTypeDirectory},
			{ID: 2, Name: "good.jpg", ParentID: 1, Type: db.FileTypeImage},
		})

		err := BackfillImageDimensions(logger, dbClient.Client, conf)
		assert.NoError(t, err)

		// Verify dimensions were written
		images, err := dbClient.File().FindAllImageFiles()
		require.NoError(t, err)
		require.Len(t, images, 1)
		require.NotNil(t, images[0].ImageWidth)
		require.NotNil(t, images[0].ImageHeight)
		assert.Equal(t, uint(320), *images[0].ImageWidth)
		assert.Equal(t, uint(240), *images[0].ImageHeight)
	})

	t.Run("skips missing files on disk", func(t *testing.T) {
		logger := slog.New(slog.NewTextHandler(io.Discard, nil))
		dbClient := db.NewTestClient(t)
		dbClient.Truncate(t, db.File{})

		imageRootDir := t.TempDir()
		conf := config.Config{ImageRootDirectory: imageRootDir}

		// Create directory but do NOT create the image file on disk
		dirPath := filepath.Join(imageRootDir, "photos")
		require.NoError(t, os.MkdirAll(dirPath, 0755))

		db.LoadTestData(t, dbClient, []db.File{
			{ID: 1, Name: "photos", ParentID: 0, Type: db.FileTypeDirectory},
			{ID: 2, Name: "missing.jpg", ParentID: 1, Type: db.FileTypeImage},
		})

		err := BackfillImageDimensions(logger, dbClient.Client, conf)
		assert.NoError(t, err)

		// Dimensions should still be NULL
		images, err := dbClient.File().FindImageFilesWithNullDimensions()
		require.NoError(t, err)
		assert.Len(t, images, 1)
	})

	t.Run("skips files with hash mismatch", func(t *testing.T) {
		logger := slog.New(slog.NewTextHandler(io.Discard, nil))
		dbClient := db.NewTestClient(t)
		dbClient.Truncate(t, db.File{})

		imageRootDir := t.TempDir()
		conf := config.Config{ImageRootDirectory: imageRootDir}

		dirPath := filepath.Join(imageRootDir, "photos")
		require.NoError(t, os.MkdirAll(dirPath, 0755))
		createTestJPEGFile(t, dirPath, "changed.jpg", 100, 100)

		db.LoadTestData(t, dbClient, []db.File{
			{ID: 1, Name: "photos", ParentID: 0, Type: db.FileTypeDirectory},
			{ID: 2, Name: "changed.jpg", ParentID: 1, Type: db.FileTypeImage, ContentHash: "wronghash"},
		})

		err := BackfillImageDimensions(logger, dbClient.Client, conf)
		assert.NoError(t, err)

		// Dimensions should still be NULL because hash did not match
		images, err := dbClient.File().FindImageFilesWithNullDimensions()
		require.NoError(t, err)
		assert.Len(t, images, 1)
	})

	t.Run("backfills when content hash matches", func(t *testing.T) {
		logger := slog.New(slog.NewTextHandler(io.Discard, nil))
		dbClient := db.NewTestClient(t)
		dbClient.Truncate(t, db.File{})

		imageRootDir := t.TempDir()
		conf := config.Config{ImageRootDirectory: imageRootDir}

		dirPath := filepath.Join(imageRootDir, "photos")
		require.NoError(t, os.MkdirAll(dirPath, 0755))
		createTestJPEGFile(t, dirPath, "matched.jpg", 150, 100)

		// Compute the real hash for the file
		realHash, err := ComputeFileHash(filepath.Join(dirPath, "matched.jpg"))
		require.NoError(t, err)

		db.LoadTestData(t, dbClient, []db.File{
			{ID: 1, Name: "photos", ParentID: 0, Type: db.FileTypeDirectory},
			{ID: 2, Name: "matched.jpg", ParentID: 1, Type: db.FileTypeImage, ContentHash: realHash},
		})

		err = BackfillImageDimensions(logger, dbClient.Client, conf)
		assert.NoError(t, err)

		// Dimensions should be filled since hash matched
		images, err := dbClient.File().FindAllImageFiles()
		require.NoError(t, err)
		require.Len(t, images, 1)
		require.NotNil(t, images[0].ImageWidth)
		require.NotNil(t, images[0].ImageHeight)
		assert.Equal(t, uint(150), *images[0].ImageWidth)
		assert.Equal(t, uint(100), *images[0].ImageHeight)
	})

	t.Run("skips files with unknown parent directory", func(t *testing.T) {
		logger := slog.New(slog.NewTextHandler(io.Discard, nil))
		dbClient := db.NewTestClient(t)
		dbClient.Truncate(t, db.File{})

		imageRootDir := t.TempDir()
		conf := config.Config{ImageRootDirectory: imageRootDir}

		// Image references a parent ID that does not exist in the directory tree
		db.LoadTestData(t, dbClient, []db.File{
			{ID: 1, Name: "photos", ParentID: 0, Type: db.FileTypeDirectory},
			{ID: 2, Name: "orphan.jpg", ParentID: 999, Type: db.FileTypeImage},
		})

		err := BackfillImageDimensions(logger, dbClient.Client, conf)
		assert.NoError(t, err)

		// Dimensions should still be NULL
		images, err := dbClient.File().FindImageFilesWithNullDimensions()
		require.NoError(t, err)
		assert.Len(t, images, 1)
	})
}
