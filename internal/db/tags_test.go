package db

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestTagClient_Tag(t *testing.T) {
	testClient := NewTestClient(t)
	tagClient := testClient.Tag()
	require.NotNil(t, tagClient)
	require.NotNil(t, tagClient.ORMClient)
}

func TestTagClient_FindAllByTagIDs(t *testing.T) {
	testClient := NewTestClient(t)
	testClient.Truncate(t, Tag{})

	tags := []Tag{
		{ID: 5001, Name: "tag1"},
		{ID: 5002, Name: "tag2"},
		{ID: 5003, Name: "tag3"},
	}
	LoadTestData(t, testClient, tags)

	tagClient := testClient.Tag()

	t.Run("find tags by IDs", func(t *testing.T) {
		got, err := tagClient.FindAllByTagIDs([]uint{5001, 5003})
		assert.NoError(t, err)
		assert.Len(t, got, 2)
	})

	t.Run("find tags with single ID", func(t *testing.T) {
		got, err := tagClient.FindAllByTagIDs([]uint{5002})
		assert.NoError(t, err)
		assert.Len(t, got, 1)
		assert.Equal(t, "tag2", got[0].Name)
	})

	t.Run("find tags with no matching IDs", func(t *testing.T) {
		got, err := tagClient.FindAllByTagIDs([]uint{9999})
		assert.NoError(t, err)
		assert.Empty(t, got)
	})
}

func TestFileTagClient_FileTag(t *testing.T) {
	testClient := NewTestClient(t)
	ftClient := testClient.FileTag()
	require.NotNil(t, ftClient)
	require.NotNil(t, ftClient.ORMClient)
}

func TestFileTagList_ContainsFileID(t *testing.T) {
	tags := FileTagList{
		{TagID: 1, FileID: 10},
		{TagID: 2, FileID: 20},
		{TagID: 3, FileID: 30},
	}

	assert.True(t, tags.ContainsFileID(10))
	assert.True(t, tags.ContainsFileID(20))
	assert.True(t, tags.ContainsFileID(30))
	assert.False(t, tags.ContainsFileID(99))

	// Empty list
	empty := FileTagList{}
	assert.False(t, empty.ContainsFileID(1))
}

func TestFileTagList_ToFileIDs(t *testing.T) {
	t.Run("unique file IDs", func(t *testing.T) {
		tags := FileTagList{
			{TagID: 1, FileID: 10},
			{TagID: 2, FileID: 20},
			{TagID: 3, FileID: 30},
		}
		got := tags.ToFileIDs()
		assert.ElementsMatch(t, []uint{10, 20, 30}, got)
	})

	t.Run("deduplicate file IDs", func(t *testing.T) {
		tags := FileTagList{
			{TagID: 1, FileID: 10},
			{TagID: 2, FileID: 10},
			{TagID: 3, FileID: 20},
		}
		got := tags.ToFileIDs()
		assert.ElementsMatch(t, []uint{10, 20}, got)
	})

	t.Run("empty list", func(t *testing.T) {
		tags := FileTagList{}
		got := tags.ToFileIDs()
		assert.Empty(t, got)
	})
}

func TestFileTagList_ToTagMap(t *testing.T) {
	tags := FileTagList{
		{TagID: 1, FileID: 10, AddedBy: FileTagAddedByUser},
		{TagID: 1, FileID: 20, AddedBy: FileTagAddedByImport},
		{TagID: 2, FileID: 10, AddedBy: FileTagAddedBySuggestion},
	}

	got := tags.ToTagMap()

	// Verify structure: map[tagID]map[fileID]FileTag
	assert.Len(t, got, 2)
	assert.Len(t, got[1], 2)
	assert.Len(t, got[2], 1)

	assert.Equal(t, FileTagAddedByUser, got[1][10].AddedBy)
	assert.Equal(t, FileTagAddedByImport, got[1][20].AddedBy)
	assert.Equal(t, FileTagAddedBySuggestion, got[2][10].AddedBy)
}

