package import_images

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/michael-freling/anime-image-viewer/internal/image"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestValidateImportImageFile(t *testing.T) {
	tester := newTester(t)
	dbClient := tester.dbClient

	// Create a destination directory in the filesystem
	destDir := image.Directory{
		ID:   1,
		Name: "destination",
		Path: filepath.Join(tester.config.ImageRootDirectory, "destination"),
	}
	require.NoError(t, os.MkdirAll(destDir.Path, 0755))

	// Create a source directory with an image file for importing
	sourceDir := t.TempDir()
	sourceFilePath := filepath.Join(sourceDir, "test_image.jpg")
	// Copy a real image file to the source
	testImagePath := filepath.Join("..", "..", "testdata", string(image.TestImageFileJpeg))
	_, err := image.Copy(testImagePath, sourceFilePath)
	require.NoError(t, err)

	t.Run("file already exists in DB but not on filesystem", func(t *testing.T) {
		dbClient.Truncate(t, db.File{})
		// Insert a file record in the DB with the same name as the source file
		db.LoadTestData(t, dbClient, []db.File{
			{ID: 100, Name: "test_image.jpg", ParentID: destDir.ID, Type: db.FileTypeImage},
		})

		progressNotifier := NewProgressNotifier()
		validator := newBatchImportImageValidator(dbClient.Client, progressNotifier)
		err := validator.validateImportImageFile(sourceFilePath, destDir)
		assert.Error(t, err)
		assert.ErrorIs(t, err, image.ErrFileAlreadyExists)
	})

	t.Run("file passes all validation checks", func(t *testing.T) {
		dbClient.Truncate(t, db.File{})

		progressNotifier := NewProgressNotifier()
		validator := newBatchImportImageValidator(dbClient.Client, progressNotifier)
		err := validator.validateImportImageFile(sourceFilePath, destDir)
		assert.NoError(t, err)
	})

	t.Run("unsupported image format", func(t *testing.T) {
		textFilePath := filepath.Join(sourceDir, "test.txt")
		require.NoError(t, os.WriteFile(textFilePath, []byte("not an image"), 0644))

		progressNotifier := NewProgressNotifier()
		validator := newBatchImportImageValidator(dbClient.Client, progressNotifier)
		err := validator.validateImportImageFile(textFilePath, destDir)
		assert.Error(t, err)
		assert.ErrorIs(t, err, image.ErrUnsupportedImageFile)
	})

	t.Run("file already exists on filesystem", func(t *testing.T) {
		// Copy the image to the destination directory
		destFilePath := filepath.Join(destDir.Path, "test_image.jpg")
		_, err := image.Copy(sourceFilePath, destFilePath)
		require.NoError(t, err)
		t.Cleanup(func() {
			os.Remove(destFilePath)
		})

		dbClient.Truncate(t, db.File{})
		progressNotifier := NewProgressNotifier()
		validator := newBatchImportImageValidator(dbClient.Client, progressNotifier)
		err = validator.validateImportImageFile(sourceFilePath, destDir)
		assert.Error(t, err)
		assert.ErrorIs(t, err, image.ErrFileAlreadyExists)
	})
}

func TestReadImageFilePaths(t *testing.T) {
	tester := newTester(t)
	fileBuilder := tester.newFileCreator(t)

	destDir := image.Directory{ID: 1, Name: "dest"}
	fileBuilder.CreateDirectory(destDir)
	destDirectory := fileBuilder.BuildDirectory(1)

	sourceDir := t.TempDir()
	// Create a real image file
	sourceImagePath := filepath.Join(sourceDir, "source_image.jpg")
	testImagePath := filepath.Join("..", "..", "testdata", string(image.TestImageFileJpeg))
	_, err := image.Copy(testImagePath, sourceImagePath)
	require.NoError(t, err)

	t.Run("with nonexistent file path", func(t *testing.T) {
		batchImporter := tester.getBatchImageImporter()
		progressNotifier := NewProgressNotifier()
		result, err := batchImporter.readImageFilePaths(
			context.Background(),
			[]string{"/nonexistent/path/image.jpg"},
			destDirectory,
			progressNotifier,
		)
		assert.NoError(t, err)
		// The nonexistent file should be added to failures, not returned
		assert.Empty(t, result)
		assert.Equal(t, 1, progressNotifier.Failed)
	})

	t.Run("with directory path (not a file)", func(t *testing.T) {
		batchImporter := tester.getBatchImageImporter()
		progressNotifier := NewProgressNotifier()
		result, err := batchImporter.readImageFilePaths(
			context.Background(),
			[]string{sourceDir}, // pass a directory, not a file
			destDirectory,
			progressNotifier,
		)
		assert.NoError(t, err)
		// Directory paths are skipped (todo: recursive import)
		assert.Empty(t, result)
	})

	t.Run("with valid file path", func(t *testing.T) {
		batchImporter := tester.getBatchImageImporter()
		progressNotifier := NewProgressNotifier()
		result, err := batchImporter.readImageFilePaths(
			context.Background(),
			[]string{sourceImagePath},
			destDirectory,
			progressNotifier,
		)
		assert.NoError(t, err)
		assert.Len(t, result, 1)
		assert.Equal(t, sourceImagePath, result[0].sourceFilePath)
		assert.Equal(t, "source_image.jpg", result[0].image.Name)
		assert.Equal(t, destDirectory.ID, result[0].image.ParentID)
	})

	t.Run("with valid file path and unreadable XMP file", func(t *testing.T) {
		// Create an XMP file that is unreadable (permission denied)
		xmpFilePath := sourceImagePath + ".xmp"
		require.NoError(t, os.WriteFile(xmpFilePath, []byte("not-xml-content"), 0000))
		t.Cleanup(func() {
			os.Chmod(xmpFilePath, 0644) // restore for cleanup
			os.Remove(xmpFilePath)
		})

		batchImporter := tester.getBatchImageImporter()
		progressNotifier := NewProgressNotifier()
		result, err := batchImporter.readImageFilePaths(
			context.Background(),
			[]string{sourceImagePath},
			destDirectory,
			progressNotifier,
		)
		assert.NoError(t, err)
		// The image should still be imported despite XMP read failure
		assert.Len(t, result, 1)
		assert.Equal(t, sourceImagePath, result[0].sourceFilePath)
		assert.Nil(t, result[0].xmp, "XMP should be nil when read fails")
	})

	t.Run("with mixed valid and invalid paths", func(t *testing.T) {
		batchImporter := tester.getBatchImageImporter()
		progressNotifier := NewProgressNotifier()
		result, err := batchImporter.readImageFilePaths(
			context.Background(),
			[]string{
				sourceImagePath,
				"/nonexistent/path.jpg",
				sourceDir, // directory
			},
			destDirectory,
			progressNotifier,
		)
		assert.NoError(t, err)
		assert.Len(t, result, 1)
		assert.Equal(t, 1, progressNotifier.Failed)
	})
}
