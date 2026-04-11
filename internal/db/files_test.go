package db

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestFileClient_File(t *testing.T) {
	testClient := NewTestClient(t)
	fileClient := testClient.File()
	require.NotNil(t, fileClient)
	require.NotNil(t, fileClient.ORMClient)
}

func TestFileClient_FindImageFilesByParentID(t *testing.T) {
	testClient := NewTestClient(t)
	testClient.Truncate(t, File{})

	files := []File{
		{ID: 1001, ParentID: 0, Name: "dir1", Type: FileTypeDirectory},
		{ID: 1002, ParentID: 1001, Name: "img1.jpg", Type: FileTypeImage, ImageCreatedAt: 100},
		{ID: 1003, ParentID: 1001, Name: "img2.jpg", Type: FileTypeImage, ImageCreatedAt: 200},
		{ID: 1004, ParentID: 1001, Name: "subdir", Type: FileTypeDirectory},
		{ID: 1005, ParentID: 1002, Name: "img3.jpg", Type: FileTypeImage, ImageCreatedAt: 150},
	}
	LoadTestData(t, testClient, files)

	fileClient := testClient.File()

	t.Run("find images in directory with images", func(t *testing.T) {
		got, err := fileClient.FindImageFilesByParentID(1001)
		assert.NoError(t, err)
		assert.Len(t, got, 2)
		// Ordered by image_created_at desc
		assert.Equal(t, uint(1003), got[0].ID)
		assert.Equal(t, uint(1002), got[1].ID)
	})

	t.Run("find images in directory with one image", func(t *testing.T) {
		got, err := fileClient.FindImageFilesByParentID(1002)
		assert.NoError(t, err)
		assert.Len(t, got, 1)
		assert.Equal(t, uint(1005), got[0].ID)
	})

	t.Run("find images in empty directory", func(t *testing.T) {
		got, err := fileClient.FindImageFilesByParentID(9999)
		assert.NoError(t, err)
		assert.Empty(t, got)
	})
}

func TestFileClient_FindImageFilesByParentIDs(t *testing.T) {
	testClient := NewTestClient(t)
	testClient.Truncate(t, File{})

	files := []File{
		{ID: 2001, ParentID: 0, Name: "dir1", Type: FileTypeDirectory},
		{ID: 2002, ParentID: 0, Name: "dir2", Type: FileTypeDirectory},
		{ID: 2003, ParentID: 2001, Name: "img1.jpg", Type: FileTypeImage, ImageCreatedAt: 100},
		{ID: 2004, ParentID: 2001, Name: "img2.jpg", Type: FileTypeImage, ImageCreatedAt: 300},
		{ID: 2005, ParentID: 2002, Name: "img3.jpg", Type: FileTypeImage, ImageCreatedAt: 200},
		{ID: 2006, ParentID: 2002, Name: "subdir", Type: FileTypeDirectory},
	}
	LoadTestData(t, testClient, files)

	fileClient := testClient.File()

	t.Run("find images across multiple parent IDs", func(t *testing.T) {
		got, err := fileClient.FindImageFilesByParentIDs([]uint{2001, 2002})
		assert.NoError(t, err)
		assert.Len(t, got, 3)
		// Ordered by image_created_at desc
		assert.Equal(t, uint(2004), got[0].ID)
		assert.Equal(t, uint(2005), got[1].ID)
		assert.Equal(t, uint(2003), got[2].ID)
	})

	t.Run("find images with single parent ID", func(t *testing.T) {
		got, err := fileClient.FindImageFilesByParentIDs([]uint{2002})
		assert.NoError(t, err)
		assert.Len(t, got, 1)
		assert.Equal(t, uint(2005), got[0].ID)
	})

	t.Run("find images with no matching parent IDs", func(t *testing.T) {
		got, err := fileClient.FindImageFilesByParentIDs([]uint{9999})
		assert.NoError(t, err)
		assert.Empty(t, got)
	})
}

func TestFileClient_FindImageFilesByIDs(t *testing.T) {
	testClient := NewTestClient(t)
	testClient.Truncate(t, File{})

	files := []File{
		{ID: 3001, ParentID: 0, Name: "dir1", Type: FileTypeDirectory},
		{ID: 3002, ParentID: 3001, Name: "img1.jpg", Type: FileTypeImage, ImageCreatedAt: 100},
		{ID: 3003, ParentID: 3001, Name: "img2.jpg", Type: FileTypeImage, ImageCreatedAt: 300},
		{ID: 3004, ParentID: 3001, Name: "img3.jpg", Type: FileTypeImage, ImageCreatedAt: 200},
	}
	LoadTestData(t, testClient, files)

	fileClient := testClient.File()

	t.Run("find images by IDs", func(t *testing.T) {
		got, err := fileClient.FindImageFilesByIDs([]uint{3002, 3004})
		assert.NoError(t, err)
		assert.Len(t, got, 2)
		// Ordered by image_created_at desc
		assert.Equal(t, uint(3004), got[0].ID)
		assert.Equal(t, uint(3002), got[1].ID)
	})

	t.Run("excludes directories even if ID matches", func(t *testing.T) {
		got, err := fileClient.FindImageFilesByIDs([]uint{3001, 3002})
		assert.NoError(t, err)
		assert.Len(t, got, 1)
		assert.Equal(t, uint(3002), got[0].ID)
	})

	t.Run("no matching IDs", func(t *testing.T) {
		got, err := fileClient.FindImageFilesByIDs([]uint{9999})
		assert.NoError(t, err)
		assert.Empty(t, got)
	})
}

