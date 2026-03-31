package tag

import (
	"context"
	"testing"

	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/michael-freling/anime-image-viewer/internal/image"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestReader_ReadRootNode(t *testing.T) {
	tester := newTester(t)
	dbClient := tester.dbClient
	reader := tester.getReader()

	testCases := []struct {
		name       string
		insertTags []db.Tag
		wantTag    Tag
		wantErr    bool
	}{
		{
			name:       "no tags returns empty tag",
			insertTags: nil,
			wantTag:    Tag{},
		},
		{
			name: "single top-level tag",
			insertTags: []db.Tag{
				{ID: 1, Name: "tag1"},
			},
			wantTag: Tag{
				Children: []*Tag{
					{ID: 1, Name: "tag1", FullName: "tag1"},
				},
			},
		},
		{
			name: "multiple top-level tags sorted by name",
			insertTags: []db.Tag{
				{ID: 1, Name: "zebra"},
				{ID: 2, Name: "alpha"},
			},
			wantTag: Tag{
				Children: []*Tag{
					{ID: 2, Name: "alpha", FullName: "alpha"},
					{ID: 1, Name: "zebra", FullName: "zebra"},
				},
			},
		},
		{
			name: "nested tags",
			insertTags: []db.Tag{
				{ID: 1, Name: "parent"},
				{ID: 10, Name: "child", ParentID: 1},
				{ID: 100, Name: "grandchild", ParentID: 10},
			},
			wantTag: Tag{
				Children: []*Tag{
					{
						ID:       1,
						Name:     "parent",
						FullName: "parent",
						Children: []*Tag{
							{
								ID:       10,
								Name:     "child",
								ParentID: 1,
								FullName: "parent > child",
								Children: []*Tag{
									{
										ID:       100,
										Name:     "grandchild",
										ParentID: 10,
										FullName: "parent > child > grandchild",
									},
								},
							},
						},
					},
				},
			},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			dbClient.Truncate(&db.Tag{})
			if len(tc.insertTags) > 0 {
				require.NoError(t, db.BatchCreate(dbClient, tc.insertTags))
			}

			got, err := reader.ReadRootNode()
			if tc.wantErr {
				assert.Error(t, err)
				return
			}
			require.NoError(t, err)

			// Compare IDs, names, and structure
			assertTagTreeEqual(t, tc.wantTag, got)
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
			name:         "no tags in db returns nil",
			insertTags:   nil,
			tagID:        1,
			wantFileTags: nil,
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
			name: "leaf tag with file tags",
			insertTags: []db.Tag{
				{ID: 1, Name: "parent"},
				{ID: 10, Name: "child", ParentID: 1},
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
			name: "parent tag includes descendants file tags",
			insertTags: []db.Tag{
				{ID: 1, Name: "parent"},
				{ID: 10, Name: "child", ParentID: 1},
				{ID: 100, Name: "grandchild", ParentID: 10},
			},
			insertFileTags: []db.FileTag{
				{FileID: 1000, TagID: 1, AddedBy: db.FileTagAddedByUser},
				{FileID: 1001, TagID: 10, AddedBy: db.FileTagAddedByUser},
				{FileID: 1002, TagID: 100, AddedBy: db.FileTagAddedByUser},
			},
			tagID: 1,
			wantFileTags: db.FileTagList{
				{FileID: 1000, TagID: 1, AddedBy: db.FileTagAddedByUser},
				{FileID: 1001, TagID: 10, AddedBy: db.FileTagAddedByUser},
				{FileID: 1002, TagID: 100, AddedBy: db.FileTagAddedByUser},
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

// assertTagTreeEqual compares two Tag trees ignoring unexported fields (parent pointer).
func assertTagTreeEqual(t *testing.T, want, got Tag) {
	t.Helper()
	assert.Equal(t, want.ID, got.ID, "ID mismatch")
	assert.Equal(t, want.Name, got.Name, "Name mismatch for ID=%d", want.ID)
	assert.Equal(t, want.FullName, got.FullName, "FullName mismatch for ID=%d", want.ID)
	assert.Equal(t, want.ParentID, got.ParentID, "ParentID mismatch for ID=%d", want.ID)

	if want.Children == nil {
		assert.Nil(t, got.Children, "expected nil Children for ID=%d", want.ID)
		return
	}

	require.Len(t, got.Children, len(want.Children), "Children length mismatch for ID=%d", want.ID)
	for i := range want.Children {
		assertTagTreeEqual(t, *want.Children[i], *got.Children[i])
	}
}
