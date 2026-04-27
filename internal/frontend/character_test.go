package frontend

import (
	"context"
	"testing"

	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCharacterService_CreateCharacter(t *testing.T) {
	tester := newTester(t)
	tester.dbClient.Truncate(t, db.Character{}, db.FileCharacter{})
	svc := NewCharacterService(tester.dbClient.Client)
	ctx := context.Background()

	t.Run("happy path", func(t *testing.T) {
		// First create an anime to associate the character with
		animeRow := db.Anime{Name: "TestAnime"}
		require.NoError(t, db.Create(tester.dbClient.Client, &animeRow))

		got, err := svc.CreateCharacter(ctx, "Hitori Gotoh", animeRow.ID)
		require.NoError(t, err)
		assert.NotZero(t, got.ID)
		assert.Equal(t, "Hitori Gotoh", got.Name)
		assert.Equal(t, animeRow.ID, got.AnimeID)
	})

	t.Run("trims whitespace", func(t *testing.T) {
		animeRow := db.Anime{Name: "TestAnime2"}
		require.NoError(t, db.Create(tester.dbClient.Client, &animeRow))

		got, err := svc.CreateCharacter(ctx, "  Nijika  ", animeRow.ID)
		require.NoError(t, err)
		assert.Equal(t, "Nijika", got.Name)
	})

	t.Run("empty name rejected", func(t *testing.T) {
		_, err := svc.CreateCharacter(ctx, "   ", 1)
		require.Error(t, err)
		assert.ErrorIs(t, err, ErrInvalidArgument)
	})
}

func TestCharacterService_RenameCharacter(t *testing.T) {
	tester := newTester(t)
	tester.dbClient.Truncate(t, db.Character{}, db.FileCharacter{}, db.Anime{})
	svc := NewCharacterService(tester.dbClient.Client)
	ctx := context.Background()

	animeRow := db.Anime{Name: "RenameTestAnime"}
	require.NoError(t, db.Create(tester.dbClient.Client, &animeRow))

	created, err := svc.CreateCharacter(ctx, "OldName", animeRow.ID)
	require.NoError(t, err)

	t.Run("happy path", func(t *testing.T) {
		got, err := svc.RenameCharacter(ctx, created.ID, "NewName")
		require.NoError(t, err)
		assert.Equal(t, "NewName", got.Name)
		assert.Equal(t, created.ID, got.ID)
		assert.Equal(t, animeRow.ID, got.AnimeID)
	})

	t.Run("empty name rejected", func(t *testing.T) {
		_, err := svc.RenameCharacter(ctx, created.ID, "   ")
		require.Error(t, err)
		assert.ErrorIs(t, err, ErrInvalidArgument)
	})

	t.Run("non-existent character returns error", func(t *testing.T) {
		_, err := svc.RenameCharacter(ctx, 99999, "Whatever")
		require.Error(t, err)
		assert.Contains(t, err.Error(), "FindByValue")
	})
}

func TestCharacterService_DeleteCharacter(t *testing.T) {
	tester := newTester(t)
	tester.dbClient.Truncate(t, db.Character{}, db.FileCharacter{}, db.Anime{})
	svc := NewCharacterService(tester.dbClient.Client)
	ctx := context.Background()

	animeRow := db.Anime{Name: "DeleteTestAnime"}
	require.NoError(t, db.Create(tester.dbClient.Client, &animeRow))

	created, err := svc.CreateCharacter(ctx, "ToDelete", animeRow.ID)
	require.NoError(t, err)

	// Also create file associations
	fcs := []db.FileCharacter{
		{CharacterID: created.ID, FileID: 100, AddedBy: db.FileTagAddedByUser},
		{CharacterID: created.ID, FileID: 200, AddedBy: db.FileTagAddedByUser},
	}
	db.LoadTestData(t, tester.dbClient, fcs)

	err = svc.DeleteCharacter(ctx, created.ID)
	require.NoError(t, err)

	// Verify character is gone
	chars, err := tester.dbClient.Client.Character().FindByIDs([]uint{created.ID})
	require.NoError(t, err)
	assert.Empty(t, chars)

	// Verify file associations are gone
	remaining, err := tester.dbClient.Client.FileCharacter().FindByCharacterIDs([]uint{created.ID})
	require.NoError(t, err)
	assert.Empty(t, remaining)
}

func TestCharacterService_GetCharacterFileCount(t *testing.T) {
	tester := newTester(t)
	tester.dbClient.Truncate(t, db.Character{}, db.FileCharacter{})
	svc := NewCharacterService(tester.dbClient.Client)

	characters := []db.Character{
		{ID: 5001, Name: "CharWithFiles", AnimeID: 1},
		{ID: 5002, Name: "CharNoFiles", AnimeID: 1},
	}
	db.LoadTestData(t, tester.dbClient, characters)

	fcs := []db.FileCharacter{
		{CharacterID: 5001, FileID: 100, AddedBy: db.FileTagAddedByUser},
		{CharacterID: 5001, FileID: 200, AddedBy: db.FileTagAddedByUser},
		{CharacterID: 5001, FileID: 300, AddedBy: db.FileTagAddedByUser},
	}
	db.LoadTestData(t, tester.dbClient, fcs)

	t.Run("character with files", func(t *testing.T) {
		count, err := svc.GetCharacterFileCount(5001)
		require.NoError(t, err)
		assert.Equal(t, uint(3), count)
	})

	t.Run("character with no files", func(t *testing.T) {
		count, err := svc.GetCharacterFileCount(5002)
		require.NoError(t, err)
		assert.Equal(t, uint(0), count)
	})
}

func TestCharacterService_BatchUpdateCharactersForFiles(t *testing.T) {
	tester := newTester(t)
	tester.dbClient.Truncate(t, db.Character{}, db.FileCharacter{})
	svc := NewCharacterService(tester.dbClient.Client)
	ctx := context.Background()

	characters := []db.Character{
		{ID: 6001, Name: "Char A", AnimeID: 1},
		{ID: 6002, Name: "Char B", AnimeID: 1},
		{ID: 6003, Name: "Char C", AnimeID: 1},
	}
	db.LoadTestData(t, tester.dbClient, characters)

	// Pre-existing association
	existing := []db.FileCharacter{
		{CharacterID: 6001, FileID: 100, AddedBy: db.FileTagAddedByUser},
	}
	db.LoadTestData(t, tester.dbClient, existing)

	t.Run("add and remove associations", func(t *testing.T) {
		err := svc.BatchUpdateCharactersForFiles(ctx,
			[]uint{100},
			[]uint{6002, 6003}, // add
			[]uint{6001},       // remove
		)
		require.NoError(t, err)

		got, err := tester.dbClient.Client.FileCharacter().FindByFileIDs([]uint{100})
		require.NoError(t, err)
		assert.Len(t, got, 2)
		charIDs := make([]uint, 0, len(got))
		for _, fc := range got {
			charIDs = append(charIDs, fc.CharacterID)
		}
		assert.ElementsMatch(t, []uint{6002, 6003}, charIDs)
	})

	t.Run("skip duplicate adds", func(t *testing.T) {
		// 6002 and 6003 already exist on file 100 from previous sub-test
		err := svc.BatchUpdateCharactersForFiles(ctx,
			[]uint{100},
			[]uint{6002}, // already exists
			nil,
		)
		require.NoError(t, err)

		got, err := tester.dbClient.Client.FileCharacter().FindByFileIDs([]uint{100})
		require.NoError(t, err)
		assert.Len(t, got, 2) // no duplicate added
	})

	t.Run("no-op when nothing to add or delete", func(t *testing.T) {
		err := svc.BatchUpdateCharactersForFiles(ctx, []uint{100}, nil, nil)
		require.NoError(t, err)
	})
}

func TestCharacterService_GetImageCharacterIDs(t *testing.T) {
	tester := newTester(t)
	tester.dbClient.Truncate(t, db.Character{}, db.FileCharacter{})
	svc := NewCharacterService(tester.dbClient.Client)
	ctx := context.Background()

	fcs := []db.FileCharacter{
		{CharacterID: 10, FileID: 100, AddedBy: db.FileTagAddedByUser},
		{CharacterID: 20, FileID: 100, AddedBy: db.FileTagAddedByUser},
		{CharacterID: 10, FileID: 200, AddedBy: db.FileTagAddedByUser},
	}
	db.LoadTestData(t, tester.dbClient, fcs)

	t.Run("returns character IDs per image", func(t *testing.T) {
		result, err := svc.GetImageCharacterIDs(ctx, []uint{100, 200, 300})
		require.NoError(t, err)
		assert.ElementsMatch(t, []uint{10, 20}, result[100])
		assert.ElementsMatch(t, []uint{10}, result[200])
		assert.Empty(t, result[300])
	})

	t.Run("empty input returns nil", func(t *testing.T) {
		result, err := svc.GetImageCharacterIDs(ctx, nil)
		require.NoError(t, err)
		assert.Nil(t, result)
	})
}

func TestCharacterService_ReadCharactersByAnimeID(t *testing.T) {
	tester := newTester(t)
	tester.dbClient.Truncate(t, db.Character{}, db.FileCharacter{})
	svc := NewCharacterService(tester.dbClient.Client)
	ctx := context.Background()

	characters := []db.Character{
		{ID: 7001, Name: "charlie", AnimeID: 1},
		{ID: 7002, Name: "Alpha", AnimeID: 1},
		{ID: 7003, Name: "bravo", AnimeID: 1},
		{ID: 7004, Name: "Delta", AnimeID: 2},
	}
	db.LoadTestData(t, tester.dbClient, characters)

	t.Run("returns sorted by name case-insensitive", func(t *testing.T) {
		got, err := svc.ReadCharactersByAnimeID(ctx, 1)
		require.NoError(t, err)
		require.Len(t, got, 3)
		assert.Equal(t, "Alpha", got[0].Name)
		assert.Equal(t, "bravo", got[1].Name)
		assert.Equal(t, "charlie", got[2].Name)
		// Verify all have correct AnimeID
		for _, c := range got {
			assert.Equal(t, uint(1), c.AnimeID)
		}
	})

	t.Run("different anime returns its own characters", func(t *testing.T) {
		got, err := svc.ReadCharactersByAnimeID(ctx, 2)
		require.NoError(t, err)
		require.Len(t, got, 1)
		assert.Equal(t, "Delta", got[0].Name)
	})

	t.Run("unknown anime returns empty", func(t *testing.T) {
		got, err := svc.ReadCharactersByAnimeID(ctx, 999)
		require.NoError(t, err)
		assert.Empty(t, got)
	})
}