func TestFileTagList_ToFileMap(t *testing.T) {
	tags := FileTagList{
		{TagID: 1, FileID: 10, AddedBy: FileTagAddedByUser},
		{TagID: 2, FileID: 10, AddedBy: FileTagAddedByImport},
		{TagID: 1, FileID: 20, AddedBy: FileTagAddedBySuggestion},
	}

	got := tags.ToFileMap()

	// Verify structure: map[fileID]map[tagID]FileTag
	assert.Len(t, got, 2)
	assert.Len(t, got[10], 2)
	assert.Len(t, got[20], 1)

	assert.Equal(t, FileTagAddedByUser, got[10][1].AddedBy)
	assert.Equal(t, FileTagAddedByImport, got[10][2].AddedBy)
	assert.Equal(t, FileTagAddedBySuggestion, got[20][1].AddedBy)
}

func TestFileTagClient_FindAllByFileID(t *testing.T) {
	testClient := NewTestClient(t)
	testClient.Truncate(t, FileTag{}, File{}, Tag{})

	tags := []Tag{
		{ID: 6001, Name: "tag1"},
		{ID: 6002, Name: "tag2"},
	}
	files := []File{
		{ID: 6010, ParentID: 0, Name: "dir1", Type: FileTypeDirectory},
		{ID: 6020, ParentID: 6010, Name: "img1.jpg", Type: FileTypeImage},
		{ID: 6030, ParentID: 6010, Name: "img2.jpg", Type: FileTypeImage},
	}
	fileTags := []FileTag{
		{TagID: 6001, FileID: 6020, AddedBy: FileTagAddedByUser},
		{TagID: 6002, FileID: 6020, AddedBy: FileTagAddedByImport},
		{TagID: 6001, FileID: 6030, AddedBy: FileTagAddedByUser},
	}
	LoadTestData(t, testClient, tags)
	LoadTestData(t, testClient, files)
	LoadTestData(t, testClient, fileTags)

	ftClient := testClient.FileTag()

	t.Run("find file tags by single file ID", func(t *testing.T) {
		got, err := ftClient.FindAllByFileID([]uint{6020})
		assert.NoError(t, err)
		assert.Len(t, got, 2)
	})

	t.Run("find file tags by multiple file IDs", func(t *testing.T) {
		got, err := ftClient.FindAllByFileID([]uint{6020, 6030})
		assert.NoError(t, err)
		assert.Len(t, got, 3)
	})

	t.Run("no matching file IDs", func(t *testing.T) {
		got, err := ftClient.FindAllByFileID([]uint{9999})
		assert.NoError(t, err)
		assert.Empty(t, got)
	})
}

func TestFileTagClient_FindAllByTagIDs(t *testing.T) {
	testClient := NewTestClient(t)
	testClient.Truncate(t, FileTag{}, File{}, Tag{})

	tags := []Tag{
		{ID: 7001, Name: "tag1"},
		{ID: 7002, Name: "tag2"},
		{ID: 7003, Name: "tag3"},
	}
	files := []File{
		{ID: 7010, ParentID: 0, Name: "img1.jpg", Type: FileTypeImage},
		{ID: 7020, ParentID: 0, Name: "img2.jpg", Type: FileTypeImage},
	}
	fileTags := []FileTag{
		{TagID: 7001, FileID: 7010, AddedBy: FileTagAddedByUser},
		{TagID: 7002, FileID: 7010, AddedBy: FileTagAddedByUser},
		{TagID: 7002, FileID: 7020, AddedBy: FileTagAddedByUser},
		{TagID: 7003, FileID: 7020, AddedBy: FileTagAddedByUser},
	}
	LoadTestData(t, testClient, tags)
	LoadTestData(t, testClient, files)
	LoadTestData(t, testClient, fileTags)

	ftClient := testClient.FileTag()

	t.Run("find file tags by single tag ID", func(t *testing.T) {
		got, err := ftClient.FindAllByTagIDs([]uint{7002})
		assert.NoError(t, err)
		assert.Len(t, got, 2)
	})

	t.Run("find file tags by multiple tag IDs", func(t *testing.T) {
		got, err := ftClient.FindAllByTagIDs([]uint{7001, 7003})
		assert.NoError(t, err)
		assert.Len(t, got, 2)
	})

	t.Run("no matching tag IDs", func(t *testing.T) {
		got, err := ftClient.FindAllByTagIDs([]uint{9999})
		assert.NoError(t, err)
		assert.Empty(t, got)
	})
}

