package anime

import (
	"context"
	"fmt"
	"testing"

	"github.com/michael-freling/anime-image-viewer/internal/anilist"
	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// mockAniListClient implements anilist.Client for testing.
type mockAniListClient struct {
	searchResult  []anilist.MediaSearchResult
	searchErr     error
	detailResults map[int]*anilist.MediaDetail // keyed by AniList ID
	detailErr     error
	callCount     int // number of GetAnimeDetail calls made
}

func (m *mockAniListClient) SearchAnime(_ context.Context, _ string, _ int, _ int) ([]anilist.MediaSearchResult, error) {
	return m.searchResult, m.searchErr
}

func (m *mockAniListClient) GetAnimeDetail(_ context.Context, id int) (*anilist.MediaDetail, error) {
	m.callCount++
	if m.detailErr != nil {
		return nil, m.detailErr
	}
	return m.detailResults[id], nil
}

func TestImportFromAniList_FollowsChainAndDeduplicatesCharacters(t *testing.T) {
	te := newTester(t)
	ctx := context.Background()

	// BFS: each season has its own entry in detailResults. The BFS traversal
	// fetches each one individually via flat SEQUEL/PREQUEL relations.
	mock := &mockAniListClient{
		detailResults: map[int]*anilist.MediaDetail{
			100: {
				ID: 100,
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
						ID:           200,
						Title: anilist.MediaTitle{
							Romaji:  "Shingeki no Kyojin Season 2",
							English: "Attack on Titan Season 2",
						},
						Type:       "ANIME",
						Format:     "TV",
						Season:     "SPRING",
						SeasonYear: 2017,
					},
					// MANGA relation should be skipped.
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
				},
			},
			200: {
				ID: 200,
				Title: anilist.MediaTitle{
					Romaji:  "Shingeki no Kyojin Season 2",
					English: "Attack on Titan Season 2",
				},
				Format:     "TV",
				Season:     "SPRING",
				SeasonYear: 2017,
				Relations: []anilist.MediaRelation{
					{
						RelationType: "PREQUEL",
						ID:           100,
						Type:         "ANIME",
						Format:       "TV",
					},
					{
						RelationType: "SEQUEL",
						ID:           300,
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
				},
				Characters: []anilist.Character{
					{ID: 3, Role: "SUPPORTING", Name: struct {
						Full   string `json:"full"`
						Native string `json:"native"`
					}{Full: "Armin Arlert", Native: "アルミン・アルレルト"}},
				},
			},
			300: {
				ID: 300,
				Title: anilist.MediaTitle{
					Romaji:  "Shingeki no Kyojin Season 3",
					English: "Attack on Titan Season 3",
				},
				Format:     "TV",
				Season:     "SUMMER",
				SeasonYear: 2018,
				Relations: []anilist.MediaRelation{
					{
						RelationType: "PREQUEL",
						ID:           200,
						Type:         "ANIME",
						Format:       "TV",
					},
				},
				Characters: []anilist.Character{
					// Duplicate of Eren from ID 100 -- should be deduped.
					{ID: 1, Role: "MAIN", Name: struct {
						Full   string `json:"full"`
						Native string `json:"native"`
					}{Full: "Eren Yeager", Native: "エレン・イェーガー"}},
				},
			},
		},
	}

	svc := te.serviceWithAniList(mock)

	// Create the anime first.
	created, err := svc.Create(ctx, "Attack on Titan")
	require.NoError(t, err)

	// Run import starting from Season 1.
	result, err := svc.ImportFromAniList(ctx, created.ID, 100)
	require.NoError(t, err)

	// Verify result counts:
	// 3 season entries (Season 1, 2, 3) + 1 movie = 4 entries.
	// 3 unique characters (Eren, Mikasa, Armin) -- Eren deduped across seasons.
	assert.Equal(t, 4, result.EntriesCreated)
	assert.Equal(t, 3, result.CharactersCreated)

	// Verify AniListID is set on the anime record.
	animeRow, err := te.dbClient.Anime().FindByValue(ctx, &db.Anime{ID: created.ID})
	require.NoError(t, err)
	require.NotNil(t, animeRow.AniListID)
	assert.Equal(t, 100, *animeRow.AniListID)

	// Verify entries were created.
	entries, err := svc.GetAnimeEntries(created.ID)
	require.NoError(t, err)
	var seasonCount, movieCount int
	seasonNames := make(map[uint]string)
	for _, e := range entries {
		switch e.EntryType {
		case db.EntryTypeSeason:
			seasonCount++
			if e.EntryNumber != nil {
				seasonNames[*e.EntryNumber] = e.Name
			}
		case db.EntryTypeMovie:
			movieCount++
		}
	}
	assert.Equal(t, 3, seasonCount, "expected 3 season entries")
	assert.Equal(t, 1, movieCount, "expected 1 movie entry")

	// Verify folder names use AniList titles instead of "Season N".
	assert.Equal(t, "Attack on Titan", seasonNames[1])
	assert.Equal(t, "Attack on Titan Season 2", seasonNames[2])
	assert.Equal(t, "Attack on Titan Season 3", seasonNames[3])

	// Verify character tags -- only 3 unique.
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
	for _, child := range children {
		if child.EntryType == db.EntryTypeSeason && child.EntryNumber != nil && *child.EntryNumber == 1 {
			assert.Equal(t, db.AiringSeasonSpring, child.AiringSeason)
			require.NotNil(t, child.AiringYear)
			assert.Equal(t, uint(2013), *child.AiringYear)
			break
		}
	}

	// BFS makes 3 API calls (one per season).
	assert.Equal(t, 3, mock.callCount, "BFS should make 3 API calls (one per season)")
}

