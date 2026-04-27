package db

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCharacterClient_Create(t *testing.T) {
	testClient := NewTestClient(t)
	testClient.Truncate(t, Character{})

	charClient := testClient.Character()
	ctx := context.Background()

	char := Character{Name: "Hitori Gotoh", AnimeID: 1}
	err := charClient.Create(ctx, &char)
	require.NoError(t, err)
	assert.NotZero(t, char.ID)
	assert.Equal(t, "Hitori Gotoh", char.Name)
	assert.Equal(t, uint(1), char.AnimeID)
}

func TestCharacterClient_FindByAnimeID(t *testing.T) {
	testClient := NewTestClient(t)
	testClient.Truncate(t, Character{})

	characters := []Character{
		{ID: 1001, Name: "Char A", AnimeID: 10},
		{ID: 1002, Name: "Char B", AnimeID: 10},
		{ID: 1003, Name: "Char C", AnimeID: 20},
	}
	LoadTestData(t, testClient, characters)

	charClient := testClient.Character()

	t.Run("finds characters for anime 10", func(t *testing.T) {
		got, err := charClient.FindByAnimeID(10)
		assert.NoError(t, err)
		assert.Len(t, got, 2)
	})

	t.Run("finds characters for anime 20", func(t *testing.T) {
		got, err := charClient.FindByAnimeID(20)
		assert.NoError(t, err)
		assert.Len(t, got, 1)
		assert.Equal(t, "Char C", got[0].Name)
	})

	t.Run("returns empty for unknown anime", func(t *testing.T) {
		got, err := charClient.FindByAnimeID(999)
		assert.NoError(t, err)
		assert.Empty(t, got)
	})
}

func TestCharacterClient_FindByIDs(t *testing.T) {
	testClient := NewTestClient(t)
	testClient.Truncate(t, Character{})

	characters := []Character{
		{ID: 2001, Name: "Alpha", AnimeID: 1},
		{ID: 2002, Name: "Beta", AnimeID: 1},
		{ID: 2003, Name: "Gamma", AnimeID: 2},
	}
	LoadTestData(t, testClient, characters)

	charClient := testClient.Character()

	t.Run("find by multiple IDs", func(t *testing.T) {
		got, err := charClient.FindByIDs([]uint{2001, 2003})
		assert.NoError(t, err)
		assert.Len(t, got, 2)
	})

	t.Run("find by single ID", func(t *testing.T) {
		got, err := charClient.FindByIDs([]uint{2002})
		assert.NoError(t, err)
		assert.Len(t, got, 1)
		assert.Equal(t, "Beta", got[0].Name)
	})

	t.Run("empty slice returns nil", func(t *testing.T) {
		got, err := charClient.FindByIDs([]uint{})
		assert.NoError(t, err)
		assert.Nil(t, got)
	})

	t.Run("no matching IDs returns empty", func(t *testing.T) {
		got, err := charClient.FindByIDs([]uint{9999})
		assert.NoError(t, err)
		assert.Empty(t, got)
	})
}

func TestCharacterClient_DeleteByID(t *testing.T) {
	testClient := NewTestClient(t)
	testClient.Truncate(t, Character{})

	characters := []Character{
		{ID: 3001, Name: "Char A", AnimeID: 1},
		{ID: 3002, Name: "Char B", AnimeID: 1},
	}
	LoadTestData(t, testClient, characters)

	charClient := testClient.Character()
	ctx := context.Background()

	err := charClient.DeleteByID(ctx, 3001)
	require.NoError(t, err)

	got, err := charClient.FindByIDs([]uint{3001, 3002})
	assert.NoError(t, err)
	assert.Len(t, got, 1)
	assert.Equal(t, uint(3002), got[0].ID)
}

