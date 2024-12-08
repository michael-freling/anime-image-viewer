package image

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/michael-freling/anime-image-viewer/internal/xlog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func copyTestImage(t *testing.T, source string, destination string) {
	_, err := copy(source, destination)
	require.NoError(t, err)
}

func TestImageFileService_importImageFiles(t *testing.T) {
	tempDir := t.TempDir()
	dbClient, err := db.NewClient(db.DSNMemory, db.WithNopLogger())
	assert.NoError(t, err)
	require.NoError(t, dbClient.Migrate())

	imageFileService := ImageFileService{
		dbClient: dbClient,
		logger:   xlog.Nop(),
	}

	duplicatedFileInFS := "other_image.jpg"
	copyTestImage(t, "testdata/image.jpg", filepath.Join(tempDir, duplicatedFileInFS))
	duplicatedFileInDB := "other_image_in_db.jpg"
	copyTestImage(t, "testdata/image.jpg", filepath.Join(tempDir, duplicatedFileInDB))
	require.NoError(t, os.Mkdir(filepath.Join(tempDir, "testdata"), 0755))
	copyTestImage(t, "testdata/image.jpg", filepath.Join(tempDir, "testdata", "image2.jpg"))

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
