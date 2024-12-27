package frontend

import (
	"context"
	"log/slog"
	"testing"

	"github.com/google/go-cmp/cmp"
	"github.com/google/go-cmp/cmp/cmpopts"
	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/michael-freling/anime-image-viewer/internal/xassert"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSearchService_Search(t *testing.T) {
	tester := newTester(t, withGormLogger(slog.Default()))
	dbClient := tester.dbClient

	fileBuilder := newFileBuilder().
		addDirectory(Directory{ID: 1, Name: "Directory 1"}).
		addDirectory(Directory{ID: 10, Name: "Directory 10", ParentID: 1}).
		addImage(Image{ID: 2, Name: "image file 2", parentID: 1}).
		addImage(Image{ID: 3, Name: "image file 3", parentID: 1}).
		addImage(Image{ID: 100, Name: "image file 100", parentID: 10})
	for _, image := range []Image{
		fileBuilder.buildImage(2),
		fileBuilder.buildImage(3),
		fileBuilder.buildImage(100),
	} {
		tester.copyImageFile(t, "image.jpg", image.Path)
	}

	t.Run("search by a directory", func(t *testing.T) {
		testCases := []struct {
			name    string
			request SearchImagesRequest

			insertFiles []db.File
			want        SearchImagesResponse
			wantErr     error
		}{
			{
				name:    "Search a few image files",
				request: SearchImagesRequest{ParentDirectoryID: 1},
				insertFiles: []db.File{
					fileBuilder.buildDBDirectory(1),
					fileBuilder.buildDBImage(2),
					fileBuilder.buildDBImage(3),
				},
				want: SearchImagesResponse{
					Images: []Image{
						fileBuilder.buildImage(2),
						fileBuilder.buildImage(3),
					},
				},
			},
			{
				name:    "No image file",
				request: SearchImagesRequest{ParentDirectoryID: 1},
				insertFiles: []db.File{
					fileBuilder.buildDBDirectory(1),
				},
				wantErr: ErrImageNotFound,
			},
		}

		for _, tc := range testCases {
			t.Run(tc.name, func(t *testing.T) {
				require.NoError(t, dbClient.Truncate(&db.File{}))
				if len(tc.insertFiles) > 0 {
					require.NoError(t, db.BatchCreate(dbClient, tc.insertFiles))
				}

				got, gotErr := tester.getSearchService().
					SearchImages(context.Background(), tc.request)
				if tc.wantErr != nil {
					assert.ErrorIs(t, gotErr, tc.wantErr)
					return
				}
				assert.NoError(t, gotErr)
				xassert.ElementsMatch(t, tc.want.Images, got.Images,
					cmpopts.SortSlices(func(a, b Image) bool { return a.ID < b.ID }),
					cmp.AllowUnexported(Image{}),
				)
			})
		}
	})

	t.Run("search by a tag id", func(t *testing.T) {
		testCases := []struct {
			name    string
			request SearchImagesRequest

			insertFiles    []db.File
			insertTags     []db.Tag
			insertFileTags []db.FileTag

			want    SearchImagesResponse
			wantErr error
		}{
			{
				name:    "Search a few image files",
				request: SearchImagesRequest{TagID: 1},
				insertFiles: []db.File{
					fileBuilder.buildDBDirectory(1),
					fileBuilder.buildDBImage(2),
					fileBuilder.buildDBImage(3),
					fileBuilder.buildDBDirectory(10),
					fileBuilder.buildDBImage(100),
				},
				insertTags: []db.Tag{
					{ID: 1, Name: "tag 1"},
					{ID: 2, Name: "tag 2"},
					{ID: 10, Name: "tag 10", ParentID: 1},
					{ID: 11, Name: "tag 11", ParentID: 1}, // a tag without an file
					{ID: 100, Name: "tag 100", ParentID: 10},
				},
				insertFileTags: []db.FileTag{
					{FileID: 1, TagID: 1},     // a top tag for a directory
					{FileID: 2, TagID: 2},     // a tag unrelated to an input tag
					{FileID: 10, TagID: 10},   // a tag for an intermediate directory
					{FileID: 100, TagID: 100}, // a tag for a direct file
				},
				want: SearchImagesResponse{
					TaggedImages: map[uint][]uint{
						1:   {2, 3, 100},
						10:  {100},
						100: {100},
					},
					Images: []Image{
						fileBuilder.buildImage(2),
						fileBuilder.buildImage(3),
						fileBuilder.buildImage(100),
					},
				},
			},

			{
				name:    "No tag",
				request: SearchImagesRequest{TagID: 1},
			},
			{
				name:    "No image file for a tag",
				request: SearchImagesRequest{TagID: 1},
				insertFileTags: []db.FileTag{
					{FileID: 1, TagID: 1},
				},
			},
		}

		for _, tc := range testCases {
			t.Run(tc.name, func(t *testing.T) {
				require.NoError(t, dbClient.Truncate(&db.FileTag{}, &db.File{}, &db.Tag{}))
				if len(tc.insertFiles) > 0 {
					require.NoError(t, db.BatchCreate(dbClient, tc.insertFiles))
				}
				if len(tc.insertTags) > 0 {
					require.NoError(t, db.BatchCreate(dbClient, tc.insertTags))
				}
				if len(tc.insertFileTags) > 0 {
					require.NoError(t, db.BatchCreate(dbClient, tc.insertFileTags))
				}

				got, gotErr := tester.getSearchService().
					SearchImages(context.Background(), tc.request)
				if tc.wantErr != nil {
					assert.ErrorIs(t, gotErr, tc.wantErr)
					return
				}
				assert.NoError(t, gotErr)
				if got.Images == nil {
					assert.Equal(t, tc.want, got)
					return
				}
				xassert.ElementsMatch(t, tc.want.Images, got.Images,
					cmpopts.SortSlices(func(a, b Image) bool { return a.ID < b.ID }),
					cmp.AllowUnexported(Image{}),
				)
				assert.Equal(t, tc.want.TaggedImages, got.TaggedImages)
			})
		}
	})
}