func TestFileClient_FindFilesByParentIDs(t *testing.T) {
	testClient := NewTestClient(t)
	testClient.Truncate(t, File{})

	files := []File{
		{ID: 3501, ParentID: 0, Name: "dir1", Type: FileTypeDirectory},
		{ID: 3502, ParentID: 0, Name: "dir2", Type: FileTypeDirectory},
		{ID: 3503, ParentID: 3501, Name: "child1.jpg", Type: FileTypeImage},
		{ID: 3504, ParentID: 3501, Name: "subdir", Type: FileTypeDirectory},
		{ID: 3505, ParentID: 3502, Name: "child2.jpg", Type: FileTypeImage},
	}
	LoadTestData(t, testClient, files)

	fileClient := testClient.File()

	t.Run("find files by parent IDs", func(t *testing.T) {
		got, err := fileClient.FindFilesByParentIDs([]uint{3501, 3502})
		assert.NoError(t, err)
		assert.Len(t, got, 3)
	})

	t.Run("empty parent IDs returns nil", func(t *testing.T) {
		got, err := fileClient.FindFilesByParentIDs([]uint{})
		assert.NoError(t, err)
		assert.Nil(t, got)
	})

	t.Run("no matching parent IDs", func(t *testing.T) {
		got, err := fileClient.FindFilesByParentIDs([]uint{9999})
		assert.NoError(t, err)
		assert.Empty(t, got)
	})
}

func TestFileClient_DeleteByIDs(t *testing.T) {
	testClient := NewTestClient(t)
	testClient.Truncate(t, File{})

	files := []File{
		{ID: 3601, ParentID: 0, Name: "dir1", Type: FileTypeDirectory},
		{ID: 3602, ParentID: 0, Name: "dir2", Type: FileTypeDirectory},
		{ID: 3603, ParentID: 3601, Name: "img1.jpg", Type: FileTypeImage},
	}
	LoadTestData(t, testClient, files)

	fileClient := testClient.File()
	ctx := context.Background()

	t.Run("empty IDs is a no-op", func(t *testing.T) {
		err := fileClient.DeleteByIDs(ctx, []uint{})
		assert.NoError(t, err)
		got := MustGetAll[File](t, testClient)
		assert.Len(t, got, 3)
	})

	t.Run("delete specific IDs", func(t *testing.T) {
		err := fileClient.DeleteByIDs(ctx, []uint{3601, 3603})
		assert.NoError(t, err)
		got := MustGetAll[File](t, testClient)
		assert.Len(t, got, 1)
		assert.Equal(t, uint(3602), got[0].ID)
	})
}

func TestFileClient_FindDirectoriesByIDs(t *testing.T) {
	testClient := NewTestClient(t)
	testClient.Truncate(t, File{})

	files := []File{
		{ID: 4001, ParentID: 0, Name: "dir1", Type: FileTypeDirectory, CreatedAt: 100},
		{ID: 4002, ParentID: 0, Name: "dir2", Type: FileTypeDirectory, CreatedAt: 200},
		{ID: 4003, ParentID: 4001, Name: "img1.jpg", Type: FileTypeImage, CreatedAt: 300},
		{ID: 4004, ParentID: 0, Name: "dir3", Type: FileTypeDirectory, CreatedAt: 50},
	}
	LoadTestData(t, testClient, files)

	fileClient := testClient.File()

	t.Run("find directories by IDs", func(t *testing.T) {
		got, err := fileClient.FindDirectoriesByIDs([]uint{4001, 4002, 4004})
		assert.NoError(t, err)
		assert.Len(t, got, 3)
		// Ordered by created_at desc
		assert.Equal(t, uint(4002), got[0].ID)
		assert.Equal(t, uint(4001), got[1].ID)
		assert.Equal(t, uint(4004), got[2].ID)
	})

	t.Run("excludes images even if ID matches", func(t *testing.T) {
		got, err := fileClient.FindDirectoriesByIDs([]uint{4001, 4003})
		assert.NoError(t, err)
		assert.Len(t, got, 1)
		assert.Equal(t, uint(4001), got[0].ID)
	})

	t.Run("no matching IDs", func(t *testing.T) {
		got, err := fileClient.FindDirectoriesByIDs([]uint{9999})
		assert.NoError(t, err)
		assert.Empty(t, got)
	})
}
