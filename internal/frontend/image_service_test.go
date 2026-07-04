package frontend

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/michael-freling/anime-image-viewer/internal/image"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func (tester tester) getImageService() *ImageService {
	return NewImageService(tester.getFileReader(), tester.dbClient.Client)
}

func TestImageService_ReadImagesByIDs(t *testing.T) {
	tester := newTester(t)
	dbClient := tester.dbClient

	fileBuilder := tester.newFileCreator(t)
	for _, dir := range []image.Directory{
		{ID: 1, Name: "Directory 1"},
	} {
		fileBuilder.CreateDirectory(dir)
	}
	for _, imageFile := range []image.ImageFile{
		{ID: 11, Name: "image_file_11.jpg", ParentID: 1},
		{ID: 12, Name: "image_file_12.png", ParentID: 1},
	} {
		fileBuilder.CreateImage(imageFile, image.TestImageFileJpeg)
		fileBuilder.AddImageCreatedAt(imageFile.ID, time.Date(2021, 1, 1, 0, 0, int(imageFile.ID), 0, time.UTC))
	}

	testCases := []struct {
		name        string
		imageIDs    []uint
		insertFiles []db.File
		wantIDs     []uint
		wantErr     bool
	}{
		{
			name:     "read multiple images by IDs",
			imageIDs: []uint{11, 12},
			insertFiles: []db.File{
				fileBuilder.BuildDBDirectory(1),
				fileBuilder.BuildDBImageFile(11),
				fileBuilder.BuildDBImageFile(12),
			},
			wantIDs: []uint{11, 12},
		},
		{
			name:     "read single image by ID",
			imageIDs: []uint{11},
			insertFiles: []db.File{
				fileBuilder.BuildDBDirectory(1),
				fileBuilder.BuildDBImageFile(11),
			},
			wantIDs: []uint{11},
		},
		{
			name:     "read no images for empty IDs",
			imageIDs: []uint{},
			insertFiles: []db.File{
				fileBuilder.BuildDBDirectory(1),
				fileBuilder.BuildDBImageFile(11),
			},
			wantIDs: []uint{},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			dbClient.Truncate(t, &db.File{})
			db.LoadTestData(t, dbClient, tc.insertFiles)

			service := tester.getImageService()
			got, gotErr := service.ReadImagesByIDs(context.Background(), tc.imageIDs)
			if tc.wantErr {
				assert.Error(t, gotErr)
				return
			}
			require.NoError(t, gotErr)
			assert.Len(t, got, len(tc.wantIDs))
			for _, id := range tc.wantIDs {
				_, ok := got[id]
				assert.True(t, ok, "expected image ID %d in result", id)
			}
		})
	}
}

func TestNewImageService(t *testing.T) {
	tester := newTester(t)
	service := NewImageService(tester.getFileReader(), tester.dbClient.Client)
	assert.NotNil(t, service)
	assert.NotNil(t, service.imageReader)
}

func TestImageService_ReadImagesByIDs_SkipsStaleRecords(t *testing.T) {
	tester := newTester(t)
	dbClient := tester.dbClient

	fileBuilder := tester.newFileCreator(t)
	for _, dir := range []image.Directory{
		{ID: 1, Name: "Directory 1"},
	} {
		fileBuilder.CreateDirectory(dir)
	}
	for _, imageFile := range []image.ImageFile{
		{ID: 11, Name: "image_file_11.jpg", ParentID: 1},
	} {
		fileBuilder.CreateImage(imageFile, image.TestImageFileJpeg)
		fileBuilder.AddImageCreatedAt(imageFile.ID, time.Date(2021, 1, 1, 0, 0, int(imageFile.ID), 0, time.UTC))
	}

	// Insert the image file into DB but NOT the parent directory,
	// so ReadDirectories returns ErrDirectoryNotFound (tolerated) and the file
	// resolves to a path that doesn't exist on disk. Such stale records are
	// skipped rather than failing the whole read.
	dbClient.Truncate(t, &db.File{})
	db.LoadTestData(t, dbClient, []db.File{
		fileBuilder.BuildDBImageFile(11),
	})

	service := tester.getImageService()
	got, gotErr := service.ReadImagesByIDs(context.Background(), []uint{11})
	require.NoError(t, gotErr)
	assert.Empty(t, got, "stale record with missing parent directory should be skipped")

	// A file that exists but is not a valid image is a real error (not a
	// skipped stale record) and must be surfaced by the service.
	fileBuilder.CreateImage(image.ImageFile{ID: 13, Name: "notimage.txt", ParentID: 1}, image.TestImageFileNonImage)
	dbClient.Truncate(t, &db.File{})
	db.LoadTestData(t, dbClient, []db.File{
		fileBuilder.BuildDBDirectory(1),
		fileBuilder.BuildDBImageFile(13),
	})
	_, gotErr = service.ReadImagesByIDs(context.Background(), []uint{13})
	require.Error(t, gotErr)
}

