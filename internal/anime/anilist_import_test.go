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
