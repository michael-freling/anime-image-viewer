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

func TestAnimeTagClient_Roundtrip(t *testing.T) {
	testClient := NewTestClient(t)
	testClient.Truncate(t, Anime{}, AnimeTag{}, Tag{})

	LoadTestData(t, testClient, []Anime{
		{ID: 800, Name: "Show A"},
		{ID: 801, Name: "Show B"},
	})
	LoadTestData(t, testClient, []Tag{
		{ID: 700, Name: "tagA"},
		{ID: 701, Name: "tagB"},
		{ID: 702, Name: "tagC"},
	})
	LoadTestData(t, testClient, []AnimeTag{
		{AnimeID: 800, TagID: 700},
		{AnimeID: 800, TagID: 701},
		{AnimeID: 801, TagID: 702},
	})

	c := testClient.AnimeTag()

	t.Run("FindAllByAnimeIDs returns matching rows", func(t *testing.T) {
		got, err := c.FindAllByAnimeIDs([]uint{800})
		assert.NoError(t, err)
		assert.Len(t, got, 2)
	})

	t.Run("FindAllByAnimeIDs empty input returns empty", func(t *testing.T) {
		got, err := c.FindAllByAnimeIDs(nil)
		assert.NoError(t, err)
		assert.Empty(t, got)
	})

	t.Run("FindAllByTagIDs returns matching rows", func(t *testing.T) {
		got, err := c.FindAllByTagIDs([]uint{702})
		assert.NoError(t, err)
		assert.Len(t, got, 1)
		assert.Equal(t, uint(801), got[0].AnimeID)
	})

	t.Run("FindAllByTagIDs empty input returns empty", func(t *testing.T) {
		got, err := c.FindAllByTagIDs(nil)
		assert.NoError(t, err)
		assert.Empty(t, got)
	})

	t.Run("DeleteByAnimeAndTag removes a single row", func(t *testing.T) {
		err := c.DeleteByAnimeAndTag(context.Background(), 800, 700)
		assert.NoError(t, err)
		remaining, err := c.FindAllByAnimeIDs([]uint{800})
		assert.NoError(t, err)
		assert.Len(t, remaining, 1)
		assert.Equal(t, uint(701), remaining[0].TagID)
	})

	t.Run("DeleteByAnimeID removes everything for the anime", func(t *testing.T) {
		err := c.DeleteByAnimeID(context.Background(), 800)
		assert.NoError(t, err)
		remaining, err := c.FindAllByAnimeIDs([]uint{800})
		assert.NoError(t, err)
		assert.Empty(t, remaining)

		// other anime untouched
		remaining, err = c.FindAllByAnimeIDs([]uint{801})
		assert.NoError(t, err)
		assert.Len(t, remaining, 1)
	})
}

func TestAnimeTagList_ToAnimeMap(t *testing.T) {
	list := AnimeTagList{
		{AnimeID: 1, TagID: 10},
		{AnimeID: 1, TagID: 11},
		{AnimeID: 2, TagID: 20},
	}
	got := list.ToAnimeMap()
	assert.Len(t, got, 2)
	assert.ElementsMatch(t, []uint{10, 11}, got[1])
	assert.ElementsMatch(t, []uint{20}, got[2])
}

func TestAnimeTagList_ToTagMap(t *testing.T) {
	list := AnimeTagList{
		{AnimeID: 1, TagID: 10},
		{AnimeID: 2, TagID: 10},
		{AnimeID: 3, TagID: 20},
	}
	got := list.ToTagMap()
	assert.Len(t, got, 2)
	assert.ElementsMatch(t, []uint{1, 2}, got[10])
	assert.ElementsMatch(t, []uint{3}, got[20])
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
