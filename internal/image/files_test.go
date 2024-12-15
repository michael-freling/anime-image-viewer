package image

import (
	"path/filepath"
	"testing"

	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/michael-freling/anime-image-viewer/internal/xlog"
	"github.com/stretchr/testify/assert"
)

func TestImageFileService_importImageFiles(t *testing.T) {
	tester := newTester(t)
	tempDir := tester.config.ImageRootDirectory
	dbClient := tester.dbClient

	imageFileService := ImageFileService{
		dbClient: dbClient,
		logger:   xlog.Nop(),
	}

	duplicatedFileInFS := "other_image.jpg"
	tester.copyImageFile(t, "image.jpg", duplicatedFileInFS)
	duplicatedFileInDB := "other_image_in_db.jpg"
	tester.copyImageFile(t, "image.jpg", duplicatedFileInDB)
	tester.createDirectoryInFS(t, "testdata")
	tester.copyImageFile(t, "image.jpg", filepath.Join("testdata", "image2.jpg"))

	testCases := []struct {
		name                 string
		sourceFilePaths      []string
		destinationDirectory Directory
		wantInsert           []db.File
		wantErrors           []error
	}{
		{
			name: "succeed to import an image file without an error",
			sourceFilePaths: []string{
				tempDir + "/testdata/image2.jpg",
			},
			destinationDirectory: Directory{
				ID:   1,
				Path: tempDir,
			},
			wantInsert: []db.File{
				{Name: "image2.jpg", ParentID: 1, Type: db.FileTypeImage},
			},
		},
		{
			name: "succeed to import image files with errors",
			sourceFilePaths: []string{
				"testdata/image.jpg",
				"testdata/image.txt",
				filepath.Join(tempDir, duplicatedFileInFS),
				filepath.Join(tempDir, duplicatedFileInDB),
			},
			destinationDirectory: Directory{
				ID:   1,
				Path: tempDir,
			},
			wantInsert: []db.File{
				{Name: "image.jpg", ParentID: 1, Type: db.FileTypeImage},
			},
			wantErrors: []error{
				ErrUnsupportedImageFile,
				ErrFileAlreadyExists,
				ErrFileAlreadyExists,
			},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			gotErrs := imageFileService.importImageFiles(tc.destinationDirectory, tc.sourceFilePaths)
			if len(tc.wantErrors) > 0 {
				uw, ok := gotErrs.(interface{ Unwrap() []error })
				assert.True(t, ok)
				for index, gotErr := range uw.Unwrap() {
					wantErr := tc.wantErrors[index]
					assert.ErrorIs(t, gotErr, wantErr)
				}
			} else {
				assert.NoError(t, gotErrs)
			}

			for _, want := range tc.wantInsert {
				got, err := db.FindByValue(dbClient, want)
				want.ID = got.ID
				want.CreatedAt = got.CreatedAt
				want.UpdatedAt = got.UpdatedAt
				assert.NoError(t, err)
				assert.Equal(t, want, got)
			}
		})
	}
}