func TestCharacterClient_DeleteByAnimeID(t *testing.T) {
	testClient := NewTestClient(t)
	testClient.Truncate(t, Character{})

	characters := []Character{
		{ID: 4001, Name: "Char A", AnimeID: 10},
		{ID: 4002, Name: "Char B", AnimeID: 10},
		{ID: 4003, Name: "Char C", AnimeID: 20},
	}
	LoadTestData(t, testClient, characters)

	charClient := testClient.Character()
	ctx := context.Background()

	err := charClient.DeleteByAnimeID(ctx, 10)
	require.NoError(t, err)

	// Characters for anime 10 should be gone
	got, err := charClient.FindByAnimeID(10)
	assert.NoError(t, err)
	assert.Empty(t, got)

	// Characters for anime 20 should remain
	got, err = charClient.FindByAnimeID(20)
	assert.NoError(t, err)
	assert.Len(t, got, 1)
	assert.Equal(t, "Char C", got[0].Name)
}

func TestFileCharacterClient_Create(t *testing.T) {
	testClient := NewTestClient(t)
	testClient.Truncate(t, FileCharacter{})

	fcClient := testClient.FileCharacter()
	ctx := context.Background()

	fc := FileCharacter{CharacterID: 100, FileID: 200, AddedBy: FileTagAddedByUser}
	err := fcClient.Create(ctx, &fc)
	require.NoError(t, err)
	assert.Equal(t, uint(100), fc.CharacterID)
	assert.Equal(t, uint(200), fc.FileID)
}

func TestFileCharacterClient_FindByFileIDs(t *testing.T) {
	testClient := NewTestClient(t)
	testClient.Truncate(t, FileCharacter{})

	fileCharacters := []FileCharacter{
		{CharacterID: 10, FileID: 100, AddedBy: FileTagAddedByUser},
		{CharacterID: 20, FileID: 100, AddedBy: FileTagAddedByUser},
		{CharacterID: 10, FileID: 200, AddedBy: FileTagAddedByUser},
		{CharacterID: 30, FileID: 300, AddedBy: FileTagAddedByUser},
	}
	LoadTestData(t, testClient, fileCharacters)

	fcClient := testClient.FileCharacter()

	t.Run("find by single file ID", func(t *testing.T) {
		got, err := fcClient.FindByFileIDs([]uint{100})
		assert.NoError(t, err)
		assert.Len(t, got, 2)
	})

	t.Run("find by multiple file IDs", func(t *testing.T) {
		got, err := fcClient.FindByFileIDs([]uint{100, 200})
		assert.NoError(t, err)
		assert.Len(t, got, 3)
	})

	t.Run("no matching file IDs", func(t *testing.T) {
		got, err := fcClient.FindByFileIDs([]uint{9999})
		assert.NoError(t, err)
		assert.Empty(t, got)
	})
}

func TestFileCharacterClient_FindByCharacterIDs(t *testing.T) {
	testClient := NewTestClient(t)
	testClient.Truncate(t, FileCharacter{})

	fileCharacters := []FileCharacter{
		{CharacterID: 10, FileID: 100, AddedBy: FileTagAddedByUser},
		{CharacterID: 10, FileID: 200, AddedBy: FileTagAddedByUser},
		{CharacterID: 20, FileID: 100, AddedBy: FileTagAddedByUser},
		{CharacterID: 30, FileID: 300, AddedBy: FileTagAddedByUser},
	}
	LoadTestData(t, testClient, fileCharacters)

	fcClient := testClient.FileCharacter()

	t.Run("find by single character ID", func(t *testing.T) {
		got, err := fcClient.FindByCharacterIDs([]uint{10})
		assert.NoError(t, err)
		assert.Len(t, got, 2)
	})

	t.Run("find by multiple character IDs", func(t *testing.T) {
		got, err := fcClient.FindByCharacterIDs([]uint{10, 30})
		assert.NoError(t, err)
		assert.Len(t, got, 3)
	})

	t.Run("no matching character IDs", func(t *testing.T) {
		got, err := fcClient.FindByCharacterIDs([]uint{9999})
		assert.NoError(t, err)
		assert.Empty(t, got)
	})
}

