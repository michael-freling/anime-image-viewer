package image

import (
	"context"
	"path/filepath"
	"strings"
	"testing"

	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/stretchr/testify/assert"
)

type fileBuilder struct {
	staticFilePrefix string
	localFilePrefix  string

	directories        map[uint]Directory
	localDirectoryPath map[uint]string
	imageFiles         map[uint]ImageFile
}

func (builder *fileBuilder) addDirectory(directory Directory) *fileBuilder {
	if directory.ParentID != 0 {
		parent := builder.directories[directory.ParentID]
		directory.Path = filepath.Join(parent.Path, directory.Name)

		parentLocalFilePath := builder.localDirectoryPath[directory.ParentID]
		builder.localDirectoryPath[directory.ID] = filepath.Join(parentLocalFilePath, directory.Name)
	} else {
		directory.Path = filepath.Join(builder.localFilePrefix, directory.Name)
		builder.localDirectoryPath[directory.ID] = filepath.Join(builder.localFilePrefix, directory.Name)
	}

	builder.directories[directory.ID] = directory
	return builder
}

func (builder *fileBuilder) addImageFile(imageFile ImageFile) *fileBuilder {
	if imageFile.ParentID != 0 {
		parentLocalFilePath := builder.localDirectoryPath[imageFile.ParentID]
		imageFile.LocalFilePath = filepath.Join(parentLocalFilePath, imageFile.Name)

		// todo: workaround
		imageFile.Path = "/files" + strings.TrimPrefix(imageFile.LocalFilePath, builder.localFilePrefix)
		// filepath.Join(parent.Path, imageFile.Name)
	}

	builder.imageFiles[imageFile.ID] = imageFile
	return builder
}

func (builder fileBuilder) buildDirectory(id uint) Directory {
	return builder.directories[id]
}

func (builder fileBuilder) buildImageFile(id uint) ImageFile {
	return builder.imageFiles[id]
}

func TestImageFileService_importImageFiles(t *testing.T) {
	tester := newTester(t)
	tempDir := tester.config.ImageRootDirectory
	dbClient := tester.dbClient

	imageFileService := tester.getFileService()

	destinationDirectory := Directory{
		ID:   1,
		Name: "Directory 1",
	}
	tester.createDirectoryInFS(t, "Directory 1")
	duplicatedFileInFS := filepath.Join(destinationDirectory.Name, "other_image.jpg")
	tester.copyImageFile(t, "image.jpg", duplicatedFileInFS)
	duplicatedFileInDB := filepath.Join(destinationDirectory.Name, "other_image_in_db.jpg")
	tester.copyImageFile(t, "image.jpg", duplicatedFileInDB)
	tester.createDirectoryInFS(t, "testdata")
	tester.copyImageFile(t, "image.jpg", filepath.Join("testdata", "image2.jpg"))

	fileBuilder := tester.newFileBuilder().
		addDirectory(destinationDirectory).
		addImageFile(ImageFile{ID: 10, Name: "image2.jpg", ParentID: 1,
			ContentType: "image/jpeg",
			// Path:          "/files/image2.jpg",
			// localFilePath: filepath.Join(tempDir, "image2.jpg"),
		}).
		addImageFile(ImageFile{ID: 11, Name: "image.jpg", ParentID: 1,
			ContentType: "image/jpeg",
			// Path:          "/files/image.jpg",
			// localFilePath: filepath.Join(tempDir, "image.jpg"),
		})

	testCases := []struct {
		name                 string
		sourceFilePaths      []string
		destinationDirectory Directory
		want                 []ImageFile
		wantInsert           []db.File
		wantErrors           []error
	}{
		{
			name: "succeed to import an image file without an error",
			sourceFilePaths: []string{
				tempDir + "/testdata/image2.jpg",
			},
			destinationDirectory: fileBuilder.buildDirectory(1),
			want: []ImageFile{
				// id will be overwritten
				fileBuilder.buildImageFile(10),
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
			destinationDirectory: fileBuilder.buildDirectory(1),
			want: []ImageFile{
				// id will be overwritten
				fileBuilder.buildImageFile(11),
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
			got, gotErrs := imageFileService.importImageFiles(context.Background(), tc.destinationDirectory, tc.sourceFilePaths)
			if len(tc.wantErrors) > 0 {
				uw, ok := gotErrs.(interface{ Unwrap() []error })
				assert.True(t, ok)
				assert.Len(t, uw.Unwrap(), len(tc.wantErrors))
				for index, gotErr := range uw.Unwrap() {
					wantErr := tc.wantErrors[index]
					assert.ErrorIs(t, gotErr, wantErr)
				}
			} else {
				assert.NoError(t, gotErrs)
			}
			for i := range got {
				tc.want[i].ID = got[i].ID
			}
			assert.Equal(t, tc.want, got)

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