func TestImageService_ShowImageInExplorer(t *testing.T) {
	tester := newTester(t)
	dbClient := tester.dbClient

	fileBuilder := tester.newFileCreator(t)
	for _, dir := range []image.Directory{
		{ID: 1, Name: "Directory 1"},
	} {
		fileBuilder.CreateDirectory(dir)
	}
	for _, imageFile := range []image.ImageFile{
		{ID: 11, Name: "image_file_11.jpg", ParentID: 1},
	} {
		fileBuilder.CreateImage(imageFile, image.TestImageFileJpeg)
		fileBuilder.AddImageCreatedAt(imageFile.ID, time.Date(2021, 1, 1, 0, 0, int(imageFile.ID), 0, time.UTC))
	}

	t.Run("error when ReadImagesByIDs fails", func(t *testing.T) {
		// A file that exists on disk but has unsupported content makes
		// ReadImagesByIDs fail with a real error (not a skipped stale record),
		// which the service wraps and returns.
		fileBuilder.CreateImage(image.ImageFile{ID: 13, Name: "notimage.txt", ParentID: 1}, image.TestImageFileNonImage)
		dbClient.Truncate(t, &db.File{})
		db.LoadTestData(t, dbClient, []db.File{
			fileBuilder.BuildDBDirectory(1),
			fileBuilder.BuildDBImageFile(13),
		})

		service := tester.getImageService()
		gotErr := service.ShowImageInExplorer(context.Background(), 13)
		assert.Error(t, gotErr)
		assert.Contains(t, gotErr.Error(), "ReadImagesByIDs")
	})

	t.Run("error when image not found", func(t *testing.T) {
		// Empty DB so no image is found for the given ID.
		dbClient.Truncate(t, &db.File{})

		service := tester.getImageService()
		gotErr := service.ShowImageInExplorer(context.Background(), 999)
		assert.Error(t, gotErr)
		assert.Contains(t, gotErr.Error(), "image not found")
	})

	t.Run("calls showInExplorer for valid image", func(t *testing.T) {
		// Insert both directory and image so the DB lookup succeeds.
		// showInExplorer will call xdg-open (on Linux) which may fail in CI,
		// but the DB-lookup and branch into showInExplorer is covered.
		dbClient.Truncate(t, &db.File{})
		db.LoadTestData(t, dbClient, []db.File{
			fileBuilder.BuildDBDirectory(1),
			fileBuilder.BuildDBImageFile(11),
		})

		service := tester.getImageService()
		// We don't assert NoError because xdg-open may not be available in CI.
		// The important thing is that we reach showInExplorer (coverage).
		_ = service.ShowImageInExplorer(context.Background(), 11)
	})
}

