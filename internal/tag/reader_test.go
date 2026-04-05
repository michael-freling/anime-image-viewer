package tag

import (
	"context"
	"testing"

	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/michael-freling/anime-image-viewer/internal/image"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestReader_ReadAllTags(t *testing.T) {
	tester := newTester(t)
	dbClient := tester.dbClient
	reader := tester.getReader()

	testCases := []struct {
		name       string
		insertTags []db.Tag
		wantTags   []Tag
	}{
		{
			name:       "no tags returns nil",
			insertTags: nil,
			wantTags:   nil,
		},
		{
			name: "single tag",
			insertTags: []db.Tag{
				{ID: 1, Name: "tag1"},
			},
			wantTags: []Tag{
				{ID: 1, Name: "tag1"},
			},
		},
		{
			name: "multiple tags",
			insertTags: []db.Tag{
				{ID: 1, Name: "alpha"},
				{ID: 2, Name: "beta"},
			},
			wantTags: []Tag{
				{ID: 1, Name: "alpha"},
				{ID: 2, Name: "beta"},
			},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			dbClient.Truncate(&db.Tag{})
			if len(tc.insertTags) > 0 {
				require.NoError(t, db.BatchCreate(dbClient, tc.insertTags))
			}

			got, err := reader.ReadAllTags()
			require.NoError(t, err)
			assert.Equal(t, tc.wantTags, got)
		})
	}
}

func TestReader_ReadDBTagRecursively(t *testing.T) {
	tester := newTester(t)
	dbClient := tester.dbClient
	reader := tester.getReader()

	testCases := []struct {
		name           string
		insertTags     []db.Tag
		insertFileTags []db.FileTag
		tagID          uint
		wantFileTags   db.FileTagList
	}{
		{
			name:         "no file tags returns empty",
			insertTags:   nil,
			tagID:        1,
			wantFileTags: db.FileTagList{},
		},
		{
			name: "tag not found returns empty",
			insertTags: []db.Tag{
				{ID: 1, Name: "tag1"},
			},
			tagID:        999,
			wantFileTags: db.FileTagList{},
		},
		{
			name: "tag with file tags",
			insertTags: []db.Tag{
				{ID: 1, Name: "parent"},
				{ID: 10, Name: "child"},
			},
			insertFileTags: []db.FileTag{
				{FileID: 100, TagID: 10, AddedBy: db.FileTagAddedByUser},
				{FileID: 200, TagID: 10, AddedBy: db.FileTagAddedByUser},
			},
			tagID: 10,
			wantFileTags: db.FileTagList{
				{FileID: 100, TagID: 10, AddedBy: db.FileTagAddedByUser},
				{FileID: 200, TagID: 10, AddedBy: db.FileTagAddedByUser},
			},
		},
		{
			name: "only returns file tags for the requested tag",
			insertTags: []db.Tag{
				{ID: 1, Name: "parent"},
				{ID: 10, Name: "child"},
				{ID: 100, Name: "grandchild"},
			},
			insertFileTags: []db.FileTag{
				{FileID: 1000, TagID: 1, AddedBy: db.FileTagAddedByUser},
				{FileID: 1001, TagID: 10, AddedBy: db.FileTagAddedByUser},
				{FileID: 1002, TagID: 100, AddedBy: db.FileTagAddedByUser},
			},
			tagID: 1,
			wantFileTags: db.FileTagList{
				{FileID: 1000, TagID: 1, AddedBy: db.FileTagAddedByUser},
			},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			dbClient.Truncate(&db.Tag{}, &db.FileTag{})
			if len(tc.insertTags) > 0 {
				require.NoError(t, db.BatchCreate(dbClient, tc.insertTags))
			}
			if len(tc.insertFileTags) > 0 {
				require.NoError(t, db.BatchCreate(dbClient, tc.insertFileTags))
			}

			got, err := reader.ReadDBTagRecursively(tc.tagID)
			require.NoError(t, err)

			if len(tc.wantFileTags) == 0 {
				assert.Empty(t, got)
			} else {
				assert.Len(t, got, len(tc.wantFileTags))
				for _, wantFT := range tc.wantFileTags {
					found := false
					for _, gotFT := range got {
						if gotFT.FileID == wantFT.FileID && gotFT.TagID == wantFT.TagID {
							found = true
							break
						}
					}
					assert.True(t, found, "expected file tag (FileID=%d, TagID=%d) not found", wantFT.FileID, wantFT.TagID)
				}
			}
		})
	}
}

func TestReader_ReadDirectoryTags(t *testing.T) {
	tester := newTester(t)
	dbClient := tester.dbClient
	reader := tester.getReader()

	testCases := []struct {
		name           string
		directory      image.Directory
		insertFileTags []db.FileTag
		wantFileTags   []db.FileTag
	}{
		{
			name: "directory with no tags",
			directory: image.Directory{
				ID:   1,
				Name: "dir1",
			},
			insertFileTags: nil,
			wantFileTags:   nil,
		},
		{
			name: "directory with direct tags only",
			directory: image.Directory{
				ID:   1,
				Name: "dir1",
			},
			insertFileTags: []db.FileTag{
				{FileID: 1, TagID: 10, AddedBy: db.FileTagAddedByUser},
				{FileID: 1, TagID: 20, AddedBy: db.FileTagAddedByUser},
				{FileID: 999, TagID: 30, AddedBy: db.FileTagAddedByUser}, // unrelated file
			},
			wantFileTags: []db.FileTag{
				{FileID: 1, TagID: 10, AddedBy: db.FileTagAddedByUser},
				{FileID: 1, TagID: 20, AddedBy: db.FileTagAddedByUser},
			},
		},
		{
			name: "directory with descendants",
			directory: image.Directory{
				ID:   1,
				Name: "dir1",
				Children: []*image.Directory{
					{
						ID:       10,
						Name:     "subdir1",
						ParentID: 1,
						Children: []*image.Directory{
							{
								ID:       100,
								Name:     "subsubdir1",
								ParentID: 10,
							},
						},
					},
				},
			},
			insertFileTags: []db.FileTag{
				{FileID: 1, TagID: 10, AddedBy: db.FileTagAddedByUser},
				{FileID: 10, TagID: 20, AddedBy: db.FileTagAddedByUser},
				{FileID: 100, TagID: 30, AddedBy: db.FileTagAddedByUser},
			},
			wantFileTags: []db.FileTag{
				{FileID: 1, TagID: 10, AddedBy: db.FileTagAddedByUser},
				{FileID: 10, TagID: 20, AddedBy: db.FileTagAddedByUser},
				{FileID: 100, TagID: 30, AddedBy: db.FileTagAddedByUser},
			},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			dbClient.Truncate(&db.FileTag{})
			if len(tc.insertFileTags) > 0 {
				require.NoError(t, db.BatchCreate(dbClient, tc.insertFileTags))
			}

			got, err := reader.ReadDirectoryTags(context.Background(), tc.directory)
			require.NoError(t, err)

			if tc.wantFileTags == nil {
				assert.Empty(t, got)
			} else {
				assert.Len(t, got, len(tc.wantFileTags))
				for _, wantFT := range tc.wantFileTags {
					found := false
					for _, gotFT := range got {
						if gotFT.FileID == wantFT.FileID && gotFT.TagID == wantFT.TagID {
							found = true
							break
						}
					}
					assert.True(t, found, "expected file tag (FileID=%d, TagID=%d) not found", wantFT.FileID, wantFT.TagID)
				}
			}
		})
	}
}