func TestImportFromAniList_SelectMiddleSeason(t *testing.T) {
	te := newTester(t)
	ctx := context.Background()

	// BFS: user selects Season 2 (ID 200). BFS discovers Season 1 via PREQUEL
	// and Season 3 via SEQUEL, fetching each individually.
	mock := &mockAniListClient{
		detailResults: map[int]*anilist.MediaDetail{
			200: {
				ID: 200,
				Title: anilist.MediaTitle{
					Romaji:  "Series S2",
					English: "Series S2",
				},
				Format:     "TV",
				Season:     "SPRING",
				SeasonYear: 2021,
				Relations: []anilist.MediaRelation{
					{
						RelationType: "PREQUEL",
						ID:           100,
						Title: anilist.MediaTitle{
							Romaji:  "Series S1",
							English: "Series S1",
						},
						Type:       "ANIME",
						Format:     "TV",
						Season:     "WINTER",
						SeasonYear: 2020,
					},
					{
						RelationType: "SEQUEL",
						ID:           300,
						Title: anilist.MediaTitle{
							Romaji:  "Series S3",
							English: "Series S3",
						},
						Type:       "ANIME",
						Format:     "TV",
						Season:     "FALL",
						SeasonYear: 2022,
					},
				},
			},
			100: {
				ID: 100,
				Title: anilist.MediaTitle{
					Romaji:  "Series S1",
					English: "Series S1",
				},
				Format:     "TV",
				Season:     "WINTER",
				SeasonYear: 2020,
				Relations: []anilist.MediaRelation{
					{
						RelationType: "SEQUEL",
						ID:           200,
						Type:         "ANIME",
						Format:       "TV",
					},
				},
			},
			300: {
				ID: 300,
				Title: anilist.MediaTitle{
					Romaji:  "Series S3",
					English: "Series S3",
				},
				Format:     "TV",
				Season:     "FALL",
				SeasonYear: 2022,
				Relations: []anilist.MediaRelation{
					{
						RelationType: "PREQUEL",
						ID:           200,
						Type:         "ANIME",
						Format:       "TV",
					},
				},
			},
		},
	}

	svc := te.serviceWithAniList(mock)

	created, err := svc.Create(ctx, "Series Middle")
	require.NoError(t, err)

	// User selects Season 2 (middle of the chain). BFS discovers all 3.
	result, err := svc.ImportFromAniList(ctx, created.ID, 200)
	require.NoError(t, err)

	assert.Equal(t, 3, result.EntriesCreated, "all 3 seasons should be created")

	entries, err := svc.GetAnimeEntries(created.ID)
	require.NoError(t, err)
	seasonCount := 0
	seasonNames := make(map[uint]string)
	for _, e := range entries {
		if e.EntryType == db.EntryTypeSeason {
			seasonCount++
			if e.EntryNumber != nil {
				seasonNames[*e.EntryNumber] = e.Name
			}
		}
	}
	assert.Equal(t, 3, seasonCount)

	// Verify folder names use AniList titles.
	assert.Equal(t, "Series S1", seasonNames[1])
	assert.Equal(t, "Series S2", seasonNames[2])
	assert.Equal(t, "Series S3", seasonNames[3])

	// Verify airing info: Season 1 should be 2020, Season 2 should be 2021,
	// Season 3 should be 2022 (sorted by seasonYear).
	rootFolder, err := svc.FindAnimeRootFolder(created.ID)
	require.NoError(t, err)
	children, err := te.dbClient.File().FindDirectChildDirectories(rootFolder.ID)
	require.NoError(t, err)
	for _, child := range children {
		if child.EntryType != db.EntryTypeSeason || child.EntryNumber == nil {
			continue
		}
		switch *child.EntryNumber {
		case 1:
			require.NotNil(t, child.AiringYear)
			assert.Equal(t, uint(2020), *child.AiringYear)
		case 2:
			require.NotNil(t, child.AiringYear)
			assert.Equal(t, uint(2021), *child.AiringYear)
		case 3:
			require.NotNil(t, child.AiringYear)
			assert.Equal(t, uint(2022), *child.AiringYear)
		}
	}

	// BFS makes 3 API calls (one per season).
	assert.Equal(t, 3, mock.callCount, "BFS should make 3 API calls (one per season)")
}