func TestFileTagClient_DeleteByTagIDs(t *testing.T) {
	testClient := NewTestClient(t)
	testClient.Truncate(t, FileTag{}, File{}, Tag{})

	tags := []Tag{
		{ID: 8501, Name: "tag1"},
		{ID: 8502, Name: "tag2"},
	}
	files := []File{
		{ID: 8510, ParentID: 0, Name: "img1.jpg", Type: FileTypeImage},
		{ID: 8520, ParentID: 0, Name: "img2.jpg", Type: FileTypeImage},
	}
	fileTags := []FileTag{
		{TagID: 8501, FileID: 8510, AddedBy: FileTagAddedByUser},
		{TagID: 8501, FileID: 8520, AddedBy: FileTagAddedByUser},
		{TagID: 8502, FileID: 8510, AddedBy: FileTagAddedByUser},
		{TagID: 8502, FileID: 8520, AddedBy: FileTagAddedByUser},
	}
	LoadTestData(t, testClient, tags)
	LoadTestData(t, testClient, files)
	LoadTestData(t, testClient, fileTags)

	ftClient := testClient.FileTag()
	ctx := context.Background()

	t.Run("empty tag IDs is a no-op", func(t *testing.T) {
		err := ftClient.DeleteByTagIDs(ctx, nil)
		assert.NoError(t, err)

		remaining, err := ftClient.FindAllByTagIDs([]uint{8501, 8502})
		assert.NoError(t, err)
		assert.Len(t, remaining, 4)
	})

	t.Run("delete all file-tags for given tag IDs", func(t *testing.T) {
		err := ftClient.DeleteByTagIDs(ctx, []uint{8501})
		assert.NoError(t, err)

		remaining, err := ftClient.FindAllByTagIDs([]uint{8501, 8502})
		assert.NoError(t, err)
		assert.Len(t, remaining, 2)
		for _, ft := range remaining {
			assert.Equal(t, uint(8502), ft.TagID)
		}
	})
}

func TestFileTagClient_BatchDelete(t *testing.T) {
	testClient := NewTestClient(t)
	testClient.Truncate(t, FileTag{}, File{}, Tag{})

	tags := []Tag{
		{ID: 8001, Name: "tag1"},
		{ID: 8002, Name: "tag2"},
	}
	files := []File{
		{ID: 8010, ParentID: 0, Name: "img1.jpg", Type: FileTypeImage},
		{ID: 8020, ParentID: 0, Name: "img2.jpg", Type: FileTypeImage},
	}
	fileTags := []FileTag{
		{TagID: 8001, FileID: 8010, AddedBy: FileTagAddedByUser},
		{TagID: 8001, FileID: 8020, AddedBy: FileTagAddedByUser},
		{TagID: 8002, FileID: 8010, AddedBy: FileTagAddedByUser},
		{TagID: 8002, FileID: 8020, AddedBy: FileTagAddedByUser},
	}
	LoadTestData(t, testClient, tags)
	LoadTestData(t, testClient, files)
	LoadTestData(t, testClient, fileTags)

	ftClient := testClient.FileTag()
	ctx := context.Background()

	// Delete tag 8001 from file 8010 and file 8020
	err := ftClient.BatchDelete(ctx, []uint{8001}, []uint{8010, 8020})
	assert.NoError(t, err)

	// Verify only tag 8002 file tags remain
	remaining, err := ftClient.FindAllByTagIDs([]uint{8001, 8002})
	assert.NoError(t, err)
	assert.Len(t, remaining, 2)
	for _, ft := range remaining {
		assert.Equal(t, uint(8002), ft.TagID)
	}
}
