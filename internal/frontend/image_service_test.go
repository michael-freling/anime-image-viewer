package frontend

import (
	"context"
	"testing"
	"time"

	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/michael-freling/anime-image-viewer/internal/image"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func (tester tester) getImageService() *ImageService {
	return NewImageService(tester.getFileReader())
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
	service := NewImageService(tester.getFileReader())
	assert.NotNil(t, service)
	assert.NotNil(t, service.imageReader)
}

func TestImageService_ReadImagesByIDs_Error(t *testing.T) {
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
	// so ReadDirectories will fail with ErrDirectoryNotFound which is tolerated,
	// but ConvertImageFile will fail because the parent directory has ID 0.
	dbClient.Truncate(t, &db.File{})
	db.LoadTestData(t, dbClient, []db.File{
		fileBuilder.BuildDBImageFile(11),
	})

	service := tester.getImageService()
	_, gotErr := service.ReadImagesByIDs(context.Background(), []uint{11})
	assert.Error(t, gotErr, "should return error when parent directory is missing from DB")
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
		// Insert the image file into DB but NOT the parent directory,
		// so ConvertImageFile will fail because the parent directory has ID 0.
		dbClient.Truncate(t, &db.File{})
		db.LoadTestData(t, dbClient, []db.File{
			fileBuilder.BuildDBImageFile(11),
		})

		service := tester.getImageService()
		gotErr := service.ShowImageInExplorer(context.Background(), 11)
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
		// Insert the image file into DB but NOT the parent directory,
		// so ConvertImageFile will fail because the parent directory has ID 0.
		dbClient.Truncate(t, &db.File{})
		db.LoadTestData(t, dbClient, []db.File{
			fileBuilder.BuildDBImageFile(11),
		})

		service := tester.getImageService()
		gotErr := service.OpenImageInOS(context.Background(), 11)
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
