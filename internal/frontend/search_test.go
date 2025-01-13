package frontend

import (
	"context"
	"testing"
	"time"

	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/michael-freling/anime-image-viewer/internal/image"
	"github.com/stretchr/testify/assert"
)

func TestSearchService_Search(t *testing.T) {
	tester := newTester(t)
	dbClient := tester.dbClient

	fileBuilder := tester.newFileCreator(t)
	for _, dir := range []image.Directory{
		{ID: 1, Name: "Directory 1"},
		{ID: 10, Name: "Directory 10", ParentID: 1},
		{ID: 100, Name: "Directory 100", ParentID: 10},

		// a root directory is Directory 2
		{ID: 2, Name: "Directory 2"},
	} {
		fileBuilder.CreateDirectory(dir)
	}
	for _, imageFile := range []image.ImageFile{
		// a root directory is Directory 1
		{ID: 11, Name: "image file 11", ParentID: 1},
		{ID: 12, Name: "image file 12", ParentID: 1},
		{ID: 101, Name: "image file 101", ParentID: 10},
		{ID: 102, Name: "image file 102", ParentID: 10},
		{ID: 1001, Name: "image file 1001", ParentID: 100},

		// a root directory is Directory 2
		{ID: 21, Name: "image file 21", ParentID: 2},
		{ID: 22, Name: "image file 22", ParentID: 2},
	} {
		fileBuilder.CreateImage(imageFile, image.TestImageFileJpeg)
		fileBuilder.AddImageCreatedAt(imageFile.ID, time.Date(2021, 1, 1, 0, 0, int(imageFile.ID), 0, time.UTC))
	}

	type testCase struct {
		name    string
		request SearchImagesRequest

		insertFiles    []db.File
		insertTags     []db.Tag
		insertFileTags []db.FileTag

		want    SearchImagesResponse
		wantErr error
	}
	runTest := func(t *testing.T, tc testCase) {
		t.Run(tc.name, func(t *testing.T) {
			dbClient.Truncate(t, &db.FileTag{}, &db.File{}, &db.Tag{})
			db.LoadTestData(t, dbClient, tc.insertFiles)
			db.LoadTestData(t, dbClient, tc.insertTags)
			db.LoadTestData(t, dbClient, tc.insertFileTags)

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
			assert.Equal(t, tc.want.Images, got.Images)
			for key := range tc.want.TaggedImages {
				assert.ElementsMatch(t, tc.want.TaggedImages[key], got.TaggedImages[key],
					"tagged images mismatch for tag %d", key,
				)
			}
			assert.Len(t, tc.want.TaggedImages, len(got.TaggedImages))
		})
	}

	t.Run("search in a directory", func(t *testing.T) {
		testCases := []testCase{
			{
				name:    "Search a few image files",
				request: SearchImagesRequest{DirectoryID: 1},
				insertFiles: []db.File{
					fileBuilder.BuildDBDirectory(1),
					fileBuilder.BuildDBImageFile(11),
					fileBuilder.BuildDBImageFile(12),
				},
				want: SearchImagesResponse{
					Images: []Image{
						fileBuilder.buildFrontendImage(12),
						fileBuilder.buildFrontendImage(11),
					},
				},
			},
			{
				name:    "No image file",
				request: SearchImagesRequest{DirectoryID: 1},
				insertFiles: []db.File{
					fileBuilder.BuildDBDirectory(1),
				},
			},
		}

		for _, tc := range testCases {
			runTest(t, tc)
		}
	})

	t.Run("search by a tag id", func(t *testing.T) {
		testCases := []testCase{
			{
				name:    "Search a few image files",
				request: SearchImagesRequest{TagID: 1},
				insertFiles: []db.File{
					fileBuilder.BuildDBDirectory(1),
					fileBuilder.BuildDBDirectory(10),
					fileBuilder.BuildDBImageFile(11),
					fileBuilder.BuildDBImageFile(12),
					fileBuilder.BuildDBImageFile(101),
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
					{FileID: 11, TagID: 2},    // a tag unrelated to an input tag
					{FileID: 10, TagID: 10},   // a tag for an intermediate directory
					{FileID: 101, TagID: 100}, // a tag for a direct file
				},
				want: SearchImagesResponse{
					TaggedImages: map[uint][]uint{
						1:   {11, 12, 101},
						10:  {101},
						100: {101},
					},
					Images: []Image{
						fileBuilder.buildFrontendImage(101),
						fileBuilder.buildFrontendImage(12),
						fileBuilder.buildFrontendImage(11),
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
			runTest(t, tc)
		}
	})

	t.Run("tag invert search", func(t *testing.T) {
		testCases := []testCase{
			{
				name: "There is an image without a tag",
				request: SearchImagesRequest{
					DirectoryID:         1,
					TagID:               1,
					IsInvertedTagSearch: true,
				},
				insertFiles: []db.File{
					fileBuilder.BuildDBDirectory(1),
					fileBuilder.BuildDBDirectory(10),
					fileBuilder.BuildDBImageFile(11),
					fileBuilder.BuildDBImageFile(12),
					fileBuilder.BuildDBImageFile(101),
				},
				insertTags: []db.Tag{
					{ID: 1, Name: "tag 1"},
					{ID: 10, Name: "tag 10", ParentID: 1},
					{ID: 11, Name: "tag 11", ParentID: 1},
					{ID: 100, Name: "tag 100", ParentID: 10},

					{ID: 2, Name: "tag 2"},
				},
				insertFileTags: []db.FileTag{
					{FileID: 11, TagID: 2},   // a file with a different tag
					{FileID: 12, TagID: 100}, // a file with a tag
					{FileID: 101, TagID: 1},  // a file not in a parent directory
				},
				want: SearchImagesResponse{
					Images: []Image{
						fileBuilder.buildFrontendImage(11),
					},
				},
			},

			{
				name: "all files have a tag in a directory",
				request: SearchImagesRequest{
					DirectoryID:         1,
					TagID:               1,
					IsInvertedTagSearch: true,
				},
				insertFiles: []db.File{
					fileBuilder.BuildDBDirectory(1),
					fileBuilder.BuildDBImageFile(11),
					fileBuilder.BuildDBImageFile(12),
				},
				insertTags: []db.Tag{
					{ID: 1, Name: "tag 1"},
					{ID: 10, Name: "tag 10", ParentID: 1},
					{ID: 100, Name: "tag 100", ParentID: 10},
				},
				insertFileTags: []db.FileTag{
					{FileID: 11, TagID: 100},
					{FileID: 12, TagID: 100},
				},
			},
			{
				name: "a directory has the tag",
				request: SearchImagesRequest{
					DirectoryID:         10,
					TagID:               1,
					IsInvertedTagSearch: true,
				},
				insertFiles: []db.File{
					fileBuilder.BuildDBDirectory(1),
					fileBuilder.BuildDBDirectory(10),
					fileBuilder.BuildDBImageFile(101),
				},
				insertTags: []db.Tag{
					{ID: 1, Name: "tag 1"},
					{ID: 10, Name: "tag 10", ParentID: 1},
					{ID: 100, Name: "tag 100", ParentID: 10},
				},
				insertFileTags: []db.FileTag{
					{FileID: 10, TagID: 100},
				},
			},
		}
		for _, tc := range testCases {
			runTest(t, tc)
		}
	})

	t.Run("search by a complex condition", func(t *testing.T) {
		testCases := []testCase{
			{
				name: "Search a tag added to a file",
				request: SearchImagesRequest{
					DirectoryID: 10,
					TagID:       1,
				},
				insertFiles: []db.File{
					fileBuilder.BuildDBDirectory(1),
					fileBuilder.BuildDBDirectory(10),
					fileBuilder.BuildDBImageFile(11),
					fileBuilder.BuildDBImageFile(12),
					fileBuilder.BuildDBImageFile(101),
				},
				insertTags: []db.Tag{
					{ID: 1, Name: "tag 1"},
					{ID: 2, Name: "tag 2"},
					{ID: 10, Name: "tag 10", ParentID: 1},
					{ID: 11, Name: "tag 11", ParentID: 1}, // a tag without an file
					{ID: 100, Name: "tag 100", ParentID: 10},
				},
				insertFileTags: []db.FileTag{
					{FileID: 11, TagID: 10},   // a tag for a direct file
					{FileID: 101, TagID: 101}, // a tag unrelated to an input tag
				},
				want: SearchImagesResponse{
					TaggedImages: map[uint][]uint{
						10: {11},
					},
					Images: []Image{
						fileBuilder.buildFrontendImage(11),
					},
				},
			},
			{
				name: "Search a tag added to a directory",
				request: SearchImagesRequest{
					DirectoryID: 10,
					TagID:       10,
				},
				insertFiles: []db.File{
					fileBuilder.BuildDBDirectory(1),
					fileBuilder.BuildDBDirectory(10),
					fileBuilder.BuildDBImageFile(11),
					fileBuilder.BuildDBImageFile(12),
					fileBuilder.BuildDBDirectory(100),
					fileBuilder.BuildDBImageFile(101),
					fileBuilder.BuildDBImageFile(102),
					fileBuilder.BuildDBImageFile(1001),
					fileBuilder.BuildDBDirectory(2),
					fileBuilder.BuildDBImageFile(21),
					fileBuilder.BuildDBImageFile(22),
				},
				insertTags: []db.Tag{
					{ID: 1, Name: "tag 1"},
					{ID: 10, Name: "tag 10", ParentID: 1},
					{ID: 100, Name: "tag 100", ParentID: 10},
				},
				insertFileTags: []db.FileTag{
					{FileID: 10, TagID: 100},  // a tag added to a directory
					{FileID: 100, TagID: 100}, // a tag in a different directory. No recursive search for a directory
					{FileID: 2, TagID: 10},    // a tag added to a directory but it's in a different directory
				},
				want: SearchImagesResponse{
					TaggedImages: map[uint][]uint{
						100: {101, 102},
					},
					Images: []Image{
						fileBuilder.buildFrontendImage(102),
						fileBuilder.buildFrontendImage(101),
					},
				},
			},
			{
				name: "no file was found in a directory",
				request: SearchImagesRequest{
					DirectoryID: 10,
					TagID:       10,
				},
				insertFiles: []db.File{
					fileBuilder.BuildDBDirectory(1),
					fileBuilder.BuildDBDirectory(10),
					fileBuilder.BuildDBImageFile(11),
				},
				insertTags: []db.Tag{
					{ID: 1, Name: "tag 1"},
					{ID: 10, Name: "tag 10", ParentID: 1},
					{ID: 100, Name: "tag 100", ParentID: 10},
				},
				insertFileTags: []db.FileTag{
					{FileID: 1, TagID: 10}, // a tag added to a directory
				},
			},

			{
				name: "no file was found by a tag",
				request: SearchImagesRequest{
					DirectoryID: 1,
					TagID:       999,
				},
				insertFiles: []db.File{
					fileBuilder.BuildDBDirectory(1),
					fileBuilder.BuildDBImageFile(11),
				},
				insertTags: []db.Tag{
					{ID: 1, Name: "tag 1"},
					{ID: 10, Name: "tag 10", ParentID: 1},
					{ID: 100, Name: "tag 100", ParentID: 10},
				},
				insertFileTags: []db.FileTag{
					{FileID: 1, TagID: 10}, // a tag added to a directory
				},
			},
		}
		for _, tc := range testCases {
			runTest(t, tc)
		}
	})
}