func TestImportFromAniList_SkipsDuplicateEntries(t *testing.T) {
	te := newTester(t)
	ctx := context.Background()

	mock := &mockAniListClient{
		detailResults: map[int]*anilist.MediaDetail{
			100: {
				ID: 100,
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
						ID:           200,
						Type:         "ANIME",
						Format:       "TV",
						Season:       "SPRING",
						SeasonYear:   2025,
					},
				},
			},
			200: {
				ID: 200,
				Title: anilist.MediaTitle{
					Romaji:  "Bocchi the Rock! Season 2",
					English: "Bocchi the Rock! Season 2",
				},
				Format:     "TV",
				Season:     "SPRING",
				SeasonYear: 2025,
				Relations: []anilist.MediaRelation{
					{
						RelationType: "PREQUEL",
						ID:           100,
						Type:         "ANIME",
						Format:       "TV",
					},
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

	// Run import. Season 1 already exists, so only Season 2 should be created.
	result, err := svc.ImportFromAniList(ctx, created.ID, 100)
	require.NoError(t, err)

	assert.Equal(t, 1, result.EntriesCreated, "only Season 2 should be newly created")

	// Verify total season entries: Season 1 (pre-existing) + Season 2 (new).
	entries, err := svc.GetAnimeEntries(created.ID)
	require.NoError(t, err)
	seasonCount := 0
	for _, e := range entries {
		if e.EntryType == db.EntryTypeSeason {
			seasonCount++
		}
	}
	assert.Equal(t, 2, seasonCount)

	// Verify Season 1 has updated airing info.
	rootFolder, err := svc.FindAnimeRootFolder(created.ID)
	require.NoError(t, err)
	children, err := te.dbClient.File().FindDirectChildDirectories(rootFolder.ID)
	require.NoError(t, err)
	for _, child := range children {
		if child.EntryType == db.EntryTypeSeason && child.EntryNumber != nil && *child.EntryNumber == 1 {
			assert.Equal(t, db.AiringSeasonFall, child.AiringSeason)
			require.NotNil(t, child.AiringYear)
			assert.Equal(t, uint(2022), *child.AiringYear)
			break
		}
	}
}

func TestImportFromAniList_SkipsDuplicateCharacters(t *testing.T) {
	te := newTester(t)
	ctx := context.Background()

	mock := &mockAniListClient{
		detailResults: map[int]*anilist.MediaDetail{
			100: {
				ID: 100,
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
	result, err := svc.ImportFromAniList(ctx, created.ID, 100)
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

func TestImportFromAniList_SanitizesMovieNames(t *testing.T) {
	te := newTester(t)
	ctx := context.Background()

	mock := &mockAniListClient{
		detailResults: map[int]*anilist.MediaDetail{
			100: {
				ID: 100,
				Title: anilist.MediaTitle{
					Romaji:  "Series",
					English: "Series",
				},
				Format:     "TV",
				Season:     "FALL",
				SeasonYear: 2020,
				Relations: []anilist.MediaRelation{
					{
						RelationType: "SIDE_STORY",
						ID:           999,
						Title: anilist.MediaTitle{
							Romaji:  "Series: The Movie",
							English: "Series: The Movie",
						},
						Type:       "ANIME",
						Format:     "MOVIE",
						SeasonYear: 2022,
					},
				},
			},
		},
	}

	svc := te.serviceWithAniList(mock)

	created, err := svc.Create(ctx, "Series")
	require.NoError(t, err)

	result, err := svc.ImportFromAniList(ctx, created.ID, 100)
	require.NoError(t, err)

	// 1 season + 1 movie = 2 entries.
	assert.Equal(t, 2, result.EntriesCreated)

	// Verify the movie folder name has ":" replaced with "-".
	entries, err := svc.GetAnimeEntries(created.ID)
	require.NoError(t, err)
	for _, e := range entries {
		if e.EntryType == db.EntryTypeMovie {
			assert.Equal(t, "Series- The Movie", e.Name, "colon should be replaced with dash")
			break
		}
	}
}

func TestParsePartSuffix(t *testing.T) {
	tests := []struct {
		title    string
		wantBase string
		wantPart int
	}{
		{"Attack on Titan Season 3", "Attack on Titan Season 3", 0},
		{"Attack on Titan Season 3 Part 2", "Attack on Titan Season 3", 2},
		{"Shingeki no Kyojin Season 3 Part 2", "Shingeki no Kyojin Season 3", 2},
		{"The Final Season Part 3", "The Final Season", 3},
		{"Solo Leveling", "Solo Leveling", 0},
		{"Departures", "Departures", 0},
		{"Part 1", "Part 1", 0}, // "Part" at start, not preceded by space
	}
	for _, tt := range tests {
		t.Run(tt.title, func(t *testing.T) {
			base, part := parsePartSuffix(tt.title)
			assert.Equal(t, tt.wantBase, base)
			assert.Equal(t, tt.wantPart, part)
		})
	}
}

func TestImportFromAniList_GroupsParts(t *testing.T) {
	te := newTester(t)
	ctx := context.Background()

	// Mock entries:
	// ID 100: "The Final Season" (Winter 2021) - no Part suffix
	// ID 200: "The Final Season Part 2" (Winter 2022)
	// ID 300: "The Final Season Part 3" (Spring 2023)
	// All TV, connected by SEQUEL/PREQUEL.
	//
	// Expected:
	// 1 season group: "The Final Season" with 3 parts (implicit Part 1, Part 2, Part 3)
	// result.EntriesCreated = 1 (season) + 3 (parts) = 4
	mock := &mockAniListClient{
		detailResults: map[int]*anilist.MediaDetail{
			100: {
				ID: 100,
				Title: anilist.MediaTitle{
					Romaji:  "Shingeki no Kyojin: The Final Season",
					English: "The Final Season",
				},
				Format:     "TV",
				Season:     "WINTER",
				SeasonYear: 2021,
				Relations: []anilist.MediaRelation{
					{
						RelationType: "SEQUEL",
						ID:           200,
						Type:         "ANIME",
						Format:       "TV",
					},
				},
			},
			200: {
				ID: 200,
				Title: anilist.MediaTitle{
					Romaji:  "Shingeki no Kyojin: The Final Season Part 2",
					English: "The Final Season Part 2",
				},
				Format:     "TV",
				Season:     "WINTER",
				SeasonYear: 2022,
				Relations: []anilist.MediaRelation{
					{
						RelationType: "PREQUEL",
						ID:           100,
						Type:         "ANIME",
						Format:       "TV",
					},
					{
						RelationType: "SEQUEL",
						ID:           300,
						Type:         "ANIME",
						Format:       "TV",
					},
				},
			},
			300: {
				ID: 300,
				Title: anilist.MediaTitle{
					Romaji:  "Shingeki no Kyojin: The Final Season Part 3",
					English: "The Final Season Part 3",
				},
				Format:     "TV",
				Season:     "SPRING",
				SeasonYear: 2023,
				Relations: []anilist.MediaRelation{
					{
						RelationType: "PREQUEL",
						ID:           200,
						Type:         "ANIME",
						Format:       "TV",
					},
				},
			},
		},
	}

	svc := te.serviceWithAniList(mock)

	created, err := svc.Create(ctx, "AoT Final")
	require.NoError(t, err)

	result, err := svc.ImportFromAniList(ctx, created.ID, 100)
	require.NoError(t, err)

	// 1 season group + 3 sub-entries (parts) = 4 entries created.
	assert.Equal(t, 4, result.EntriesCreated)

	// Verify 1 season entry with the base title.
	entries, err := svc.GetAnimeEntries(created.ID)
	require.NoError(t, err)
	seasonCount := 0
	var seasonEntry AnimeEntry
	for _, e := range entries {
		if e.EntryType == db.EntryTypeSeason {
			seasonCount++
			seasonEntry = e
		}
	}
	assert.Equal(t, 1, seasonCount, "expected 1 season group")
	assert.Equal(t, "The Final Season", seasonEntry.Name)

	// Verify 3 sub-entries under the season.
	rootFolder, err := svc.FindAnimeRootFolder(created.ID)
	require.NoError(t, err)
	require.NotNil(t, rootFolder)
	seasonChildren, err := te.dbClient.File().FindDirectChildDirectories(rootFolder.ID)
	require.NoError(t, err)

	var seasonFileID uint
	for _, child := range seasonChildren {
		if child.EntryType == db.EntryTypeSeason {
			seasonFileID = child.ID
			break
		}
	}
	require.NotZero(t, seasonFileID)

	subEntries, err := te.dbClient.File().FindDirectChildDirectories(seasonFileID)
	require.NoError(t, err)
	assert.Len(t, subEntries, 3, "expected 3 part sub-entries")

	subNames := make(map[string]bool)
	subAiring := make(map[string]db.File) // name -> file record
	for _, sub := range subEntries {
		subNames[sub.Name] = true
		subAiring[sub.Name] = sub
	}
	assert.True(t, subNames["Part 1"], "expected Part 1 sub-entry")
	assert.True(t, subNames["Part 2"], "expected Part 2 sub-entry")
	assert.True(t, subNames["Part 3"], "expected Part 3 sub-entry")

	// Verify airing info on each part sub-entry.
	// Part 1 = WINTER 2021, Part 2 = WINTER 2022, Part 3 = SPRING 2023.
	p1 := subAiring["Part 1"]
	assert.Equal(t, db.AiringSeasonWinter, p1.AiringSeason, "Part 1 should have WINTER season")
	require.NotNil(t, p1.AiringYear, "Part 1 should have airing year set")
	assert.Equal(t, uint(2021), *p1.AiringYear, "Part 1 should have year 2021")

	p2 := subAiring["Part 2"]
	assert.Equal(t, db.AiringSeasonWinter, p2.AiringSeason, "Part 2 should have WINTER season")
	require.NotNil(t, p2.AiringYear, "Part 2 should have airing year set")
	assert.Equal(t, uint(2022), *p2.AiringYear, "Part 2 should have year 2022")

	p3 := subAiring["Part 3"]
	assert.Equal(t, db.AiringSeasonSpring, p3.AiringSeason, "Part 3 should have SPRING season")
	require.NotNil(t, p3.AiringYear, "Part 3 should have airing year set")
	assert.Equal(t, uint(2023), *p3.AiringYear, "Part 3 should have year 2023")
}

func TestImportFromAniList_MixedSingleAndMultiPart(t *testing.T) {
	te := newTester(t)
	ctx := context.Background()

	// ID 100: "Attack on Titan" (2013) - standalone
	// ID 200: "Attack on Titan Season 2" (2017) - standalone
	// ID 300: "Attack on Titan Season 3" (2018) - group
	// ID 400: "Attack on Titan Season 3 Part 2" (2019) - group
	//
	// Expected:
	// 3 groups: "Attack on Titan" (1), "Attack on Titan Season 2" (1),
	//           "Attack on Titan Season 3" (2 entries -> Part 1, Part 2)
	// result.EntriesCreated = 3 (seasons) + 2 (parts in Season 3) = 5
	mock := &mockAniListClient{
		detailResults: map[int]*anilist.MediaDetail{
			100: {
				ID: 100,
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
						ID:           200,
						Type:         "ANIME",
						Format:       "TV",
					},
				},
			},
			200: {
				ID: 200,
				Title: anilist.MediaTitle{
					Romaji:  "Shingeki no Kyojin Season 2",
					English: "Attack on Titan Season 2",
				},
				Format:     "TV",
				Season:     "SPRING",
				SeasonYear: 2017,
				Relations: []anilist.MediaRelation{
					{
						RelationType: "PREQUEL",
						ID:           100,
						Type:         "ANIME",
						Format:       "TV",
					},
					{
						RelationType: "SEQUEL",
						ID:           300,
						Type:         "ANIME",
						Format:       "TV",
					},
				},
			},
			300: {
				ID: 300,
				Title: anilist.MediaTitle{
					Romaji:  "Shingeki no Kyojin Season 3",
					English: "Attack on Titan Season 3",
				},
				Format:     "TV",
				Season:     "SUMMER",
				SeasonYear: 2018,
				Relations: []anilist.MediaRelation{
					{
						RelationType: "PREQUEL",
						ID:           200,
						Type:         "ANIME",
						Format:       "TV",
					},
					{
						RelationType: "SEQUEL",
						ID:           400,
						Type:         "ANIME",
						Format:       "TV",
					},
				},
			},
			400: {
				ID: 400,
				Title: anilist.MediaTitle{
					Romaji:  "Shingeki no Kyojin Season 3 Part 2",
					English: "Attack on Titan Season 3 Part 2",
				},
				Format:     "TV",
				Season:     "SPRING",
				SeasonYear: 2019,
				Relations: []anilist.MediaRelation{
					{
						RelationType: "PREQUEL",
						ID:           300,
						Type:         "ANIME",
						Format:       "TV",
					},
				},
			},
		},
	}

	svc := te.serviceWithAniList(mock)

	created, err := svc.Create(ctx, "AoT Mixed")
	require.NoError(t, err)

	result, err := svc.ImportFromAniList(ctx, created.ID, 100)
	require.NoError(t, err)

	// 3 season groups + 2 part sub-entries = 5 entries created.
	assert.Equal(t, 5, result.EntriesCreated)

	// Verify 3 season entries.
	entries, err := svc.GetAnimeEntries(created.ID)
	require.NoError(t, err)
	seasonCount := 0
	seasonNames := make(map[uint]string)
	for _, e := range entries {
		if e.EntryType == db.EntryTypeSeason {
			seasonCount++
			if e.EntryNumber != nil {
				seasonNames[*e.EntryNumber] = e.Name
			}
		}
	}
	assert.Equal(t, 3, seasonCount, "expected 3 season groups")
	assert.Equal(t, "Attack on Titan", seasonNames[1])
	assert.Equal(t, "Attack on Titan Season 2", seasonNames[2])
	assert.Equal(t, "Attack on Titan Season 3", seasonNames[3])

	// Verify Season 3 has 2 sub-entries (Part 1, Part 2).
	rootFolder, err := svc.FindAnimeRootFolder(created.ID)
	require.NoError(t, err)
	require.NotNil(t, rootFolder)
	seasonChildren, err := te.dbClient.File().FindDirectChildDirectories(rootFolder.ID)
	require.NoError(t, err)

	var season3FileID uint
	for _, child := range seasonChildren {
		if child.EntryType == db.EntryTypeSeason && child.EntryNumber != nil && *child.EntryNumber == 3 {
			season3FileID = child.ID
			break
		}
	}
	require.NotZero(t, season3FileID, "Season 3 entry should exist")

	subEntries, err := te.dbClient.File().FindDirectChildDirectories(season3FileID)
	require.NoError(t, err)
	assert.Len(t, subEntries, 2, "expected 2 part sub-entries under Season 3")

	subNames := make(map[string]bool)
	for _, sub := range subEntries {
		subNames[sub.Name] = true
	}
	assert.True(t, subNames["Part 1"], "expected Part 1 sub-entry")
	assert.True(t, subNames["Part 2"], "expected Part 2 sub-entry")

	// Verify Season 1 and Season 2 have no sub-entries.
	for _, child := range seasonChildren {
		if child.EntryType != db.EntryTypeSeason || child.EntryNumber == nil {
			continue
		}
		if *child.EntryNumber == 1 || *child.EntryNumber == 2 {
			subs, err := te.dbClient.File().FindDirectChildDirectories(child.ID)
			require.NoError(t, err)
			assert.Len(t, subs, 0, "Season %d should have no sub-entries", *child.EntryNumber)
		}
	}
}

func TestLinkAniList(t *testing.T) {
	te := newTester(t)
	ctx := context.Background()

	mock := &mockAniListClient{}

	t.Run("sets AniListID on existing anime", func(t *testing.T) {
		svc := te.serviceWithAniList(mock)
		created, err := svc.Create(ctx, "LinkTest")
		require.NoError(t, err)

		err = svc.LinkAniList(ctx, created.ID, 42)
		require.NoError(t, err)

		row, err := te.dbClient.Anime().FindByValue(ctx, &db.Anime{ID: created.ID})
		require.NoError(t, err)
		require.NotNil(t, row.AniListID)
		assert.Equal(t, 42, *row.AniListID)
	})

	t.Run("nil client returns error", func(t *testing.T) {
		svc := te.service() // no anilist client
		err := svc.LinkAniList(ctx, 1, 42)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "anilist client is not configured")
	})

	t.Run("nonexistent anime returns error", func(t *testing.T) {
		svc := te.serviceWithAniList(mock)
		err := svc.LinkAniList(ctx, 99999, 42)
		require.Error(t, err)
		assert.ErrorIs(t, err, ErrAnimeNotFound)
	})
}

func TestDetailDisplayName(t *testing.T) {
	t.Run("prefers English title", func(t *testing.T) {
		d := &anilist.MediaDetail{
			Title: anilist.MediaTitle{
				English: "Attack on Titan",
				Romaji:  "Shingeki no Kyojin",
			},
		}
		assert.Equal(t, "Attack on Titan", detailDisplayName(d))
	})

	t.Run("falls back to Romaji when English is empty", func(t *testing.T) {
		d := &anilist.MediaDetail{
			Title: anilist.MediaTitle{
				English: "",
				Romaji:  "Shingeki no Kyojin",
			},
		}
		assert.Equal(t, "Shingeki no Kyojin", detailDisplayName(d))
	})
}

func TestRelationDisplayName(t *testing.T) {
	t.Run("prefers English title", func(t *testing.T) {
		r := anilist.MediaRelation{
			Title: anilist.MediaTitle{
				English: "The Movie",
				Romaji:  "Gekijouban",
			},
		}
		assert.Equal(t, "The Movie", relationDisplayName(r))
	})

	t.Run("falls back to Romaji when English is empty", func(t *testing.T) {
		r := anilist.MediaRelation{
			Title: anilist.MediaTitle{
				English: "",
				Romaji:  "Gekijouban",
			},
		}
		assert.Equal(t, "Gekijouban", relationDisplayName(r))
	})
}

func TestImportFromAniList_GetAnimeDetailError(t *testing.T) {
	te := newTester(t)
	ctx := context.Background()

	mock := &mockAniListClient{
		detailErr: fmt.Errorf("api timeout"),
	}
	svc := te.serviceWithAniList(mock)

	created, err := svc.Create(ctx, "DetailError")
	require.NoError(t, err)

	_, err = svc.ImportFromAniList(ctx, created.ID, 100)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "anilist.GetAnimeDetail(100)")
	assert.Contains(t, err.Error(), "api timeout")
}

func TestImportFromAniList_DetailReturnsNil(t *testing.T) {
	te := newTester(t)
	ctx := context.Background()

	// Return nil for the detail -- BFS skips it.
	mock := &mockAniListClient{
		detailResults: map[int]*anilist.MediaDetail{},
	}
	svc := te.serviceWithAniList(mock)

	created, err := svc.Create(ctx, "NilDetail")
	require.NoError(t, err)

	result, err := svc.ImportFromAniList(ctx, created.ID, 100)
	require.NoError(t, err)
	assert.Equal(t, 0, result.EntriesCreated)
	assert.Equal(t, 0, result.CharactersCreated)
}

func TestImportFromAniList_SkipsNonAnimeRelations(t *testing.T) {
	te := newTester(t)
	ctx := context.Background()

	// A season with a MANGA relation, MUSIC relation, and a SEQUEL OVA that is
	// not TV/ONA format. None of these should be followed by BFS.
	mock := &mockAniListClient{
		detailResults: map[int]*anilist.MediaDetail{
			100: {
				ID: 100,
				Title: anilist.MediaTitle{
					English: "Test Show",
				},
				Format:     "TV",
				Season:     "WINTER",
				SeasonYear: 2020,
				Relations: []anilist.MediaRelation{
					{
						RelationType: "SEQUEL",
						ID:           200,
						Type:         "MANGA",
						Format:       "MANGA",
					},
					{
						RelationType: "SEQUEL",
						ID:           300,
						Type:         "ANIME",
						Format:       "MUSIC",
					},
					{
						RelationType: "CHARACTER",
						ID:           400,
						Type:         "ANIME",
						Format:       "TV",
					},
				},
			},
		},
	}

	svc := te.serviceWithAniList(mock)
	created, err := svc.Create(ctx, "SkipRelations")
	require.NoError(t, err)

	result, err := svc.ImportFromAniList(ctx, created.ID, 100)
	require.NoError(t, err)

	// Only 1 season (the root), no sequel followed.
	assert.Equal(t, 1, result.EntriesCreated)
	assert.Equal(t, 1, mock.callCount, "BFS should only fetch the root entry")
}

func TestImportFromAniList_MovieWithParentRelation(t *testing.T) {
	te := newTester(t)
	ctx := context.Background()

	// A season with a PARENT relation that is a movie.
	mock := &mockAniListClient{
		detailResults: map[int]*anilist.MediaDetail{
			100: {
				ID: 100,
				Title: anilist.MediaTitle{
					English: "ParentMovieShow",
				},
				Format:     "TV",
				Season:     "FALL",
				SeasonYear: 2021,
				Relations: []anilist.MediaRelation{
					{
						RelationType: "PARENT",
						ID:           999,
						Title: anilist.MediaTitle{
							English: "The Parent Movie",
						},
						Type:       "ANIME",
						Format:     "MOVIE",
						SeasonYear: 2022,
					},
				},
			},
		},
	}

	svc := te.serviceWithAniList(mock)
	created, err := svc.Create(ctx, "ParentMovieTest")
	require.NoError(t, err)

	result, err := svc.ImportFromAniList(ctx, created.ID, 100)
	require.NoError(t, err)

	// 1 season + 1 movie = 2
	assert.Equal(t, 2, result.EntriesCreated)
}

func TestImportFromAniList_SkipsBackgroundCharacters(t *testing.T) {
	te := newTester(t)
	ctx := context.Background()

	mock := &mockAniListClient{
		detailResults: map[int]*anilist.MediaDetail{
			100: {
				ID: 100,
				Title: anilist.MediaTitle{
					English: "CharFilter",
				},
				Format:     "TV",
				Season:     "SPRING",
				SeasonYear: 2020,
				Characters: []anilist.Character{
					{ID: 1, Role: "MAIN", Name: struct {
						Full   string `json:"full"`
						Native string `json:"native"`
					}{Full: "Hero"}},
					{ID: 2, Role: "BACKGROUND", Name: struct {
						Full   string `json:"full"`
						Native string `json:"native"`
					}{Full: "Extra"}},
					{ID: 3, Role: "SUPPORTING", Name: struct {
						Full   string `json:"full"`
						Native string `json:"native"`
					}{Full: ""}}, // empty name, should be skipped
				},
			},
		},
	}

	svc := te.serviceWithAniList(mock)
	created, err := svc.Create(ctx, "CharFilterTest")
	require.NoError(t, err)

	result, err := svc.ImportFromAniList(ctx, created.ID, 100)
	require.NoError(t, err)

	// Only "Hero" should be created. "Extra" is BACKGROUND (skipped), empty name is skipped.
	assert.Equal(t, 1, result.CharactersCreated)
}

func TestImportFromAniList_FollowsONAFormat(t *testing.T) {
	te := newTester(t)
	ctx := context.Background()

	// BFS should follow ONA format relations (isSeasonFormat includes ONA).
	mock := &mockAniListClient{
		detailResults: map[int]*anilist.MediaDetail{
			100: {
				ID: 100,
				Title: anilist.MediaTitle{
					English: "ONA Show S1",
				},
				Format:     "ONA",
				Season:     "WINTER",
				SeasonYear: 2023,
				Relations: []anilist.MediaRelation{
					{
						RelationType: "SEQUEL",
						ID:           200,
						Type:         "ANIME",
						Format:       "ONA",
					},
				},
			},
			200: {
				ID: 200,
				Title: anilist.MediaTitle{
					English: "ONA Show S2",
				},
				Format:     "ONA",
				Season:     "SUMMER",
				SeasonYear: 2024,
				Relations: []anilist.MediaRelation{
					{
						RelationType: "PREQUEL",
						ID:           100,
						Type:         "ANIME",
						Format:       "ONA",
					},
				},
			},
		},
	}

	svc := te.serviceWithAniList(mock)
	created, err := svc.Create(ctx, "ONATest")
	require.NoError(t, err)

	result, err := svc.ImportFromAniList(ctx, created.ID, 100)
	require.NoError(t, err)

	// 2 seasons created from ONA entries.
	assert.Equal(t, 2, result.EntriesCreated)
	assert.Equal(t, 2, mock.callCount)
}

func TestImportFromAniList_MovieWithZeroYear(t *testing.T) {
	te := newTester(t)
	ctx := context.Background()

	// Movie relation with SeasonYear 0 -- year should be nil.
	mock := &mockAniListClient{
		detailResults: map[int]*anilist.MediaDetail{
			100: {
				ID: 100,
				Title: anilist.MediaTitle{
					English: "YearlessShow",
				},
				Format:     "TV",
				Season:     "FALL",
				SeasonYear: 2020,
				Relations: []anilist.MediaRelation{
					{
						RelationType: "SIDE_STORY",
						ID:           999,
						Title: anilist.MediaTitle{
							English: "Yearless Movie",
						},
						Type:       "ANIME",
						Format:     "MOVIE",
						SeasonYear: 0,
					},
				},
			},
		},
	}

	svc := te.serviceWithAniList(mock)
	created, err := svc.Create(ctx, "YearlessTest")
	require.NoError(t, err)

	result, err := svc.ImportFromAniList(ctx, created.ID, 100)
	require.NoError(t, err)

	// 1 season + 1 movie = 2
	assert.Equal(t, 2, result.EntriesCreated)

	// Verify the movie has nil year.
	entries, err := svc.GetAnimeEntries(created.ID)
	require.NoError(t, err)
	for _, e := range entries {
		if e.EntryType == db.EntryTypeMovie {
			assert.Nil(t, e.EntryNumber, "movie with zero year should have nil entry_number")
		}
	}
}

func TestImportFromAniList_BFSDeduplication(t *testing.T) {
	te := newTester(t)
	ctx := context.Background()

	// BFS dedup scenario: IDs 100 and 200 both have SEQUEL pointing to 300.
	// 100 is processed first, adding 200 and 300 to queue. Then 200 is processed,
	// adding 300 again (since 300 is not yet fetched). Queue becomes [300, 300].
	// The second 300 should be deduplicated by the fetched check.
	mock := &mockAniListClient{
		detailResults: map[int]*anilist.MediaDetail{
			100: {
				ID: 100,
				Title: anilist.MediaTitle{
					English: "Show S1",
				},
				Format:     "TV",
				Season:     "WINTER",
				SeasonYear: 2020,
				Relations: []anilist.MediaRelation{
					{
						RelationType: "SEQUEL",
						ID:           200,
						Type:         "ANIME",
						Format:       "TV",
					},
					{
						RelationType: "SEQUEL",
						ID:           300,
						Type:         "ANIME",
						Format:       "TV",
					},
				},
			},
			200: {
				ID: 200,
				Title: anilist.MediaTitle{
					English: "Show S2",
				},
				Format:     "TV",
				Season:     "SPRING",
				SeasonYear: 2021,
				Relations: []anilist.MediaRelation{
					{
						RelationType: "PREQUEL",
						ID:           100,
						Type:         "ANIME",
						Format:       "TV",
					},
					{
						RelationType: "SEQUEL",
						ID:           300,
						Type:         "ANIME",
						Format:       "TV",
					},
				},
			},
			300: {
				ID: 300,
				Title: anilist.MediaTitle{
					English: "Show S3",
				},
				Format:     "TV",
				Season:     "FALL",
				SeasonYear: 2022,
				Relations: []anilist.MediaRelation{
					{
						RelationType: "PREQUEL",
						ID:           200,
						Type:         "ANIME",
						Format:       "TV",
					},
				},
			},
		},
	}

	svc := te.serviceWithAniList(mock)
	created, err := svc.Create(ctx, "BFSDedupTest")
	require.NoError(t, err)

	result, err := svc.ImportFromAniList(ctx, created.ID, 100)
	require.NoError(t, err)

	assert.Equal(t, 3, result.EntriesCreated)
	// BFS should make exactly 3 calls, even though 300 was discovered twice.
	assert.Equal(t, 3, mock.callCount)
}

func TestImportFromAniList_SameYearSortsById(t *testing.T) {
	te := newTester(t)
	ctx := context.Background()

	// Two seasons in the same year -- should be sorted by AniList ID as tiebreaker.
	mock := &mockAniListClient{
		detailResults: map[int]*anilist.MediaDetail{
			300: {
				ID: 300,
				Title: anilist.MediaTitle{
					English: "Same Year S2",
				},
				Format:     "TV",
				Season:     "FALL",
				SeasonYear: 2023,
				Relations: []anilist.MediaRelation{
					{
						RelationType: "PREQUEL",
						ID:           100,
						Type:         "ANIME",
						Format:       "TV",
					},
				},
			},
			100: {
				ID: 100,
				Title: anilist.MediaTitle{
					English: "Same Year S1",
				},
				Format:     "TV",
				Season:     "WINTER",
				SeasonYear: 2023,
				Relations: []anilist.MediaRelation{
					{
						RelationType: "SEQUEL",
						ID:           300,
						Type:         "ANIME",
						Format:       "TV",
					},
				},
			},
		},
	}

	svc := te.serviceWithAniList(mock)
	created, err := svc.Create(ctx, "SameYearSort")
	require.NoError(t, err)

	result, err := svc.ImportFromAniList(ctx, created.ID, 100)
	require.NoError(t, err)

	assert.Equal(t, 2, result.EntriesCreated)

	// Verify season order: S1 (ID 100) should be Season 1, S2 (ID 300) should be Season 2
	entries, err := svc.GetAnimeEntries(created.ID)
	require.NoError(t, err)
	seasonNames := make(map[uint]string)
	for _, e := range entries {
		if e.EntryType == db.EntryTypeSeason && e.EntryNumber != nil {
			seasonNames[*e.EntryNumber] = e.Name
		}
	}
	assert.Equal(t, "Same Year S1", seasonNames[1])
	assert.Equal(t, "Same Year S2", seasonNames[2])
}

func TestImportFromAniList_DuplicateMovieDedup(t *testing.T) {
	te := newTester(t)
	ctx := context.Background()

	// Two seasons both reference the same movie. Movie should only be created once.
	mock := &mockAniListClient{
		detailResults: map[int]*anilist.MediaDetail{
			100: {
				ID: 100,
				Title: anilist.MediaTitle{
					English: "MovieDedup S1",
				},
				Format:     "TV",
				Season:     "SPRING",
				SeasonYear: 2020,
				Relations: []anilist.MediaRelation{
					{
						RelationType: "SEQUEL",
						ID:           200,
						Type:         "ANIME",
						Format:       "TV",
					},
					{
						RelationType: "SIDE_STORY",
						ID:           999,
						Title: anilist.MediaTitle{
							English: "The Movie",
						},
						Type:       "ANIME",
						Format:     "MOVIE",
						SeasonYear: 2021,
					},
				},
			},
			200: {
				ID: 200,
				Title: anilist.MediaTitle{
					English: "MovieDedup S2",
				},
				Format:     "TV",
				Season:     "FALL",
				SeasonYear: 2021,
				Relations: []anilist.MediaRelation{
					{
						RelationType: "PREQUEL",
						ID:           100,
						Type:         "ANIME",
						Format:       "TV",
					},
					{
						RelationType: "SIDE_STORY",
						ID:           999,
						Title: anilist.MediaTitle{
							English: "The Movie",
						},
						Type:       "ANIME",
						Format:     "MOVIE",
						SeasonYear: 2021,
					},
				},
			},
		},
	}

	svc := te.serviceWithAniList(mock)
	created, err := svc.Create(ctx, "MovieDedupTest")
	require.NoError(t, err)

	result, err := svc.ImportFromAniList(ctx, created.ID, 100)
	require.NoError(t, err)

	// 2 seasons + 1 movie (deduped) = 3
	assert.Equal(t, 3, result.EntriesCreated)

	entries, err := svc.GetAnimeEntries(created.ID)
	require.NoError(t, err)
	movieCount := 0
	for _, e := range entries {
		if e.EntryType == db.EntryTypeMovie {
			movieCount++
		}
	}
	assert.Equal(t, 1, movieCount, "duplicate movie should be deduped")
}

func TestImportFromAniList_NilClient(t *testing.T) {
	te := newTester(t)
	ctx := context.Background()

	svc := te.service() // nil anilist client

	created, err := svc.Create(ctx, "NilClientImport")
	require.NoError(t, err)

	_, err = svc.ImportFromAniList(ctx, created.ID, 100)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "anilist client is not configured")
}

func TestImportFromAniList_NonexistentAnime(t *testing.T) {
	te := newTester(t)
	ctx := context.Background()

	mock := &mockAniListClient{
		detailResults: map[int]*anilist.MediaDetail{
			100: {
				ID:     100,
				Title:  anilist.MediaTitle{Romaji: "Test"},
				Format: "TV",
			},
		},
	}
	svc := te.serviceWithAniList(mock)

	_, err := svc.ImportFromAniList(ctx, 99999, 100)
	require.Error(t, err)
	assert.ErrorIs(t, err, ErrAnimeNotFound)
}

func TestAnilistSeasonToDBSeason(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"WINTER", db.AiringSeasonWinter},
		{"SPRING", db.AiringSeasonSpring},
		{"SUMMER", db.AiringSeasonSummer},
		{"FALL", db.AiringSeasonFall},
		{"", ""},
		{"UNKNOWN", ""},
	}
	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			assert.Equal(t, tt.want, anilistSeasonToDBSeason(tt.input))
		})
	}
}

