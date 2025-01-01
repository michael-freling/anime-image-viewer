package import_images

import (
	"context"
	"errors"
	"path/filepath"
	"testing"

	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/michael-freling/anime-image-viewer/internal/image"
	"github.com/stretchr/testify/assert"
)

func TestImageFileService_importImageFiles(t *testing.T) {
	tester := newTester(t)
	dbClient := tester.dbClient

	destinationDirectory := image.Directory{
		ID:   1,
		Name: "Directory 1",
	}

	fileBuilder := tester.newFileCreator().
		CreateDirectory(t, destinationDirectory).
		CreateImage(t,
			image.ImageFile{ID: 10, Name: "image2.jpg", ParentID: 1, ContentType: "image/jpeg"},
			image.TestImageFileNone).
		CreateImage(t,
			image.ImageFile{ID: 11, Name: "image.jpg", ParentID: 1, ContentType: "image/jpeg"},
			image.TestImageFileNone).
		CreateImage(t, image.ImageFile{ID: 99, Name: "other_image.jpg", ParentID: 1, ContentType: "image/jpeg"}, image.TestImageFileJpeg).
		CreateImage(t, image.ImageFile{ID: 98, Name: "other_image_in_db.jpg", ParentID: 1, ContentType: "image/jpeg"}, image.TestImageFileJpeg).
		CreateDirectory(t, image.Directory{ID: 2, Name: "testdata"}).
		CreateImage(t, image.ImageFile{Name: "image2.jpg", ParentID: 2, ContentType: "image/jpeg"}, image.TestImageFileJpeg)

	testCases := []struct {
		name                 string
		sourceFilePaths      []string
		destinationDirectory image.Directory
		want                 []image.ImageFile
		wantInsert           []db.File
		wantErrors           []error
	}{
		{
			name: "succeed to import an image file without an error",
			sourceFilePaths: []string{
				filepath.Join(tester.config.ImageRootDirectory, "testdata", "image2.jpg"),
			},
			destinationDirectory: fileBuilder.BuildDirectory(1),
			want: []image.ImageFile{
				// id will be overwritten
				fileBuilder.BuildImageFile(10),
			},
			wantInsert: []db.File{
				{Name: "image2.jpg", ParentID: 1, Type: db.FileTypeImage},
			},
		},
		{
			name: "succeed to import image files with errors",
			sourceFilePaths: []string{
				tester.getTestFilePath("image.jpg"),
				tester.getTestFilePath("image.txt"),
				fileBuilder.BuildImageFile(99).LocalFilePath,
				fileBuilder.BuildImageFile(98).LocalFilePath,
			},
			destinationDirectory: fileBuilder.BuildDirectory(1),
			want: []image.ImageFile{
				// id will be overwritten
				fileBuilder.BuildImageFile(11),
			},
			wantInsert: []db.File{
				{Name: "image.jpg", ParentID: 1, Type: db.FileTypeImage},
			},
			wantErrors: []error{
				image.ErrUnsupportedImageFile,
				image.ErrFileAlreadyExists,
				image.ErrFileAlreadyExists,
			},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			batchImporter := tester.getBatchImageImporter()

			progressNotifier := NewProgressNotifier()
			got, gotErrs := batchImporter.ImportImages(context.Background(), tc.destinationDirectory, tc.sourceFilePaths, progressNotifier)
			if len(tc.wantErrors) > 0 {
				uw, ok := gotErrs.(interface{ Unwrap() []error })
				assert.True(t, ok)
				assert.Len(t, uw.Unwrap(), len(tc.wantErrors))
				unwrappedErrors := uw.Unwrap()
				for _, wantErr := range tc.wantErrors {
					isFound := false
					for _, gotErr := range unwrappedErrors {
						if errors.Is(gotErr, wantErr) {
							isFound = true
							break
						}
					}
					if !isFound {
						assert.Failf(t, "expected error not found",
							"error not found, want: %+v, got %+v",
							wantErr,
							unwrappedErrors,
						)
					}
				}
			} else {
				assert.NoError(t, gotErrs)
			}
			for i := range got {
				tc.want[i].ID = got[i].ID
			}
			assert.Equal(t, tc.want, got)

			for _, want := range tc.wantInsert {
				got, err := db.FindByValue(dbClient.Client, want)
				want.ID = got.ID
				want.CreatedAt = got.CreatedAt
				want.UpdatedAt = got.UpdatedAt
				assert.NoError(t, err)
				assert.Equal(t, want, got)
			}

			assert.Equal(t, len(tc.wantInsert), progressNotifier.Completed)
			assert.Equal(t, len(tc.wantErrors), progressNotifier.Failed)
			assert.Len(t, progressNotifier.FailedPaths, len(tc.wantErrors))
		})
	}
}
