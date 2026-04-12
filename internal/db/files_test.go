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

func TestFileClient_FindDirectChildDirectories(t *testing.T) {
	testClient := NewTestClient(t)
	testClient.Truncate(t, File{})

	season1Num := uint(1)
	season2Num := uint(2)
	movieYear := uint(2023)
	files := []File{
		{ID: 5001, ParentID: 0, Name: "anime-root", Type: FileTypeDirectory},
		{ID: 5002, ParentID: 5001, Name: "Season 2", Type: FileTypeDirectory, EntryType: EntryTypeSeason, EntryNumber: &season2Num},
		{ID: 5003, ParentID: 5001, Name: "Season 1", Type: FileTypeDirectory, EntryType: EntryTypeSeason, EntryNumber: &season1Num},
		{ID: 5004, ParentID: 5001, Name: "The Movie", Type: FileTypeDirectory, EntryType: EntryTypeMovie, EntryNumber: &movieYear},
		{ID: 5005, ParentID: 5001, Name: "Specials", Type: FileTypeDirectory, EntryType: EntryTypeOther},
		{ID: 5006, ParentID: 5001, Name: "Legacy Folder", Type: FileTypeDirectory},
		{ID: 5007, ParentID: 5001, Name: "img.jpg", Type: FileTypeImage}, // should be excluded
		{ID: 5008, ParentID: 5002, Name: "Part 1", Type: FileTypeDirectory},
	}
	LoadTestData(t, testClient, files)

	fileClient := testClient.File()

	t.Run("returns only direct child directories ordered by entry_type, entry_number, name", func(t *testing.T) {
		got, err := fileClient.FindDirectChildDirectories(5001)
		assert.NoError(t, err)
		assert.Len(t, got, 5) // excludes image and grandchild
		// SQLite string order: "" < "movie" < "other" < "season"
		assert.Equal(t, uint(5006), got[0].ID) // Legacy Folder (empty entry_type)
		assert.Equal(t, uint(5004), got[1].ID) // The Movie (movie)
		assert.Equal(t, uint(5005), got[2].ID) // Specials (other)
		assert.Equal(t, uint(5003), got[3].ID) // Season 1 (season, number=1)
		assert.Equal(t, uint(5002), got[4].ID) // Season 2 (season, number=2)
	})

	t.Run("returns empty for directory with no child directories", func(t *testing.T) {
		got, err := fileClient.FindDirectChildDirectories(9999)
		assert.NoError(t, err)
		assert.Empty(t, got)
	})

	t.Run("returns sub-entries for child directory", func(t *testing.T) {
		got, err := fileClient.FindDirectChildDirectories(5002)
		assert.NoError(t, err)
		assert.Len(t, got, 1)
		assert.Equal(t, uint(5008), got[0].ID)
		assert.Equal(t, "Part 1", got[0].Name)
	})
}

