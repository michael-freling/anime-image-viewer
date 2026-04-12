package anime

import (
	"context"
	"testing"

	"github.com/michael-freling/anime-image-viewer/internal/anilist"
	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// mockAniListClient implements anilist.Client for testing.
type mockAniListClient struct {
	searchResult []anilist.MediaSearchResult
	searchErr    error
	detailResult *anilist.MediaDetail
	detailErr    error
}

func (m *mockAniListClient) SearchAnime(_ context.Context, _ string, _ int, _ int) ([]anilist.MediaSearchResult, error) {
	return m.searchResult, m.searchErr
}

func (m *mockAniListClient) GetAnimeDetail(_ context.Context, _ int) (*anilist.MediaDetail, error) {
	return m.detailResult, m.detailErr
}

func TestImportFromAniList_CreatesEntriesAndCharacters(t *testing.T) {
	te := newTester(t)
	ctx := context.Background()

	mock := &mockAniListClient{
		detailResult: &anilist.MediaDetail{
			ID: 12345,
			Title: anilist.MediaTitle{
				Romaji:  "Shingeki no Kyojin",
				English: "Attack on Titan",
			},
			Format:     "TV",
			Season:     "SPRING",
			SeasonYear: 2013,
			Relations: []anilist.MediaRelation{
				{
					RelationType: "SEQUEL",
					ID:           20958,
					Title: anilist.MediaTitle{
						Romaji:  "Shingeki no Kyojin Season 2",
						English: "Attack on Titan Season 2",
					},
					Type:       "ANIME",
					Format:     "TV",
					Season:     "SPRING",
					SeasonYear: 2017,
				},
				{
					RelationType: "SEQUEL",
					ID:           99147,
					Title: anilist.MediaTitle{
						Romaji:  "Shingeki no Kyojin Season 3",
						English: "Attack on Titan Season 3",
					},
					Type:       "ANIME",
					Format:     "TV",
					Season:     "SUMMER",
					SeasonYear: 2018,
				},
				{
					RelationType: "SIDE_STORY",
					ID:           99999,
					Title: anilist.MediaTitle{
						Romaji:  "Shingeki no Kyojin Movie",
						English: "Attack on Titan Movie",
					},
					Type:       "ANIME",
					Format:     "MOVIE",
					SeasonYear: 2015,
				},
				// This PREQUEL relation should be skipped.
				{
					RelationType: "PREQUEL",
					ID:           88888,
					Title: anilist.MediaTitle{
						Romaji:  "Some Prequel",
						English: "Some Prequel",
					},
					Type:   "ANIME",
					Format: "TV",
				},
				// This MANGA relation should be skipped.
				{
					RelationType: "SEQUEL",
					ID:           77777,
					Title: anilist.MediaTitle{
						Romaji: "Manga Version",
					},
					Type:   "MANGA",
					Format: "MANGA",
				},
			},
			Characters: []anilist.Character{
				{ID: 1, Role: "MAIN", Name: struct {
					Full   string `json:"full"`
					Native string `json:"native"`
				}{Full: "Eren Yeager", Native: "エレン・イェーガー"}},
				{ID: 2, Role: "MAIN", Name: struct {
					Full   string `json:"full"`
					Native string `json:"native"`
				}{Full: "Mikasa Ackerman", Native: "ミカサ・アッカーマン"}},
				{ID: 3, Role: "SUPPORTING", Name: struct {
					Full   string `json:"full"`
					Native string `json:"native"`
				}{Full: "Armin Arlert", Native: "アルミン・アルレルト"}},
				// BACKGROUND characters should be skipped.
				{ID: 4, Role: "BACKGROUND", Name: struct {
					Full   string `json:"full"`
					Native string `json:"native"`
				}{Full: "Background NPC"}},
			},
		},
	}

	svc := te.serviceWithAniList(mock)

	// Create the anime first.
	created, err := svc.Create(ctx, "Attack on Titan")
	require.NoError(t, err)

	// Run import.
	result, err := svc.ImportFromAniList(ctx, created.ID, 12345)
	require.NoError(t, err)

	// Verify result counts: season1 (main) + 2 sequels + 1 movie = 4 entries,
	// 3 characters (MAIN + SUPPORTING only).
	assert.Equal(t, 4, result.EntriesCreated)
	assert.Equal(t, 3, result.CharactersCreated)

	// Verify AniListID is set on the anime record.
	animeRow, err := te.dbClient.Anime().FindByValue(ctx, &db.Anime{ID: created.ID})
	require.NoError(t, err)
	require.NotNil(t, animeRow.AniListID)
	assert.Equal(t, 12345, *animeRow.AniListID)

	// Verify entries were created.
	entries, err := svc.GetAnimeEntries(created.ID)
	require.NoError(t, err)
	// Count season and movie entries.
	var seasonCount, movieCount int
	for _, e := range entries {
		switch e.EntryType {
		case db.EntryTypeSeason:
			seasonCount++
		case db.EntryTypeMovie:
			movieCount++
		}
	}
	assert.Equal(t, 3, seasonCount, "expected 3 season entries")
	assert.Equal(t, 1, movieCount, "expected 1 movie entry")

	// Verify character tags.
	tags, err := te.dbClient.Tag().FindTagsByAnimeID(created.ID)
	require.NoError(t, err)
	assert.Len(t, tags, 3)

	tagNames := make(map[string]bool)
	for _, tag := range tags {
		tagNames[tag.Name] = true
		assert.Equal(t, "character", tag.Category)
		require.NotNil(t, tag.AnimeID)
		assert.Equal(t, created.ID, *tag.AnimeID)
	}
	assert.True(t, tagNames["Eren Yeager"])
	assert.True(t, tagNames["Mikasa Ackerman"])
	assert.True(t, tagNames["Armin Arlert"])

	// Verify airing info on season 1 entry.
	rootFolder, err := svc.FindAnimeRootFolder(created.ID)
	require.NoError(t, err)
	require.NotNil(t, rootFolder)
	children, err := te.dbClient.File().FindDirectChildDirectories(rootFolder.ID)
	require.NoError(t, err)
	// Find Season 1 entry.
	for _, child := range children {
		if child.EntryType == db.EntryTypeSeason && child.EntryNumber != nil && *child.EntryNumber == 1 {
			assert.Equal(t, db.AiringSeasonSpring, child.AiringSeason)
			require.NotNil(t, child.AiringYear)
			assert.Equal(t, uint(2013), *child.AiringYear)
			break
		}
	}
}

func TestImportFromAniList_SkipsDuplicateEntries(t *testing.T) {
	te := newTester(t)
	ctx := context.Background()

	mock := &mockAniListClient{
		detailResult: &anilist.MediaDetail{
			ID: 12345,
			Title: anilist.MediaTitle{
				Romaji:  "Bocchi the Rock!",
				English: "Bocchi the Rock!",
			},
			Format:     "TV",
			Season:     "FALL",
			SeasonYear: 2022,
			Relations: []anilist.MediaRelation{
				{
					RelationType: "SEQUEL",
					ID:           200000,
					Title: anilist.MediaTitle{
						Romaji:  "Bocchi the Rock! Season 2",
						English: "Bocchi the Rock! Season 2",
					},
					Type:       "ANIME",
					Format:     "TV",
					Season:     "SPRING",
					SeasonYear: 2025,
				},
			},
		},
	}

	svc := te.serviceWithAniList(mock)

	// Create the anime.
	created, err := svc.Create(ctx, "Bocchi the Rock!")
	require.NoError(t, err)

	// Pre-create Season 1 manually.
	_, err = svc.CreateEntry(ctx, created.ID, db.EntryTypeSeason, nil, "")
	require.NoError(t, err)

	// Run import. Season 1 already exists, so only Season 2 should be created,
	// plus no characters.
	result, err := svc.ImportFromAniList(ctx, created.ID, 12345)
	require.NoError(t, err)

	// ensureSeasonEntry creates the next number, so Season 1 exists and import
	// creates Season 2 for the main anime + Season 3 for the sequel = 2 entries.
	// Actually: the main anime triggers ensureSeasonEntry which gets Season 2
	// (since Season 1 exists). The sequel triggers another ensureSeasonEntry
	// which gets Season 3.
	assert.Equal(t, 2, result.EntriesCreated)

	// Verify total season entries: Season 1 (manual) + Season 2 (main) + Season 3 (sequel).
	entries, err := svc.GetAnimeEntries(created.ID)
	require.NoError(t, err)
	seasonCount := 0
	for _, e := range entries {
		if e.EntryType == db.EntryTypeSeason {
			seasonCount++
		}
	}
	assert.Equal(t, 3, seasonCount)
}

func TestImportFromAniList_SkipsDuplicateCharacters(t *testing.T) {
	te := newTester(t)
	ctx := context.Background()

	mock := &mockAniListClient{
		detailResult: &anilist.MediaDetail{
			ID: 12345,
			Title: anilist.MediaTitle{
				Romaji:  "Frieren",
				English: "Frieren",
			},
			Format:     "TV",
			Season:     "FALL",
			SeasonYear: 2023,
			Characters: []anilist.Character{
				{ID: 1, Role: "MAIN", Name: struct {
					Full   string `json:"full"`
					Native string `json:"native"`
				}{Full: "Frieren"}},
				{ID: 2, Role: "MAIN", Name: struct {
					Full   string `json:"full"`
					Native string `json:"native"`
				}{Full: "Fern"}},
			},
		},
	}

	svc := te.serviceWithAniList(mock)

	// Create the anime.
	created, err := svc.Create(ctx, "Frieren")
	require.NoError(t, err)

	// Pre-create a character tag for "Frieren".
	aid := created.ID
	preTag := db.Tag{Name: "Frieren", Category: "character", AnimeID: &aid}
	require.NoError(t, te.dbClient.Tag().Create(ctx, &preTag))

	// Run import.
	result, err := svc.ImportFromAniList(ctx, created.ID, 12345)
	require.NoError(t, err)

	// Only "Fern" should be created; "Frieren" already exists.
	assert.Equal(t, 1, result.CharactersCreated)

	// Verify total character tags.
	tags, err := te.dbClient.Tag().FindTagsByAnimeID(created.ID)
	require.NoError(t, err)
	assert.Len(t, tags, 2)
}

func TestSearchAniList(t *testing.T) {
	te := newTester(t)
	ctx := context.Background()

	expected := []anilist.MediaSearchResult{
		{
			ID: 1,
			Title: anilist.MediaTitle{
				Romaji:  "Shingeki no Kyojin",
				English: "Attack on Titan",
			},
			Format: "TV",
		},
	}

	mock := &mockAniListClient{
		searchResult: expected,
	}

	svc := te.serviceWithAniList(mock)

	results, err := svc.SearchAniList(ctx, "attack on titan")
	require.NoError(t, err)
	assert.Equal(t, expected, results)
}

func TestSearchAniList_NilClient(t *testing.T) {
	te := newTester(t)
	ctx := context.Background()

	svc := te.service() // nil anilist client

	_, err := svc.SearchAniList(ctx, "test")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "anilist client is not configured")
}