func TestImageService_OpenImageInOS(t *testing.T) {
	tester := newTester(t)
	dbClient := tester.dbClient

	fileBuilder := tester.newFileCreator(t)
	for _, dir := range []image.Directory{
		{ID: 1, Name: "Directory 1"},
	} {
		fileBuilder.CreateDirectory(dir)
	}
	for _, imageFile := range []image.ImageFile{
		{ID: 11, Name: "image_file_11.jpg", ParentID: 1},
	} {
		fileBuilder.CreateImage(imageFile, image.TestImageFileJpeg)
		fileBuilder.AddImageCreatedAt(imageFile.ID, time.Date(2021, 1, 1, 0, 0, int(imageFile.ID), 0, time.UTC))
	}

	t.Run("error when ReadImagesByIDs fails", func(t *testing.T) {
		// A file that exists on disk but has unsupported content makes
		// ReadImagesByIDs fail with a real error (not a skipped stale record),
		// which the service wraps and returns.
		fileBuilder.CreateImage(image.ImageFile{ID: 13, Name: "notimage.txt", ParentID: 1}, image.TestImageFileNonImage)
		dbClient.Truncate(t, &db.File{})
		db.LoadTestData(t, dbClient, []db.File{
			fileBuilder.BuildDBDirectory(1),
			fileBuilder.BuildDBImageFile(13),
		})

		service := tester.getImageService()
		gotErr := service.OpenImageInOS(context.Background(), 13)
		assert.Error(t, gotErr)
		assert.Contains(t, gotErr.Error(), "ReadImagesByIDs")
	})

	t.Run("error when image not found", func(t *testing.T) {
		// Empty DB so no image is found for the given ID.
		dbClient.Truncate(t, &db.File{})

		service := tester.getImageService()
		gotErr := service.OpenImageInOS(context.Background(), 999)
		assert.Error(t, gotErr)
		assert.Contains(t, gotErr.Error(), "image not found")
	})
}

