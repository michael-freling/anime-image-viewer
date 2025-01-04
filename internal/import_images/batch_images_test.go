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

func TestBatchImageImporter_importImageFiles(t *testing.T) {
	tester := newTester(t)
	dbClient := tester.dbClient

	destinationDirectory := image.Directory{
		ID:   1,
		Name: "Directory 1",
	}
	fileBuilder := tester.newFileCreator().
		CreateDirectory(t, destinationDirectory).
		CreateImage(t,
			image.ImageFile{ID: 10, Name: "image2.jpg", ParentID: destinationDirectory.ID, ContentType: "image/jpeg"},
			image.TestImageFileNone).
		CreateImage(t,
			image.ImageFile{ID: 11, Name: "image.png", ParentID: destinationDirectory.ID, ContentType: "image/png"},
			image.TestImageFileNone).
		CreateImage(t, image.ImageFile{ID: 99, Name: "other_image.jpg", ParentID: destinationDirectory.ID, ContentType: "image/jpeg"}, image.TestImageFileJpeg).
		CreateImage(t, image.ImageFile{ID: 98, Name: "other_image_in_db.jpg", ParentID: destinationDirectory.ID, ContentType: "image/jpeg"}, image.TestImageFileJpeg).
		CreateDirectory(t, image.Directory{ID: 2, Name: "testdata"}).
		CreateImage(t, image.ImageFile{Name: "image2.jpg", ParentID: 2, ContentType: "image/jpeg"}, image.TestImageFileJpeg).
		CreateImage(t, image.ImageFile{ID: 20, Name: "image2.png", ParentID: 2, ContentType: "image/png"}, image.TestImageFilePng)

	directoryForUploadingTestImages := fileBuilder.BuildDirectory(2)
	tester.copyXMPFile(t,
		image.TestImageFilePng,
		filepath.Join(directoryForUploadingTestImages.Path, "image2.png.xmp"),
	)
	tester.copyXMPFile(t,
		image.TestImageFileJpeg,
		filepath.Join(directoryForUploadingTestImages.Path, "image2.jpg.xmp"),
	)

	dbFileBuilder := tester.dbClient.NewFileBuilder()
	dbTagBuilder := tester.dbClient.NewTagBuilder()

	testCases := []struct {
		name                 string
		sourceFilePaths      []string
		destinationDirectory image.Directory
		want                 []image.ImageFile
		wantInsertFiles      []db.File
		wantInsertTags       []db.Tag
		wantInsertFileTags   []db.FileTag
		wantErrors           []error
	}{
		{
			name: "succeed to import image files without an error",
			sourceFilePaths: []string{
				filepath.Join(directoryForUploadingTestImages.Path, "image2.jpg"),
				filepath.Join(directoryForUploadingTestImages.Path, "image2.png"),
			},
			destinationDirectory: fileBuilder.BuildDirectory(1),
			want: func() []image.ImageFile {
				destinationDirectory := fileBuilder.BuildDirectory(1)

				// id will be overwritten
				image10 := fileBuilder.BuildImageFile(10)
				image10.ParentID = 1
				image10.LocalFilePath = filepath.Join(destinationDirectory.Path, image10.Name)

				image20 := fileBuilder.BuildImageFile(20)
				image20.ParentID = 1
				image20.Path = fileBuilder.GetImagePath(destinationDirectory, image20)
				image20.LocalFilePath = filepath.Join(destinationDirectory.Path, image20.Name)
				return []image.ImageFile{image10, image20}
			}(),
			wantInsertFiles: []db.File{
				dbFileBuilder.AddImage(t, db.File{ID: 1, Name: "image2.jpg", ParentID: 1}).BuildImage(t, 1),
				dbFileBuilder.AddImage(t, db.File{ID: 2, Name: "image2.png", ParentID: 1}).BuildImage(t, 2),
			},
			wantInsertTags: dbTagBuilder.BuildTags(t,
				db.Tag{ID: 1, Name: "Test 1"},
				db.Tag{ID: 2, Name: "Test 10", ParentID: 1},
				db.Tag{ID: 3, Name: "Test 100", ParentID: 2},
				db.Tag{ID: 4, Name: "Test 2"},
				db.Tag{ID: 5, Name: "Test 20", ParentID: 4},
			),
			wantInsertFileTags: []db.FileTag{
				dbTagBuilder.AddFileTag(t, db.FileTag{FileID: 1, TagID: 3, AddedBy: db.FileTagAddedByImport}).BuildFileTag(t, 1, 3),
				dbTagBuilder.AddFileTag(t, db.FileTag{FileID: 2, TagID: 4, AddedBy: db.FileTagAddedByImport}).BuildFileTag(t, 2, 4),
				dbTagBuilder.AddFileTag(t, db.FileTag{FileID: 2, TagID: 5, AddedBy: db.FileTagAddedByImport}).BuildFileTag(t, 2, 5),
			},
		},
		{
			name: "succeed to import image files with errors",
			sourceFilePaths: []string{
				tester.getTestFilePath(string(image.TestImageFilePng)),
				tester.getTestFilePath("image.txt"),
				fileBuilder.BuildImageFile(99).LocalFilePath,
				fileBuilder.BuildImageFile(98).LocalFilePath,
			},
			destinationDirectory: fileBuilder.BuildDirectory(1),
			want: []image.ImageFile{
				// id will be overwritten
				fileBuilder.BuildImageFile(11),
			},
			wantInsertFiles: []db.File{
				dbFileBuilder.AddImage(t, db.File{ID: 3, Name: "image.png", ParentID: 1}).BuildImage(t, 3),
			},
			wantInsertTags: dbTagBuilder.BuildTags(t,
				db.Tag{ID: 6, Name: "Test 2"},
				db.Tag{ID: 7, Name: "Test 20", ParentID: 6},
			),
			wantInsertFileTags: []db.FileTag{
				dbTagBuilder.AddFileTag(t, db.FileTag{FileID: 3, TagID: 6, AddedBy: db.FileTagAddedByImport}).BuildFileTag(t, 3, 6),
				dbTagBuilder.AddFileTag(t, db.FileTag{FileID: 3, TagID: 7, AddedBy: db.FileTagAddedByImport}).BuildFileTag(t, 3, 7),
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
			tester.dbClient.Truncate(t,
				db.File{},
				db.Tag{},
				db.FileTag{},
			)

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

			gotFiles := db.MustGetAll[db.File](t, dbClient)
			assert.Equal(t, tc.wantInsertFiles, gotFiles)
			gotInsertedTags := db.MustGetAll[db.Tag](t, dbClient)
			assert.Equal(t, tc.wantInsertTags, gotInsertedTags)
			gotInsertedFileTags := db.MustGetAll[db.FileTag](t, dbClient)
			assert.Equal(t, tc.wantInsertFileTags, gotInsertedFileTags)

			// validate progressNotifier
			assert.Equal(t, len(tc.wantInsertFiles), progressNotifier.Completed)
			assert.Equal(t, len(tc.wantErrors), progressNotifier.Failed)
			assert.Len(t, progressNotifier.FailedPaths, len(tc.wantErrors))
		})
	}
}
