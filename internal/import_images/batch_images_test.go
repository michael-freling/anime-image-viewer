package import_images

import (
	"context"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"testing"

	"github.com/michael-freling/anime-image-viewer/internal/config"
	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/michael-freling/anime-image-viewer/internal/image"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type Tester struct {
	logger         *slog.Logger
	config         config.Config
	dbClient       db.TestClient
	staticFilePath string
}

type testerOption struct {
	gormLoggerOption db.ClientOption
}

type newTesterOption func(*testerOption)

func newTester(t *testing.T, opts ...newTesterOption) Tester {
	t.Helper()

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	defaultOption := &testerOption{
		gormLoggerOption: db.WithNopLogger(),
	}
	for _, opt := range opts {
		opt(defaultOption)
	}

	dbClient := db.NewTestClient(t)

	cfg := config.Config{
		ImageRootDirectory: t.TempDir(),
	}

	return Tester{
		logger:         logger,
		config:         cfg,
		dbClient:       dbClient,
		staticFilePath: "/files",
	}
}

func (tester Tester) getBatchImageImporter() *BatchImageImporter {
	return NewBatchImageImporter(
		tester.logger,
		tester.dbClient.Client,
		tester.getDirectoryReader(),
		tester.getImageFileConverter(),
	)
}

func (tester Tester) getDirectoryReader() *image.DirectoryReader {
	return image.NewDirectoryReader(tester.config, tester.dbClient.Client)
}

func (tester Tester) getImageFileConverter() *image.ImageFileConverter {
	return image.NewImageFileConverter(tester.config)
}

func (tester Tester) createDirectoryInFS(t *testing.T, name string) string {
	t.Helper()

	path := filepath.Join(tester.config.ImageRootDirectory, name)
	require.NoError(t, os.MkdirAll(path, 0755))
	return path
}

func (tester Tester) getTestFilePath(filePath string) string {
	return filepath.Join("..", "..", "testdata", filePath)
}

func (tester Tester) newFileCreator() *image.FileCreator {
	return image.NewFileCreator(tester.config.ImageRootDirectory)
}

func TestImageFileService_importImageFiles(t *testing.T) {
	tester := newTester(t)
	dbClient := tester.dbClient

	imageFileService := tester.getBatchImageImporter()

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
			got, gotErrs := imageFileService.ImportImages(context.Background(), tc.destinationDirectory, tc.sourceFilePaths)
			if len(tc.wantErrors) > 0 {
				uw, ok := gotErrs.(interface{ Unwrap() []error })
				assert.True(t, ok)
				assert.Len(t, uw.Unwrap(), len(tc.wantErrors))
				unwrappedErrors := uw.Unwrap()
				for index, wantErr := range tc.wantErrors {
					gotErr := unwrappedErrors[index]
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
				got, err := db.FindByValue(dbClient.Client, want)
				want.ID = got.ID
				want.CreatedAt = got.CreatedAt
				want.UpdatedAt = got.UpdatedAt
				assert.NoError(t, err)
				assert.Equal(t, want, got)
			}
		})
	}
}