func TestFileClient_UpdateEntryFields(t *testing.T) {
	testClient := NewTestClient(t)
	testClient.Truncate(t, File{})

	season1Num := uint(1)
	files := []File{
		{ID: 6001, ParentID: 0, Name: "anime-root", Type: FileTypeDirectory},
		{ID: 6002, ParentID: 6001, Name: "Legacy Folder", Type: FileTypeDirectory},
		{ID: 6003, ParentID: 6001, Name: "Season 1", Type: FileTypeDirectory, EntryType: EntryTypeSeason, EntryNumber: &season1Num},
	}
	LoadTestData(t, testClient, files)

	fileClient := testClient.File()
	ctx := context.Background()

	t.Run("sets entry_type and entry_number on legacy folder", func(t *testing.T) {
		num := uint(2)
		err := fileClient.UpdateEntryFields(ctx, 6002, EntryTypeSeason, &num)
		assert.NoError(t, err)

		// Verify the update
		got, err := fileClient.FindByValue(ctx, &File{ID: 6002})
		require.NoError(t, err)
		assert.Equal(t, EntryTypeSeason, got.EntryType)
		require.NotNil(t, got.EntryNumber)
		assert.Equal(t, uint(2), *got.EntryNumber)
	})

	t.Run("sets entry_type with nil entry_number", func(t *testing.T) {
		err := fileClient.UpdateEntryFields(ctx, 6002, EntryTypeOther, nil)
		assert.NoError(t, err)

		got, err := fileClient.FindByValue(ctx, &File{ID: 6002})
		require.NoError(t, err)
		assert.Equal(t, EntryTypeOther, got.EntryType)
		assert.Nil(t, got.EntryNumber)
	})

	t.Run("overwrites existing entry fields", func(t *testing.T) {
		num := uint(2024)
		err := fileClient.UpdateEntryFields(ctx, 6003, EntryTypeMovie, &num)
		assert.NoError(t, err)

		got, err := fileClient.FindByValue(ctx, &File{ID: 6003})
		require.NoError(t, err)
		assert.Equal(t, EntryTypeMovie, got.EntryType)
		require.NotNil(t, got.EntryNumber)
		assert.Equal(t, uint(2024), *got.EntryNumber)
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

func TestFileClient_FindAllImageFiles(t *testing.T) {
	testClient := NewTestClient(t)
	testClient.Truncate(t, File{})

	files := []File{
		{ID: 5001, ParentID: 0, Name: "dir1", Type: FileTypeDirectory},
		{ID: 5002, ParentID: 5001, Name: "img1.jpg", Type: FileTypeImage},
		{ID: 5003, ParentID: 5001, Name: "img2.png", Type: FileTypeImage},
		{ID: 5004, ParentID: 0, Name: "dir2", Type: FileTypeDirectory},
	}
	LoadTestData(t, testClient, files)

	fileClient := testClient.File()

	got, err := fileClient.FindAllImageFiles()
	assert.NoError(t, err)
	assert.Len(t, got, 2)

	ids := []uint{got[0].ID, got[1].ID}
	assert.Contains(t, ids, uint(5002))
	assert.Contains(t, ids, uint(5003))
}

func TestFileClient_UpdateContentHash(t *testing.T) {
	testClient := NewTestClient(t)
	testClient.Truncate(t, File{})

	files := []File{
		{ID: 6001, ParentID: 0, Name: "dir1", Type: FileTypeDirectory},
		{ID: 6002, ParentID: 6001, Name: "img1.jpg", Type: FileTypeImage},
	}
	LoadTestData(t, testClient, files)

	fileClient := testClient.File()

	t.Run("stores hash in database", func(t *testing.T) {
		hash := "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
		err := fileClient.UpdateContentHash(6002, hash)
		assert.NoError(t, err)

		// Verify the hash was stored
		images, err := fileClient.FindAllImageFiles()
		assert.NoError(t, err)
		require.Len(t, images, 1)
		assert.Equal(t, hash, images[0].ContentHash)
	})

	t.Run("updates existing hash", func(t *testing.T) {
		newHash := "1111111111111111111111111111111111111111111111111111111111111111"
		err := fileClient.UpdateContentHash(6002, newHash)
		assert.NoError(t, err)

		images, err := fileClient.FindAllImageFiles()
		assert.NoError(t, err)
		require.Len(t, images, 1)
		assert.Equal(t, newHash, images[0].ContentHash)
	})
}

func TestFileClient_BatchUpdateContentHashes(t *testing.T) {
	testClient := NewTestClient(t)
	testClient.Truncate(t, File{})

	files := []File{
		{ID: 8001, ParentID: 0, Name: "dir1", Type: FileTypeDirectory},
		{ID: 8002, ParentID: 8001, Name: "img1.jpg", Type: FileTypeImage},
		{ID: 8003, ParentID: 8001, Name: "img2.jpg", Type: FileTypeImage},
		{ID: 8004, ParentID: 8001, Name: "img3.jpg", Type: FileTypeImage},
	}
	LoadTestData(t, testClient, files)

	fileClient := testClient.File()

	t.Run("updates multiple hashes in one call", func(t *testing.T) {
		updates := map[uint]string{
			8002: "aaaa",
			8003: "bbbb",
			8004: "cccc",
		}
		err := fileClient.BatchUpdateContentHashes(updates)
		assert.NoError(t, err)

		images, err := fileClient.FindAllImageFiles()
		assert.NoError(t, err)
		require.Len(t, images, 3)
		hashByID := make(map[uint]string)
		for _, img := range images {
			hashByID[img.ID] = img.ContentHash
		}
		assert.Equal(t, "aaaa", hashByID[8002])
		assert.Equal(t, "bbbb", hashByID[8003])
		assert.Equal(t, "cccc", hashByID[8004])
	})

	t.Run("empty map is a no-op", func(t *testing.T) {
		err := fileClient.BatchUpdateContentHashes(map[uint]string{})
		assert.NoError(t, err)
	})

	t.Run("single entry works", func(t *testing.T) {
		err := fileClient.BatchUpdateContentHashes(map[uint]string{
			8002: "dddd",
		})
		assert.NoError(t, err)

		images, err := fileClient.FindImageFilesByIDs([]uint{8002})
		assert.NoError(t, err)
		require.Len(t, images, 1)
		assert.Equal(t, "dddd", images[0].ContentHash)
	})
}

func TestFileClient_ContentHashField(t *testing.T) {
	testClient := NewTestClient(t)
	testClient.Truncate(t, File{})

	// Insert a file with a content hash
	hash := "deadbeef" + "deadbeef" + "deadbeef" + "deadbeef" + "deadbeef" + "deadbeef" + "deadbeef" + "deadbeef"
	files := []File{
		{ID: 7001, ParentID: 0, Name: "dir1", Type: FileTypeDirectory},
		{ID: 7002, ParentID: 7001, Name: "img.jpg", Type: FileTypeImage, ContentHash: hash},
	}
	LoadTestData(t, testClient, files)

	// Verify the hash was persisted
	got, err := testClient.File().FindAllImageFiles()
	assert.NoError(t, err)
	require.Len(t, got, 1)
	assert.Equal(t, hash, got[0].ContentHash)
}

func TestFileClient_UpdateAiringFields(t *testing.T) {
	testClient := NewTestClient(t)
	testClient.Truncate(t, File{})
	ctx := context.Background()

	files := []File{
		{ID: 8001, ParentID: 0, Name: "dir1", Type: FileTypeDirectory},
	}
	LoadTestData(t, testClient, files)

	t.Run("sets airing season and year", func(t *testing.T) {
		year := uint(2024)
		err := testClient.File().UpdateAiringFields(ctx, 8001, AiringSeasonSpring, &year)
		require.NoError(t, err)

		got, err := testClient.File().FindByValue(ctx, &File{ID: 8001})
		require.NoError(t, err)
		assert.Equal(t, AiringSeasonSpring, got.AiringSeason)
		require.NotNil(t, got.AiringYear)
		assert.Equal(t, uint(2024), *got.AiringYear)
	})

	t.Run("clears airing fields", func(t *testing.T) {
		err := testClient.File().UpdateAiringFields(ctx, 8001, "", nil)
		require.NoError(t, err)

		got, err := testClient.File().FindByValue(ctx, &File{ID: 8001})
		require.NoError(t, err)
		assert.Empty(t, got.AiringSeason)
		assert.Nil(t, got.AiringYear)
	})
}