func TestImageService_DeleteImages(t *testing.T) {
	tester := newTester(t)
	dbClient := tester.dbClient

	fileBuilder := tester.newFileCreator(t)
	for _, dir := range []image.Directory{
		{ID: 1, Name: "Directory 1"},
	} {
		fileBuilder.CreateDirectory(dir)
	}
	for _, imageFile := range []image.ImageFile{
		{ID: 11, Name: "image_file_11.jpg", ParentID: 1},
		{ID: 12, Name: "image_file_12.png", ParentID: 1},
	} {
		fileBuilder.CreateImage(imageFile, image.TestImageFileJpeg)
		fileBuilder.AddImageCreatedAt(imageFile.ID, time.Date(2021, 1, 1, 0, 0, int(imageFile.ID), 0, time.UTC))
	}

	t.Run("deletes images from DB and disk", func(t *testing.T) {
		dbClient.Truncate(t, &db.File{}, &db.FileTag{}, &db.FileCharacter{})
		db.LoadTestData(t, dbClient, []db.File{
			fileBuilder.BuildDBDirectory(1),
			fileBuilder.BuildDBImageFile(11),
			fileBuilder.BuildDBImageFile(12),
		})
		db.LoadTestData(t, dbClient, []db.FileTag{
			{TagID: 100, FileID: 11, AddedBy: db.FileTagAddedByUser},
			{TagID: 100, FileID: 12, AddedBy: db.FileTagAddedByUser},
		})
		db.LoadTestData(t, dbClient, []db.FileCharacter{
			{CharacterID: 200, FileID: 11, AddedBy: db.FileTagAddedByUser},
		})

		service := tester.getImageService()
		err := service.DeleteImages(context.Background(), []uint{11, 12})
		require.NoError(t, err)

		// Verify files are removed from DB.
		remainingFiles, err := dbClient.Client.File().FindImageFilesByIDs([]uint{11, 12})
		require.NoError(t, err)
		assert.Empty(t, remainingFiles)

		// Verify tag associations are removed.
		remainingTags, err := dbClient.Client.FileTag().FindAllByFileID([]uint{11, 12})
		require.NoError(t, err)
		assert.Empty(t, remainingTags)

		// Verify character associations are removed.
		remainingChars, err := dbClient.Client.FileCharacter().FindByFileIDs([]uint{11, 12})
		require.NoError(t, err)
		assert.Empty(t, remainingChars)
	})

	t.Run("no error for empty IDs", func(t *testing.T) {
		service := tester.getImageService()
		err := service.DeleteImages(context.Background(), []uint{})
		assert.NoError(t, err)
	})

	t.Run("no error when file already missing from disk", func(t *testing.T) {
		dbClient.Truncate(t, &db.File{}, &db.FileTag{}, &db.FileCharacter{})
		// Insert the DB record but do NOT recreate the physical file on disk.
		// The first sub-test already deleted it; this tests that DeleteImages
		// gracefully handles the case where the physical file is gone.
		db.LoadTestData(t, dbClient, []db.File{
			fileBuilder.BuildDBDirectory(1),
			fileBuilder.BuildDBImageFile(11),
		})

		service := tester.getImageService()
		err := service.DeleteImages(context.Background(), []uint{11})
		assert.NoError(t, err)

		// Verify file is removed from DB.
		remainingFiles, err := dbClient.Client.File().FindImageFilesByIDs([]uint{11})
		require.NoError(t, err)
		assert.Empty(t, remainingFiles)
	})

	t.Run("proceeds with DB delete when ReadImagesByIDs fails", func(t *testing.T) {
		dbClient.Truncate(t, &db.File{}, &db.FileTag{}, &db.FileCharacter{})
		// A file that exists but is not a valid image makes ReadImagesByIDs
		// fail. DeleteImages logs a warning, skips disk cleanup, and still
		// deletes the DB records.
		fileBuilder.CreateImage(image.ImageFile{ID: 13, Name: "notimage.txt", ParentID: 1}, image.TestImageFileNonImage)
		db.LoadTestData(t, dbClient, []db.File{
			fileBuilder.BuildDBDirectory(1),
			fileBuilder.BuildDBImageFile(13),
		})

		service := tester.getImageService()
		err := service.DeleteImages(context.Background(), []uint{13})
		assert.NoError(t, err)

		// Verify the record is removed from DB despite the read failing.
		remainingFiles, err := dbClient.Client.File().FindImageFilesByIDs([]uint{13})
		require.NoError(t, err)
		assert.Empty(t, remainingFiles)
	})

	t.Run("logs warning when os.Remove fails with permission error", func(t *testing.T) {
		// Use a fresh tester with its own temp dir so file paths are clean.
		tester2 := newTester(t)
		dbClient2 := tester2.dbClient
		dbClient2.Truncate(t, &db.File{}, &db.FileTag{}, &db.FileCharacter{})

		fileBuilder2 := tester2.newFileCreator(t)
		fileBuilder2.CreateDirectory(image.Directory{ID: 1, Name: "Directory 1"})
		fileBuilder2.CreateImage(image.ImageFile{ID: 11, Name: "image_file_11.jpg", ParentID: 1}, image.TestImageFileJpeg)
		fileBuilder2.AddImageCreatedAt(11, time.Date(2021, 1, 1, 0, 0, 11, 0, time.UTC))

		db.LoadTestData(t, dbClient2, []db.File{
			fileBuilder2.BuildDBDirectory(1),
			fileBuilder2.BuildDBImageFile(11),
		})

		// Make the parent directory read-only so os.Remove fails with EACCES.
		dirPath := filepath.Join(tester2.config.ImageRootDirectory, "Directory 1")
		require.NoError(t, os.Chmod(dirPath, 0555))
		t.Cleanup(func() {
			_ = os.Chmod(dirPath, 0755)
		})

		service := tester2.getImageService()
		err := service.DeleteImages(context.Background(), []uint{11})
		// DeleteImages is best-effort on disk removal, so it returns nil.
		assert.NoError(t, err)

		// Verify file is removed from DB even though disk removal failed.
		remainingFiles, err := dbClient2.Client.File().FindImageFilesByIDs([]uint{11})
		require.NoError(t, err)
		assert.Empty(t, remainingFiles)
	})
}