func TestImportFromAniList_RomajiOnlyTitles(t *testing.T) {
	te := newTester(t)
	ctx := context.Background()

	// Entries with only Romaji titles (no English) to cover the Romaji fallback
	// paths in detailDisplayName and relationDisplayName.
	mock := &mockAniListClient{
		detailResults: map[int]*anilist.MediaDetail{
			100: {
				ID: 100,
				Title: anilist.MediaTitle{
					Romaji: "Shingeki no Kyojin",
				},
				Format:     "TV",
				Season:     "SPRING",
				SeasonYear: 2013,
				Relations: []anilist.MediaRelation{
					{
						RelationType: "SIDE_STORY",
						ID:           999,
						Title: anilist.MediaTitle{
							Romaji: "Shingeki no Kyojin Movie",
						},
						Type:       "ANIME",
						Format:     "MOVIE",
						SeasonYear: 2015,
					},
				},
			},
		},
	}

	svc := te.serviceWithAniList(mock)
	created, err := svc.Create(ctx, "RomajiOnly")
	require.NoError(t, err)

	result, err := svc.ImportFromAniList(ctx, created.ID, 100)
	require.NoError(t, err)

	// 1 season + 1 movie = 2
	assert.Equal(t, 2, result.EntriesCreated)

	// Verify the season name uses Romaji.
	entries, err := svc.GetAnimeEntries(created.ID)
	require.NoError(t, err)
	for _, e := range entries {
		if e.EntryType == db.EntryTypeSeason {
			assert.Equal(t, "Shingeki no Kyojin", e.Name)
		}
		if e.EntryType == db.EntryTypeMovie {
			assert.Equal(t, "Shingeki no Kyojin Movie", e.Name)
		}
	}
}