func TestFileCharacterClient_DeleteByCharacterID(t *testing.T) {
	testClient := NewTestClient(t)
	testClient.Truncate(t, FileCharacter{})

	fileCharacters := []FileCharacter{
		{CharacterID: 10, FileID: 100, AddedBy: FileTagAddedByUser},
		{CharacterID: 10, FileID: 200, AddedBy: FileTagAddedByUser},
		{CharacterID: 20, FileID: 100, AddedBy: FileTagAddedByUser},
	}
	LoadTestData(t, testClient, fileCharacters)

	fcClient := testClient.FileCharacter()
	ctx := context.Background()

	err := fcClient.DeleteByCharacterID(ctx, 10)
	require.NoError(t, err)

	// Only character 20 associations should remain
	got, err := fcClient.FindByCharacterIDs([]uint{10, 20})
	assert.NoError(t, err)
	assert.Len(t, got, 1)
	assert.Equal(t, uint(20), got[0].CharacterID)
}

func TestFileCharacterClient_DeleteByFileIDs(t *testing.T) {
	testClient := NewTestClient(t)
	testClient.Truncate(t, FileCharacter{})

	fileCharacters := []FileCharacter{
		{CharacterID: 10, FileID: 100, AddedBy: FileTagAddedByUser},
		{CharacterID: 20, FileID: 100, AddedBy: FileTagAddedByUser},
		{CharacterID: 10, FileID: 200, AddedBy: FileTagAddedByUser},
		{CharacterID: 30, FileID: 300, AddedBy: FileTagAddedByUser},
	}
	LoadTestData(t, testClient, fileCharacters)

	fcClient := testClient.FileCharacter()
	ctx := context.Background()

	t.Run("empty file IDs is a no-op", func(t *testing.T) {
		err := fcClient.DeleteByFileIDs(ctx, nil)
		assert.NoError(t, err)

		remaining, err := fcClient.FindByFileIDs([]uint{100, 200, 300})
		assert.NoError(t, err)
		assert.Len(t, remaining, 4)
	})

	t.Run("delete by file IDs", func(t *testing.T) {
		err := fcClient.DeleteByFileIDs(ctx, []uint{100})
		assert.NoError(t, err)

		remaining, err := fcClient.FindByFileIDs([]uint{100, 200, 300})
		assert.NoError(t, err)
		assert.Len(t, remaining, 2)
		for _, fc := range remaining {
			assert.NotEqual(t, uint(100), fc.FileID)
		}
	})
}

func TestFileCharacterClient_BatchCreate(t *testing.T) {
	testClient := NewTestClient(t)
	testClient.Truncate(t, FileCharacter{})

	fcClient := testClient.FileCharacter()
	ctx := context.Background()

	fcs := []FileCharacter{
		{CharacterID: 10, FileID: 100, AddedBy: FileTagAddedByUser},
		{CharacterID: 10, FileID: 200, AddedBy: FileTagAddedByUser},
		{CharacterID: 20, FileID: 100, AddedBy: FileTagAddedByImport},
	}
	err := fcClient.BatchCreate(ctx, fcs)
	require.NoError(t, err)

	got, err := fcClient.FindByFileIDs([]uint{100, 200})
	assert.NoError(t, err)
	assert.Len(t, got, 3)
}

func TestFileCharacterClient_BatchDelete(t *testing.T) {
	testClient := NewTestClient(t)
	testClient.Truncate(t, FileCharacter{})

	fileCharacters := []FileCharacter{
		{CharacterID: 10, FileID: 100, AddedBy: FileTagAddedByUser},
		{CharacterID: 10, FileID: 200, AddedBy: FileTagAddedByUser},
		{CharacterID: 20, FileID: 100, AddedBy: FileTagAddedByUser},
		{CharacterID: 20, FileID: 200, AddedBy: FileTagAddedByUser},
	}
	LoadTestData(t, testClient, fileCharacters)

	fcClient := testClient.FileCharacter()
	ctx := context.Background()

	// Delete character 10 from files 100 and 200
	toDelete := []FileCharacter{
		{CharacterID: 10, FileID: 100},
		{CharacterID: 10, FileID: 200},
	}
	err := fcClient.BatchDelete(ctx, toDelete)
	require.NoError(t, err)

	// Only character 20 associations should remain
	remaining, err := fcClient.FindByFileIDs([]uint{100, 200})
	assert.NoError(t, err)
	assert.Len(t, remaining, 2)
	for _, fc := range remaining {
		assert.Equal(t, uint(20), fc.CharacterID)
	}
}
