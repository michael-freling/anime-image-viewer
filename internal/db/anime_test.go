package db

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAnimeClient_Anime(t *testing.T) {
	testClient := NewTestClient(t)
	c := testClient.Anime()
	require.NotNil(t, c)
	require.NotNil(t, c.ORMClient)
}

func TestAnimeClient_FindAllByIDs(t *testing.T) {
	testClient := NewTestClient(t)
	testClient.Truncate(t, Anime{})

	rows := []Anime{
		{ID: 9001, Name: "Re:Zero"},
		{ID: 9002, Name: "Attack on Titan"},
		{ID: 9003, Name: "Bocchi the Rock"},
	}
	LoadTestData(t, testClient, rows)

	c := testClient.Anime()

	t.Run("find by multiple ids", func(t *testing.T) {
		got, err := c.FindAllByIDs([]uint{9001, 9003})
		assert.NoError(t, err)
		assert.Len(t, got, 2)
	})

	t.Run("empty input returns empty result", func(t *testing.T) {
		got, err := c.FindAllByIDs(nil)
		assert.NoError(t, err)
		assert.Empty(t, got)
	})

	t.Run("no matching id returns empty", func(t *testing.T) {
		got, err := c.FindAllByIDs([]uint{99999})
		assert.NoError(t, err)
		assert.Empty(t, got)
	})
}

func TestAnimeClient_FindByName(t *testing.T) {
	testClient := NewTestClient(t)
	testClient.Truncate(t, Anime{})

	LoadTestData(t, testClient, []Anime{
		{ID: 7100, Name: "Spy x Family"},
	})
	c := testClient.Anime()

	got, err := c.FindByName(context.Background(), "Spy x Family")
	assert.NoError(t, err)
	assert.Equal(t, uint(7100), got.ID)
}

func TestAnimeClient_UniqueName(t *testing.T) {
	testClient := NewTestClient(t)
	testClient.Truncate(t, Anime{})

	first := Anime{Name: "Frieren"}
	require.NoError(t, Create(testClient.Client, &first))

	second := Anime{Name: "Frieren"}
	err := Create(testClient.Client, &second)
	assert.Error(t, err, "duplicate name must be rejected")
}

func TestFileClient_AnimeID(t *testing.T) {
	testClient := NewTestClient(t)
	testClient.Truncate(t, File{}, Anime{})

	LoadTestData(t, testClient, []Anime{
		{ID: 510, Name: "anime A"},
		{ID: 511, Name: "anime B"},
	})

	animeIDA := uint(510)
	animeIDB := uint(511)

	files := []File{
		{ID: 1100, ParentID: 0, Name: "rootDirA", Type: FileTypeDirectory, AnimeID: &animeIDA},
		{ID: 1101, ParentID: 1100, Name: "child", Type: FileTypeDirectory},
		{ID: 1102, ParentID: 0, Name: "rootDirB", Type: FileTypeDirectory, AnimeID: &animeIDB},
		{ID: 1103, ParentID: 0, Name: "rootDirC", Type: FileTypeDirectory},
	}
	LoadTestData(t, testClient, files)

	fileClient := testClient.File()
	ctx := context.Background()

	t.Run("FindDirectoriesByAnimeID returns matching directories", func(t *testing.T) {
		got, err := fileClient.FindDirectoriesByAnimeID(510)
		assert.NoError(t, err)
		assert.Len(t, got, 1)
		assert.Equal(t, uint(1100), got[0].ID)
	})

	t.Run("FindDirectoriesWithAnyAnime returns all assigned dirs", func(t *testing.T) {
		got, err := fileClient.FindDirectoriesWithAnyAnime()
		assert.NoError(t, err)
		assert.Len(t, got, 2)
	})

	t.Run("SetAnimeID assigns an anime to a directory", func(t *testing.T) {
		anID := uint(511)
		err := fileClient.SetAnimeID(ctx, 1103, &anID)
		assert.NoError(t, err)
		dir, err := FindByValue(testClient.Client, File{ID: 1103})
		require.NoError(t, err)
		require.NotNil(t, dir.AnimeID)
		assert.Equal(t, uint(511), *dir.AnimeID)
	})

	t.Run("SetAnimeID nil clears the assignment", func(t *testing.T) {
		err := fileClient.SetAnimeID(ctx, 1103, nil)
		assert.NoError(t, err)
		dir, err := FindByValue(testClient.Client, File{ID: 1103})
		require.NoError(t, err)
		assert.Nil(t, dir.AnimeID)
	})

	t.Run("ClearAnimeIDByAnimeID removes all references", func(t *testing.T) {
		err := fileClient.ClearAnimeIDByAnimeID(ctx, 510)
		assert.NoError(t, err)
		got, err := fileClient.FindDirectoriesByAnimeID(510)
		assert.NoError(t, err)
		assert.Empty(t, got)
		// other anime untouched
		got, err = fileClient.FindDirectoriesByAnimeID(511)
		assert.NoError(t, err)
		assert.Len(t, got, 1)
	})
}