func TestImportFromAniList_ReimportUpdatesExistingSubEntryAiringInfo(t *testing.T) {
	te := newTester(t)
	ctx := context.Background()

	// Multi-part group: "The Final Season" with Part 1, Part 2, Part 3.
	// First import creates everything. Second import (re-import) should update
	// airing info on existing sub-entries even though the parent season and
	// sub-entries already exist.
	mock := &mockAniListClient{
		detailResults: map[int]*anilist.MediaDetail{
			100: {
				ID: 100,
				Title: anilist.MediaTitle{
					Romaji:  "Shingeki no Kyojin: The Final Season",
					English: "The Final Season",
				},
				Format:     "TV",
				Season:     "WINTER",
				SeasonYear: 2021,
				Relations: []anilist.MediaRelation{
					{
						RelationType: "SEQUEL",
						ID:           200,
						Type:         "ANIME",
						Format:       "TV",
					},
					{
						RelationType: "SEQUEL",
						ID:           300,
						Type:         "ANIME",
						Format:       "TV",
					},
				},
			},
			200: {
				ID: 200,
				Title: anilist.MediaTitle{
					Romaji:  "Shingeki no Kyojin: The Final Season Part 2",
					English: "The Final Season Part 2",
				},
				Format:     "TV",
				Season:     "WINTER",
				SeasonYear: 2022,
				Relations: []anilist.MediaRelation{
					{
						RelationType: "PREQUEL",
						ID:           100,
						Type:         "ANIME",
						Format:       "TV",
					},
				},
			},
			300: {
				ID: 300,
				Title: anilist.MediaTitle{
					Romaji:  "Shingeki no Kyojin: The Final Season Part 3",
					English: "The Final Season Part 3",
				},
				Format:     "TV",
				Season:     "SPRING",
				SeasonYear: 2023,
				Relations: []anilist.MediaRelation{
					{
						RelationType: "PREQUEL",
						ID:           200,
						Type:         "ANIME",
						Format:       "TV",
					},
				},
			},
		},
	}

	svc := te.serviceWithAniList(mock)
	created, err := svc.Create(ctx, "AoT Reimport")
	require.NoError(t, err)

	// First import: creates season + 3 parts = 4 entries.
	result, err := svc.ImportFromAniList(ctx, created.ID, 100)
	require.NoError(t, err)
	assert.Equal(t, 4, result.EntriesCreated, "first import should create 4 entries")

	// Verify sub-entries have airing info after first import.
	rootFolder, err := svc.FindAnimeRootFolder(created.ID)
	require.NoError(t, err)
	seasonChildren, err := te.dbClient.File().FindDirectChildDirectories(rootFolder.ID)
	require.NoError(t, err)

	var seasonFileID uint
	for _, child := range seasonChildren {
		if child.EntryType == db.EntryTypeSeason {
			seasonFileID = child.ID
			break
		}
	}
	require.NotZero(t, seasonFileID)

	subEntries, err := te.dbClient.File().FindDirectChildDirectories(seasonFileID)
	require.NoError(t, err)
	require.Len(t, subEntries, 3, "expected 3 sub-entries after first import")

	// Verify initial airing info is set.
	for _, sub := range subEntries {
		switch sub.Name {
		case "Part 1":
			assert.Equal(t, db.AiringSeasonWinter, sub.AiringSeason)
			require.NotNil(t, sub.AiringYear)
			assert.Equal(t, uint(2021), *sub.AiringYear)
		case "Part 2":
			assert.Equal(t, db.AiringSeasonWinter, sub.AiringSeason)
			require.NotNil(t, sub.AiringYear)
			assert.Equal(t, uint(2022), *sub.AiringYear)
		case "Part 3":
			assert.Equal(t, db.AiringSeasonSpring, sub.AiringSeason)
			require.NotNil(t, sub.AiringYear)
			assert.Equal(t, uint(2023), *sub.AiringYear)
		}
	}

	// Now update the mock to have different airing info (simulating AniList
	// data correction or new info becoming available).
	mock.detailResults[100].Season = "FALL"
	mock.detailResults[100].SeasonYear = 2020
	mock.detailResults[200].Season = "SUMMER"
	mock.detailResults[200].SeasonYear = 2021
	mock.detailResults[300].Season = "FALL"
	mock.detailResults[300].SeasonYear = 2023

	// Second import (re-import): nothing new created, but airing info updated.
	result2, err := svc.ImportFromAniList(ctx, created.ID, 100)
	require.NoError(t, err)
	assert.Equal(t, 0, result2.EntriesCreated, "re-import should not create new entries")

	// Verify sub-entries now have the updated airing info.
	subEntries2, err := te.dbClient.File().FindDirectChildDirectories(seasonFileID)
	require.NoError(t, err)
	require.Len(t, subEntries2, 3, "should still have 3 sub-entries")

	subAiring := make(map[string]db.File)
	for _, sub := range subEntries2 {
		subAiring[sub.Name] = sub
	}

	// Part 1: FALL 2020 (was WINTER 2021)
	p1 := subAiring["Part 1"]
	assert.Equal(t, db.AiringSeasonFall, p1.AiringSeason, "Part 1 should have updated FALL season")
	require.NotNil(t, p1.AiringYear, "Part 1 should have airing year set")
	assert.Equal(t, uint(2020), *p1.AiringYear, "Part 1 should have updated year 2020")

	// Part 2: SUMMER 2021 (was WINTER 2022)
	p2 := subAiring["Part 2"]
	assert.Equal(t, db.AiringSeasonSummer, p2.AiringSeason, "Part 2 should have updated SUMMER season")
	require.NotNil(t, p2.AiringYear, "Part 2 should have airing year set")
	assert.Equal(t, uint(2021), *p2.AiringYear, "Part 2 should have updated year 2021")

	// Part 3: FALL 2023 (was SPRING 2023)
	p3 := subAiring["Part 3"]
	assert.Equal(t, db.AiringSeasonFall, p3.AiringSeason, "Part 3 should have updated FALL season")
	require.NotNil(t, p3.AiringYear, "Part 3 should have airing year set")
	assert.Equal(t, uint(2023), *p3.AiringYear, "Part 3 should have year 2023")

	// Also verify the parent season entry got updated airing info.
	// The parent uses the first part's info (Part 1 = FALL 2020).
	seasonChildren2, err := te.dbClient.File().FindDirectChildDirectories(rootFolder.ID)
	require.NoError(t, err)
	for _, child := range seasonChildren2 {
		if child.EntryType == db.EntryTypeSeason && child.ID == seasonFileID {
			assert.Equal(t, db.AiringSeasonFall, child.AiringSeason, "parent season should have updated FALL season")
			require.NotNil(t, child.AiringYear, "parent season should have airing year set")
			assert.Equal(t, uint(2020), *child.AiringYear, "parent season should have updated year 2020")
			break
		}
	}
}
