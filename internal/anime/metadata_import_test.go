package anime

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"github.com/michael-freling/anime-image-viewer/internal/animemetadata"
	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// mockMetadataClient implements animemetadata.Client for testing.
type mockMetadataClient struct {
	searchResults  []animemetadata.SearchResult
	searchErr      error
	series         map[string]*animemetadata.Series
	seriesErr      error
	getSeriesCalls int
}

func (m *mockMetadataClient) Search(_ context.Context, _ string, _ int) ([]animemetadata.SearchResult, error) {
	return m.searchResults, m.searchErr
}

func (m *mockMetadataClient) GetSeries(_ context.Context, id string) (*animemetadata.Series, error) {
	m.getSeriesCalls++
	if m.seriesErr != nil {
		return nil, m.seriesErr
	}
	series, ok := m.series[id]
	if !ok {
		return nil, fmt.Errorf("%w: series %q", animemetadata.ErrNotFound, id)
	}
	return series, nil
}

func intPtr(v int) *int { return &v }

// seasonNames flattens the season tree into "name" / "name/child" strings so
// assertions read like the folder layout they describe.
func seasonNames(seasons []AnimeSeason) []string {
	var names []string
	for _, season := range seasons {
		names = append(names, season.Name)
		for _, child := range season.Children {
			names = append(names, season.Name+"/"+child.Name)
		}
	}
	return names
}

// makeUnwritable makes dir read-only for the rest of the test, so that
// creating a folder inside it fails. Permissions do not constrain root, so the
// test is skipped there.
func makeUnwritable(t *testing.T, dir string) {
	t.Helper()
	if os.Geteuid() == 0 {
		t.Skip("file permissions do not apply to root")
	}
	info, err := os.Stat(dir)
	require.NoError(t, err)
	require.NoError(t, os.Chmod(dir, 0o555))
	t.Cleanup(func() { _ = os.Chmod(dir, info.Mode()) })
}

// metadataIDsByPath maps each imported folder ("name", or "parent/child" for a
// part) to the upstream entry id recorded on it.
func metadataIDsByPath(t *testing.T, te tester, service *Service, animeID uint) map[string]string {
	t.Helper()
	root, err := service.FindAnimeRootFolder(animeID)
	require.NoError(t, err)
	require.NotNil(t, root)

	out := make(map[string]string)
	children, err := te.dbClient.Client.File().FindDirectChildDirectories(root.ID)
	require.NoError(t, err)
	for _, child := range children {
		if child.MetadataEntryID != nil {
			out[child.Name] = *child.MetadataEntryID
		}
		grandchildren, err := te.dbClient.Client.File().FindDirectChildDirectories(child.ID)
		require.NoError(t, err)
		for _, grandchild := range grandchildren {
			if grandchild.MetadataEntryID != nil {
				out[child.Name+"/"+grandchild.Name] = *grandchild.MetadataEntryID
			}
		}
	}
	return out
}

// assertFolderOnDisk checks that a rename moved the directory, not just the row.
func assertFolderOnDisk(t *testing.T, te tester, animeName, folderName string) {
	t.Helper()
	path := filepath.Join(te.config.ImageRootDirectory, sanitizeFolderName(animeName), sanitizeFolderName(folderName))
	info, err := os.Stat(path)
	require.NoError(t, err, "expected a folder on disk at %s", path)
	assert.True(t, info.IsDir())
}

func findSeason(t *testing.T, seasons []AnimeSeason, name string) AnimeSeason {
	t.Helper()
	for _, season := range seasons {
		if season.Name == name {
			return season
		}
	}
	t.Fatalf("season %q not found in %v", name, seasonNames(seasons))
	return AnimeSeason{}
}

func TestService_SearchMetadata(t *testing.T) {
	te := newTester(t)
	ctx := context.Background()

	t.Run("returns only series entries", func(t *testing.T) {
		mock := &mockMetadataClient{
			searchResults: []animemetadata.SearchResult{
				{Kind: animemetadata.EntryKindFranchise, ID: "fate", Title: "Fate"},
				{Kind: animemetadata.EntryKindSeries, ID: "fate-zero", Title: "Fate/Zero", FranchiseID: "fate"},
				{Kind: animemetadata.EntryKindSeries, ID: "fate-stay-night", Title: "Fate/stay night", FranchiseID: "fate"},
			},
		}

		results, err := te.serviceWithMetadata(mock).SearchMetadata(ctx, "fate")
		require.NoError(t, err)

		require.Len(t, results, 2)
		assert.Equal(t, "fate-zero", results[0].ID)
		assert.Equal(t, "fate-stay-night", results[1].ID)
	})

	t.Run("returns an empty slice when only franchises match", func(t *testing.T) {
		mock := &mockMetadataClient{
			searchResults: []animemetadata.SearchResult{
				{Kind: animemetadata.EntryKindFranchise, ID: "fate", Title: "Fate"},
			},
		}

		results, err := te.serviceWithMetadata(mock).SearchMetadata(ctx, "fate")
		require.NoError(t, err)
		assert.Empty(t, results)
	})

	t.Run("propagates the client error", func(t *testing.T) {
		mock := &mockMetadataClient{searchErr: errors.New("network down")}

		_, err := te.serviceWithMetadata(mock).SearchMetadata(ctx, "fate")
		require.Error(t, err)
		assert.Contains(t, err.Error(), "network down")
	})

	t.Run("without a client returns an error", func(t *testing.T) {
		_, err := te.service().SearchMetadata(ctx, "fate")
		require.Error(t, err)
		assert.Contains(t, err.Error(), "anime metadata client is not configured")
	})
}

func TestGroupSeasons(t *testing.T) {
	testCases := []struct {
		name       string
		seasons    []animemetadata.Season
		wantTitles []string
		wantParts  [][]int
	}{
		{
			name: "a split cour becomes one group with two parts",
			seasons: []animemetadata.Season{
				{ID: "fate-zero-s1", Number: 1, Part: intPtr(1)},
				{ID: "fate-zero-s2", Number: 1, Part: intPtr(2)},
			},
			wantTitles: []string{"Season 1"},
			wantParts:  [][]int{{1, 2}},
		},
		{
			name: "distinct season numbers stay separate",
			seasons: []animemetadata.Season{
				{ID: "s1", Number: 1},
				{ID: "s2", Number: 2, Title: "Mugen Train Arc"},
			},
			wantTitles: []string{"Season 1", "Mugen Train Arc"},
			wantParts:  [][]int{{0}, {0}},
		},
		{
			name: "groups are ordered by season number regardless of input order",
			seasons: []animemetadata.Season{
				{ID: "s3", Number: 3},
				{ID: "s1", Number: 1},
				{ID: "s2", Number: 2},
			},
			wantTitles: []string{"Season 1", "Season 2", "Season 3"},
			wantParts:  [][]int{{0}, {0}, {0}},
		},
		{
			name: "parts are ordered by part number regardless of input order",
			seasons: []animemetadata.Season{
				{ID: "b", Number: 1, Part: intPtr(2)},
				{ID: "a", Number: 1, Part: intPtr(1)},
			},
			wantTitles: []string{"Season 1"},
			wantParts:  [][]int{{1, 2}},
		},
		{
			name: "the first non-empty part title names the group",
			seasons: []animemetadata.Season{
				{ID: "a", Number: 2, Part: intPtr(1)},
				{ID: "b", Number: 2, Part: intPtr(2), Title: "Entertainment District Arc"},
			},
			wantTitles: []string{"Entertainment District Arc"},
			wantParts:  [][]int{{1, 2}},
		},
		{
			name:       "no seasons yields no groups",
			seasons:    nil,
			wantTitles: []string{},
			wantParts:  [][]int{},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			groups := groupSeasons(tc.seasons)

			require.Len(t, groups, len(tc.wantTitles))
			for i, group := range groups {
				assert.Equal(t, tc.wantTitles[i], group.title)
				parts := make([]int, len(group.parts))
				for j, part := range group.parts {
					parts[j] = partNumber(part)
				}
				assert.Equal(t, tc.wantParts[i], parts)
			}
		})
	}
}

func TestReleaseSeasonToDBSeason(t *testing.T) {
	testCases := []struct {
		in   string
		want string
	}{
		{animemetadata.ReleaseSeasonWinter, db.AiringSeasonWinter},
		{animemetadata.ReleaseSeasonSpring, db.AiringSeasonSpring},
		{animemetadata.ReleaseSeasonSummer, db.AiringSeasonSummer},
		{animemetadata.ReleaseSeasonFall, db.AiringSeasonFall},
		{animemetadata.ReleaseSeasonUnspecified, ""},
		{"", ""},
		{"NONSENSE", ""},
	}

	for _, tc := range testCases {
		t.Run(tc.in, func(t *testing.T) {
			assert.Equal(t, tc.want, releaseSeasonToDBSeason(tc.in))
		})
	}
}

func TestSeriesAniListID(t *testing.T) {
	testCases := []struct {
		name   string
		series animemetadata.Series
		want   int
	}{
		{
			name: "prefers the first season",
			series: animemetadata.Series{
				Seasons: []animemetadata.Season{
					{ExternalIDs: animemetadata.ExternalIDs{AniListID: 10087}},
					{ExternalIDs: animemetadata.ExternalIDs{AniListID: 11741}},
				},
				Movies: []animemetadata.Movie{{ExternalIDs: animemetadata.ExternalIDs{AniListID: 20791}}},
			},
			want: 10087,
		},
		{
			name: "skips seasons without an AniList id",
			series: animemetadata.Series{
				Seasons: []animemetadata.Season{
					{},
					{ExternalIDs: animemetadata.ExternalIDs{AniListID: 11741}},
				},
			},
			want: 11741,
		},
		{
			name: "falls back to a movie",
			series: animemetadata.Series{
				Movies: []animemetadata.Movie{{ExternalIDs: animemetadata.ExternalIDs{AniListID: 20791}}},
			},
			want: 20791,
		},
		{
			name: "falls back to a special",
			series: animemetadata.Series{
				Specials: []animemetadata.Special{{ExternalIDs: animemetadata.ExternalIDs{AniListID: 33333}}},
			},
			want: 33333,
		},
		{
			name:   "returns zero when nothing carries one",
			series: animemetadata.Series{Seasons: []animemetadata.Season{{}}},
			want:   0,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, seriesAniListID(&tc.series))
		})
	}
}

func TestService_ImportFromMetadata(t *testing.T) {
	ctx := context.Background()

	t.Run("imports seasons, parts, movies, specials and cast in one call", func(t *testing.T) {
		te := newTester(t)
		mock := &mockMetadataClient{
			series: map[string]*animemetadata.Series{
				"demon-slayer": {
					ID:    "demon-slayer",
					Title: "Demon Slayer",
					Seasons: []animemetadata.Season{
						{
							ID: "demon-slayer-s1", Number: 1,
							ReleaseYear: 2019, ReleaseSeason: animemetadata.ReleaseSeasonSpring,
							ExternalIDs: animemetadata.ExternalIDs{AniListID: 101922},
						},
						{
							ID: "demon-slayer-s2a", Number: 2, Part: intPtr(1), Title: "Mugen Train Arc",
							ReleaseYear: 2021, ReleaseSeason: animemetadata.ReleaseSeasonFall,
						},
						{
							ID: "demon-slayer-s2b", Number: 2, Part: intPtr(2),
							ReleaseYear: 2022, ReleaseSeason: animemetadata.ReleaseSeasonWinter,
						},
					},
					Movies: []animemetadata.Movie{
						{ID: "mugen-train-film", Title: "Mugen Train", ReleaseYear: 2020},
					},
					Specials: []animemetadata.Special{
						{ID: "ova", Title: "Sibling's Bond", Format: animemetadata.SpecialFormatOVA, ReleaseYear: 2019},
					},
					Characters: []animemetadata.Character{
						{ID: "tanjiro-kamado", Name: "Tanjirō Kamado"},
						{ID: "nezuko-kamado", Name: "Nezuko Kamado"},
					},
				},
			},
		}
		service := te.serviceWithMetadata(mock)

		anime, err := service.Create(ctx, "Demon Slayer")
		require.NoError(t, err)

		result, err := service.ImportFromMetadata(ctx, anime.ID, "demon-slayer")
		require.NoError(t, err)

		// 2 seasons + 2 parts + 1 movie + 1 special
		assert.Equal(t, 6, result.SeasonsCreated)
		assert.Equal(t, 2, result.CharactersCreated)
		assert.Equal(t, 1, mock.getSeriesCalls, "a series resolves in a single call")

		seasons, err := service.GetAnimeSeasons(anime.ID)
		require.NoError(t, err)
		assert.ElementsMatch(t, []string{
			"Season 1",
			"Mugen Train Arc", "Mugen Train Arc/Part 1", "Mugen Train Arc/Part 2",
			"Mugen Train", "Sibling's Bond",
		}, seasonNames(seasons))

		season1 := findSeason(t, seasons, "Season 1")
		assert.Equal(t, db.SeasonTypeSeason, season1.SeasonType)
		require.NotNil(t, season1.SeasonNumber)
		assert.Equal(t, uint(1), *season1.SeasonNumber)
		assert.Equal(t, db.AiringSeasonSpring, season1.AiringSeason)
		require.NotNil(t, season1.AiringYear)
		assert.Equal(t, uint(2019), *season1.AiringYear)

		// A split cour keeps the group's airing info from its first part and
		// gives each part its own.
		season2 := findSeason(t, seasons, "Mugen Train Arc")
		require.Len(t, season2.Children, 2)
		assert.Equal(t, db.AiringSeasonFall, season2.AiringSeason)
		assert.Equal(t, db.AiringSeasonFall, season2.Children[0].AiringSeason)
		assert.Equal(t, db.AiringSeasonWinter, season2.Children[1].AiringSeason)

		// A movie stores its release year in the season number slot.
		movie := findSeason(t, seasons, "Mugen Train")
		assert.Equal(t, db.SeasonTypeMovie, movie.SeasonType)
		require.NotNil(t, movie.SeasonNumber)
		assert.Equal(t, uint(2020), *movie.SeasonNumber)

		// A special has no number.
		special := findSeason(t, seasons, "Sibling's Bond")
		assert.Equal(t, db.SeasonTypeOther, special.SeasonType)
		assert.Nil(t, special.SeasonNumber)

		characters, err := te.dbClient.Client.Character().FindByAnimeID(anime.ID)
		require.NoError(t, err)
		require.Len(t, characters, 2)
	})

	t.Run("links the series id and backfills the AniList id", func(t *testing.T) {
		te := newTester(t)
		mock := &mockMetadataClient{
			series: map[string]*animemetadata.Series{
				"fate-zero": {
					ID: "fate-zero",
					Seasons: []animemetadata.Season{
						{ID: "fate-zero-s1", Number: 1, ExternalIDs: animemetadata.ExternalIDs{AniListID: 10087}},
					},
				},
			},
		}
		service := te.serviceWithMetadata(mock)

		anime, err := service.Create(ctx, "Fate Zero")
		require.NoError(t, err)

		_, err = service.ImportFromMetadata(ctx, anime.ID, "fate-zero")
		require.NoError(t, err)

		row, err := te.dbClient.Client.Anime().FindByValue(ctx, &db.Anime{ID: anime.ID})
		require.NoError(t, err)
		require.NotNil(t, row.MetadataSeriesID)
		assert.Equal(t, "fate-zero", *row.MetadataSeriesID)
		require.NotNil(t, row.AniListID)
		assert.Equal(t, 10087, *row.AniListID)
	})

	t.Run("leaves the AniList id unset when the dataset has none", func(t *testing.T) {
		te := newTester(t)
		mock := &mockMetadataClient{
			series: map[string]*animemetadata.Series{
				"obscure": {ID: "obscure", Seasons: []animemetadata.Season{{ID: "obscure-s1", Number: 1}}},
			},
		}
		service := te.serviceWithMetadata(mock)

		anime, err := service.Create(ctx, "Obscure")
		require.NoError(t, err)

		_, err = service.ImportFromMetadata(ctx, anime.ID, "obscure")
		require.NoError(t, err)

		row, err := te.dbClient.Client.Anime().FindByValue(ctx, &db.Anime{ID: anime.ID})
		require.NoError(t, err)
		require.NotNil(t, row.MetadataSeriesID)
		assert.Nil(t, row.AniListID)
	})

	t.Run("is idempotent: a re-import creates nothing new", func(t *testing.T) {
		te := newTester(t)
		mock := &mockMetadataClient{
			series: map[string]*animemetadata.Series{
				"fate-zero": {
					ID: "fate-zero",
					Seasons: []animemetadata.Season{
						{ID: "a", Number: 1, Part: intPtr(1), ReleaseYear: 2011, ReleaseSeason: animemetadata.ReleaseSeasonFall},
						{ID: "b", Number: 1, Part: intPtr(2), ReleaseYear: 2012, ReleaseSeason: animemetadata.ReleaseSeasonSpring},
					},
					Movies:     []animemetadata.Movie{{ID: "m", Title: "A Film", ReleaseYear: 2013}},
					Specials:   []animemetadata.Special{{ID: "o", Title: "An OVA", ReleaseYear: 2014}},
					Characters: []animemetadata.Character{{ID: "saber", Name: "Saber"}},
				},
			},
		}
		service := te.serviceWithMetadata(mock)

		anime, err := service.Create(ctx, "Fate Zero Repeat")
		require.NoError(t, err)

		first, err := service.ImportFromMetadata(ctx, anime.ID, "fate-zero")
		require.NoError(t, err)
		assert.Equal(t, 5, first.SeasonsCreated) // season + 2 parts + movie + special
		assert.Equal(t, 1, first.CharactersCreated)

		second, err := service.ImportFromMetadata(ctx, anime.ID, "fate-zero")
		require.NoError(t, err)
		assert.Equal(t, 0, second.SeasonsCreated)
		assert.Equal(t, 0, second.CharactersCreated)

		seasons, err := service.GetAnimeSeasons(anime.ID)
		require.NoError(t, err)
		assert.ElementsMatch(t, []string{
			"Season 1", "Season 1/Part 1", "Season 1/Part 2", "A Film", "An OVA",
		}, seasonNames(seasons))
	})

	t.Run("backfills a legacy folder instead of duplicating it", func(t *testing.T) {
		te := newTester(t)
		mock := &mockMetadataClient{
			series: map[string]*animemetadata.Series{
				"legacy": {
					ID: "legacy",
					Seasons: []animemetadata.Season{
						{ID: "s1", Number: 1, Title: "Original Run", ReleaseYear: 2020, ReleaseSeason: animemetadata.ReleaseSeasonSummer},
					},
				},
			},
		}
		service := te.serviceWithMetadata(mock)

		anime, err := service.Create(ctx, "Legacy Show")
		require.NoError(t, err)

		// A folder created before entry_type metadata existed.
		legacy, err := service.CreateSeason(ctx, anime.ID, db.SeasonTypeOther, nil, "Original Run")
		require.NoError(t, err)

		result, err := service.ImportFromMetadata(ctx, anime.ID, "legacy")
		require.NoError(t, err)
		assert.Equal(t, 0, result.SeasonsCreated, "the existing folder is reused")

		seasons, err := service.GetAnimeSeasons(anime.ID)
		require.NoError(t, err)
		require.Len(t, seasons, 1)
		assert.Equal(t, legacy.ID, seasons[0].ID)
		assert.Equal(t, db.SeasonTypeSeason, seasons[0].SeasonType)
		require.NotNil(t, seasons[0].SeasonNumber)
		assert.Equal(t, uint(1), *seasons[0].SeasonNumber)
		assert.Equal(t, db.AiringSeasonSummer, seasons[0].AiringSeason)
	})

	t.Run("skips characters the anime already has", func(t *testing.T) {
		te := newTester(t)
		mock := &mockMetadataClient{
			series: map[string]*animemetadata.Series{
				"cast": {
					ID: "cast",
					Characters: []animemetadata.Character{
						{ID: "saber", Name: "Saber"},
						{ID: "rin", Name: "Rin Tohsaka"},
					},
				},
			},
		}
		service := te.serviceWithMetadata(mock)

		anime, err := service.Create(ctx, "Cast Show")
		require.NoError(t, err)
		require.NoError(t, te.dbClient.Client.Character().Create(ctx, &db.Character{Name: "Saber", AnimeID: anime.ID}))

		result, err := service.ImportFromMetadata(ctx, anime.ID, "cast")
		require.NoError(t, err)
		assert.Equal(t, 1, result.CharactersCreated)

		characters, err := te.dbClient.Client.Character().FindByAnimeID(anime.ID)
		require.NoError(t, err)
		assert.Len(t, characters, 2)
	})

	t.Run("skips cast entries the dataset has no name for", func(t *testing.T) {
		te := newTester(t)
		mock := &mockMetadataClient{
			series: map[string]*animemetadata.Series{
				"unnamed": {
					ID: "unnamed",
					Characters: []animemetadata.Character{
						{ID: "named", Name: "Named"},
						{ID: "unnamed-yet"},
						{ID: "blank", Name: "   "},
					},
				},
			},
		}
		service := te.serviceWithMetadata(mock)

		anime, err := service.Create(ctx, "Unnamed Cast")
		require.NoError(t, err)

		result, err := service.ImportFromMetadata(ctx, anime.ID, "unnamed")
		require.NoError(t, err)
		assert.Equal(t, 1, result.CharactersCreated)
	})

	t.Run("skips movies and specials without a title", func(t *testing.T) {
		te := newTester(t)
		mock := &mockMetadataClient{
			series: map[string]*animemetadata.Series{
				"untitled": {
					ID:       "untitled",
					Movies:   []animemetadata.Movie{{ID: "m"}, {ID: "m2", Title: "Real Film"}},
					Specials: []animemetadata.Special{{ID: "o"}},
				},
			},
		}
		service := te.serviceWithMetadata(mock)

		anime, err := service.Create(ctx, "Untitled Entries")
		require.NoError(t, err)

		result, err := service.ImportFromMetadata(ctx, anime.ID, "untitled")
		require.NoError(t, err)
		assert.Equal(t, 1, result.SeasonsCreated)

		seasons, err := service.GetAnimeSeasons(anime.ID)
		require.NoError(t, err)
		assert.Equal(t, []string{"Real Film"}, seasonNames(seasons))
	})

	t.Run("sanitizes titles that are invalid as folder names", func(t *testing.T) {
		te := newTester(t)
		mock := &mockMetadataClient{
			series: map[string]*animemetadata.Series{
				"fate": {
					ID: "fate",
					Seasons: []animemetadata.Season{
						{ID: "s1", Number: 1, Title: "Fate/stay night"},
					},
				},
			},
		}
		service := te.serviceWithMetadata(mock)

		anime, err := service.Create(ctx, "Fate Series")
		require.NoError(t, err)

		_, err = service.ImportFromMetadata(ctx, anime.ID, "fate")
		require.NoError(t, err)

		seasons, err := service.GetAnimeSeasons(anime.ID)
		require.NoError(t, err)
		require.Len(t, seasons, 1)
		assert.Equal(t, "Fate-stay night", seasons[0].Name)
	})

	t.Run("ignores a movie year outside the accepted range", func(t *testing.T) {
		te := newTester(t)
		mock := &mockMetadataClient{
			series: map[string]*animemetadata.Series{
				"future": {
					ID:     "future",
					Movies: []animemetadata.Movie{{ID: "m", Title: "Far Future Film", ReleaseYear: 3000}},
				},
			},
		}
		service := te.serviceWithMetadata(mock)

		anime, err := service.Create(ctx, "Future Film")
		require.NoError(t, err)

		result, err := service.ImportFromMetadata(ctx, anime.ID, "future")
		require.NoError(t, err)
		assert.Equal(t, 1, result.SeasonsCreated)

		seasons, err := service.GetAnimeSeasons(anime.ID)
		require.NoError(t, err)
		require.Len(t, seasons, 1)
		assert.Nil(t, seasons[0].SeasonNumber)
	})

	t.Run("skips seasons without a positive number", func(t *testing.T) {
		te := newTester(t)
		mock := &mockMetadataClient{
			series: map[string]*animemetadata.Series{
				"unnumbered": {
					ID: "unnumbered",
					Seasons: []animemetadata.Season{
						{ID: "s0", Number: 0},
						{ID: "s1", Number: 1},
					},
				},
			},
		}
		service := te.serviceWithMetadata(mock)

		anime, err := service.Create(ctx, "Unnumbered")
		require.NoError(t, err)

		result, err := service.ImportFromMetadata(ctx, anime.ID, "unnumbered")
		require.NoError(t, err)
		assert.Equal(t, 1, result.SeasonsCreated)

		seasons, err := service.GetAnimeSeasons(anime.ID)
		require.NoError(t, err)
		assert.Equal(t, []string{"Season 1"}, seasonNames(seasons))
	})

	t.Run("two titles that sanitize to the same folder name collapse into one", func(t *testing.T) {
		te := newTester(t)
		// ":" is not valid in a folder name and is replaced with "-", so both
		// titles resolve to "Film- One". The first movie claims the folder and
		// is linked to it; the second cannot have its own, and is skipped
		// rather than overwriting the first entry's data.
		mock := &mockMetadataClient{
			series: map[string]*animemetadata.Series{
				"collide": {
					ID: "collide",
					Movies: []animemetadata.Movie{
						{ID: "m1", Title: "Film: One", ReleaseYear: 2001},
						{ID: "m2", Title: "Film- One", ReleaseYear: 2002},
					},
				},
			},
		}
		service := te.serviceWithMetadata(mock)

		anime, err := service.Create(ctx, "Colliding Films")
		require.NoError(t, err)

		result, err := service.ImportFromMetadata(ctx, anime.ID, "collide")
		require.NoError(t, err)
		assert.Equal(t, 1, result.SeasonsCreated)

		seasons, err := service.GetAnimeSeasons(anime.ID)
		require.NoError(t, err)
		require.Len(t, seasons, 1)
		assert.Equal(t, "Film- One", seasons[0].Name)
		// The folder belongs to the first movie, so its year is kept.
		require.NotNil(t, seasons[0].AiringYear)
		assert.Equal(t, uint(2001), *seasons[0].AiringYear)
	})

	t.Run("skips a season whose folder name collides with an earlier one", func(t *testing.T) {
		te := newTester(t)
		// Both season titles sanitize to "Arc- One", so the second season
		// cannot get its own folder and is skipped rather than failing.
		mock := &mockMetadataClient{
			series: map[string]*animemetadata.Series{
				"collide-seasons": {
					ID: "collide-seasons",
					Seasons: []animemetadata.Season{
						{ID: "s1", Number: 1, Title: "Arc: One"},
						{ID: "s2", Number: 2, Title: "Arc- One"},
					},
				},
			},
		}
		service := te.serviceWithMetadata(mock)

		anime, err := service.Create(ctx, "Colliding Seasons")
		require.NoError(t, err)

		result, err := service.ImportFromMetadata(ctx, anime.ID, "collide-seasons")
		require.NoError(t, err)
		assert.Equal(t, 1, result.SeasonsCreated)

		seasons, err := service.GetAnimeSeasons(anime.ID)
		require.NoError(t, err)
		require.Len(t, seasons, 1)
		assert.Equal(t, "Arc- One", seasons[0].Name)
		require.NotNil(t, seasons[0].SeasonNumber)
		assert.Equal(t, uint(1), *seasons[0].SeasonNumber)
	})

	t.Run("re-types an existing folder when the entry kind changed", func(t *testing.T) {
		te := newTester(t)
		mock := &mockMetadataClient{
			series: map[string]*animemetadata.Series{
				"retype": {
					ID:     "retype",
					Movies: []animemetadata.Movie{{ID: "m", Title: "A Film", ReleaseYear: 2015}},
				},
			},
		}
		service := te.serviceWithMetadata(mock)

		anime, err := service.Create(ctx, "Retype Show")
		require.NoError(t, err)

		// The folder exists, but was filed as "other" rather than a movie.
		existing, err := service.CreateSeason(ctx, anime.ID, db.SeasonTypeOther, nil, "A Film")
		require.NoError(t, err)

		result, err := service.ImportFromMetadata(ctx, anime.ID, "retype")
		require.NoError(t, err)
		assert.Equal(t, 0, result.SeasonsCreated)

		seasons, err := service.GetAnimeSeasons(anime.ID)
		require.NoError(t, err)
		require.Len(t, seasons, 1)
		assert.Equal(t, existing.ID, seasons[0].ID)
		assert.Equal(t, db.SeasonTypeMovie, seasons[0].SeasonType)
		require.NotNil(t, seasons[0].SeasonNumber)
		assert.Equal(t, uint(2015), *seasons[0].SeasonNumber)
	})

	t.Run("numbers an untagged cour by its position among tagged ones", func(t *testing.T) {
		te := newTester(t)
		// The dataset can carry a split season where only some entries have an
		// explicit part. The untagged one takes the slot it sorts into.
		mock := &mockMetadataClient{
			series: map[string]*animemetadata.Series{
				"partial-parts": {
					ID: "partial-parts",
					Seasons: []animemetadata.Season{
						{ID: "a", Number: 1, Title: "Split Season"},
						{ID: "b", Number: 1, Part: intPtr(2)},
					},
				},
			},
		}
		service := te.serviceWithMetadata(mock)

		anime, err := service.Create(ctx, "Partial Parts")
		require.NoError(t, err)

		result, err := service.ImportFromMetadata(ctx, anime.ID, "partial-parts")
		require.NoError(t, err)
		assert.Equal(t, 3, result.SeasonsCreated)

		seasons, err := service.GetAnimeSeasons(anime.ID)
		require.NoError(t, err)
		assert.Equal(t, []string{
			"Split Season", "Split Season/Part 1", "Split Season/Part 2",
		}, seasonNames(seasons))
	})

	t.Run("surfaces a season folder that cannot be created on disk", func(t *testing.T) {
		te := newTester(t)
		mock := &mockMetadataClient{
			series: map[string]*animemetadata.Series{
				"unwritable": {
					ID:      "unwritable",
					Seasons: []animemetadata.Season{{ID: "s1", Number: 1}},
				},
			},
		}
		service := te.serviceWithMetadata(mock)

		anime, err := service.Create(ctx, "Unwritable Show")
		require.NoError(t, err)
		makeUnwritable(t, filepath.Join(te.config.ImageRootDirectory, "Unwritable Show"))

		_, err = service.ImportFromMetadata(ctx, anime.ID, "unwritable")
		require.Error(t, err)
		assert.Contains(t, err.Error(), "CreateSeason")
	})

	t.Run("surfaces a movie folder that cannot be created on disk", func(t *testing.T) {
		te := newTester(t)
		mock := &mockMetadataClient{
			series: map[string]*animemetadata.Series{
				"unwritable-movie": {
					ID:     "unwritable-movie",
					Movies: []animemetadata.Movie{{ID: "m", Title: "A Film", ReleaseYear: 2020}},
				},
			},
		}
		service := te.serviceWithMetadata(mock)

		anime, err := service.Create(ctx, "Unwritable Movie Show")
		require.NoError(t, err)
		makeUnwritable(t, filepath.Join(te.config.ImageRootDirectory, "Unwritable Movie Show"))

		_, err = service.ImportFromMetadata(ctx, anime.ID, "unwritable-movie")
		require.Error(t, err)
		assert.Contains(t, err.Error(), "CreateSeason movie")
	})

	t.Run("surfaces a special folder that cannot be created on disk", func(t *testing.T) {
		te := newTester(t)
		mock := &mockMetadataClient{
			series: map[string]*animemetadata.Series{
				"unwritable-special": {
					ID:       "unwritable-special",
					Specials: []animemetadata.Special{{ID: "o", Title: "An OVA", ReleaseYear: 2020}},
				},
			},
		}
		service := te.serviceWithMetadata(mock)

		anime, err := service.Create(ctx, "Unwritable Special Show")
		require.NoError(t, err)
		makeUnwritable(t, filepath.Join(te.config.ImageRootDirectory, "Unwritable Special Show"))

		_, err = service.ImportFromMetadata(ctx, anime.ID, "unwritable-special")
		require.Error(t, err)
		assert.Contains(t, err.Error(), "CreateSeason other")
	})

	t.Run("surfaces a part folder that cannot be created on disk", func(t *testing.T) {
		te := newTester(t)
		mock := &mockMetadataClient{
			series: map[string]*animemetadata.Series{
				"unwritable-part": {
					ID: "unwritable-part",
					Seasons: []animemetadata.Season{
						{ID: "a", Number: 1, Title: "Split", Part: intPtr(1)},
						{ID: "b", Number: 1, Part: intPtr(2)},
					},
				},
			},
		}
		service := te.serviceWithMetadata(mock)

		anime, err := service.Create(ctx, "Unwritable Part Show")
		require.NoError(t, err)

		// The season folder already exists, so the import reuses it — but its
		// contents cannot be written, so creating the part folders fails.
		season, err := service.CreateSeason(ctx, anime.ID, db.SeasonTypeSeason, nil, "Split")
		require.NoError(t, err)
		require.NotZero(t, season.ID)
		makeUnwritable(t, filepath.Join(te.config.ImageRootDirectory, "Unwritable Part Show", "Split"))

		_, err = service.ImportFromMetadata(ctx, anime.ID, "unwritable-part")
		require.Error(t, err)
		assert.Contains(t, err.Error(), "CreateSubSeason Part 1")
	})

	t.Run("errors for an anime that does not exist", func(t *testing.T) {
		te := newTester(t)
		mock := &mockMetadataClient{
			series: map[string]*animemetadata.Series{"x": {ID: "x"}},
		}

		_, err := te.serviceWithMetadata(mock).ImportFromMetadata(ctx, 99999, "x")
		require.Error(t, err)
		assert.ErrorIs(t, err, ErrAnimeNotFound)
	})

	t.Run("records the upstream id on everything it creates", func(t *testing.T) {
		te := newTester(t)
		mock := &mockMetadataClient{
			series: map[string]*animemetadata.Series{
				"ids": {
					ID: "ids",
					Seasons: []animemetadata.Season{
						{ID: "ids-s1", Number: 1, Title: "First"},
						{ID: "ids-s2a", Number: 2, Part: intPtr(1), Title: "Second"},
						{ID: "ids-s2b", Number: 2, Part: intPtr(2)},
					},
					Movies:   []animemetadata.Movie{{ID: "ids-film", Title: "A Film", ReleaseYear: 2020}},
					Specials: []animemetadata.Special{{ID: "ids-ova", Title: "An OVA", ReleaseYear: 2021}},
				},
			},
		}
		service := te.serviceWithMetadata(mock)

		anime, err := service.Create(ctx, "Identified Show")
		require.NoError(t, err)
		_, err = service.ImportFromMetadata(ctx, anime.ID, "ids")
		require.NoError(t, err)

		assert.Equal(t, map[string]string{
			"First":         "ids-s1",
			"Second":        "ids-s2a",
			"Second/Part 1": "ids-s2a",
			"Second/Part 2": "ids-s2b",
			"A Film":        "ids-film",
			"An OVA":        "ids-ova",
		}, metadataIDsByPath(t, te, service, anime.ID))
	})

	t.Run("errors for a series that does not exist", func(t *testing.T) {
		te := newTester(t)
		mock := &mockMetadataClient{series: map[string]*animemetadata.Series{}}
		service := te.serviceWithMetadata(mock)

		anime, err := service.Create(ctx, "No Such Series")
		require.NoError(t, err)

		_, err = service.ImportFromMetadata(ctx, anime.ID, "nope")
		require.Error(t, err)
		assert.ErrorIs(t, err, animemetadata.ErrNotFound)
	})

	t.Run("errors for a blank series id", func(t *testing.T) {
		te := newTester(t)
		mock := &mockMetadataClient{series: map[string]*animemetadata.Series{}}

		_, err := te.serviceWithMetadata(mock).ImportFromMetadata(ctx, 1, "  ")
		require.Error(t, err)
		assert.Equal(t, 0, mock.getSeriesCalls)
	})

	t.Run("propagates a client failure", func(t *testing.T) {
		te := newTester(t)
		mock := &mockMetadataClient{seriesErr: errors.New("service unavailable")}
		service := te.serviceWithMetadata(mock)

		anime, err := service.Create(ctx, "Unavailable")
		require.NoError(t, err)

		_, err = service.ImportFromMetadata(ctx, anime.ID, "anything")
		require.Error(t, err)
		assert.Contains(t, err.Error(), "service unavailable")
	})

	t.Run("without a client returns an error", func(t *testing.T) {
		te := newTester(t)
		_, err := te.service().ImportFromMetadata(ctx, 1, "x")
		require.Error(t, err)
		assert.Contains(t, err.Error(), "anime metadata client is not configured")
	})
}

// TestService_ImportFromMetadata_Upsert covers re-importing after the upstream
// dataset changed — the cases that used to create a second folder or row.
func TestService_ImportFromMetadata_Upsert(t *testing.T) {
	ctx := context.Background()

	t.Run("a retitled movie renames its folder instead of duplicating it", func(t *testing.T) {
		te := newTester(t)
		mock := &mockMetadataClient{
			series: map[string]*animemetadata.Series{
				"ds": {
					ID:     "ds",
					Movies: []animemetadata.Movie{{ID: "ds-film", Title: "Mugen Train", ReleaseYear: 2020}},
				},
			},
		}
		service := te.serviceWithMetadata(mock)

		anime, err := service.Create(ctx, "Retitled Movie")
		require.NoError(t, err)
		_, err = service.ImportFromMetadata(ctx, anime.ID, "ds")
		require.NoError(t, err)

		// Upstream retitles the same entry.
		mock.series["ds"].Movies[0].Title = "Mugen Train (2020)"

		result, err := service.ImportFromMetadata(ctx, anime.ID, "ds")
		require.NoError(t, err)
		assert.Equal(t, 0, result.SeasonsCreated)
		assert.Equal(t, 1, result.SeasonsUpdated)

		seasons, err := service.GetAnimeSeasons(anime.ID)
		require.NoError(t, err)
		assert.Equal(t, []string{"Mugen Train (2020)"}, seasonNames(seasons))
		assertFolderOnDisk(t, te, anime.Name, "Mugen Train (2020)")
	})

	t.Run("a renumbered season moves rather than duplicating", func(t *testing.T) {
		te := newTester(t)
		mock := &mockMetadataClient{
			series: map[string]*animemetadata.Series{
				"rn": {
					ID:      "rn",
					Seasons: []animemetadata.Season{{ID: "rn-s1", Number: 1, Title: "Origins"}},
				},
			},
		}
		service := te.serviceWithMetadata(mock)

		anime, err := service.Create(ctx, "Renumbered Show")
		require.NoError(t, err)
		_, err = service.ImportFromMetadata(ctx, anime.ID, "rn")
		require.NoError(t, err)

		// Upstream inserts a new first season, pushing the original to 2.
		mock.series["rn"].Seasons = []animemetadata.Season{
			{ID: "rn-s0", Number: 1, Title: "Prequel"},
			{ID: "rn-s1", Number: 2, Title: "Origins"},
		}

		result, err := service.ImportFromMetadata(ctx, anime.ID, "rn")
		require.NoError(t, err)
		assert.Equal(t, 1, result.SeasonsCreated, "only the newly inserted season is created")

		seasons, err := service.GetAnimeSeasons(anime.ID)
		require.NoError(t, err)
		require.Len(t, seasons, 2, "the original season moved instead of duplicating")

		origins := findSeason(t, seasons, "Origins")
		require.NotNil(t, origins.SeasonNumber)
		assert.Equal(t, uint(2), *origins.SeasonNumber, "the original season was renumbered in place")
		prequel := findSeason(t, seasons, "Prequel")
		require.NotNil(t, prequel.SeasonNumber)
		assert.Equal(t, uint(1), *prequel.SeasonNumber)
	})

	t.Run("a folder the user renamed keeps their name", func(t *testing.T) {
		te := newTester(t)
		mock := &mockMetadataClient{
			series: map[string]*animemetadata.Series{
				"ur": {
					ID:      "ur",
					Seasons: []animemetadata.Season{{ID: "ur-s1", Number: 1, Title: "Original"}},
				},
			},
		}
		service := te.serviceWithMetadata(mock)

		anime, err := service.Create(ctx, "User Renamed")
		require.NoError(t, err)
		_, err = service.ImportFromMetadata(ctx, anime.ID, "ur")
		require.NoError(t, err)

		seasons, err := service.GetAnimeSeasons(anime.ID)
		require.NoError(t, err)
		require.NoError(t, service.RenameSeason(ctx, seasons[0].ID, "My Name For It"))

		// Upstream retitles it; the user's name wins.
		mock.series["ur"].Seasons[0].Title = "Upstream's New Title"

		_, err = service.ImportFromMetadata(ctx, anime.ID, "ur")
		require.NoError(t, err)

		seasons, err = service.GetAnimeSeasons(anime.ID)
		require.NoError(t, err)
		assert.Equal(t, []string{"My Name For It"}, seasonNames(seasons),
			"a rename moves images on disk, so the user's intent wins over staying in sync")
	})

	t.Run("a character renamed upstream keeps its row and image links", func(t *testing.T) {
		te := newTester(t)
		mock := &mockMetadataClient{
			series: map[string]*animemetadata.Series{
				"fz": {
					ID:         "fz",
					Characters: []animemetadata.Character{{ID: "artoria-pendragon", Name: "Saber"}},
				},
			},
		}
		service := te.serviceWithMetadata(mock)

		anime, err := service.Create(ctx, "Fate Cast")
		require.NoError(t, err)
		_, err = service.ImportFromMetadata(ctx, anime.ID, "fz")
		require.NoError(t, err)

		before, err := te.dbClient.Client.Character().FindByAnimeID(anime.ID)
		require.NoError(t, err)
		require.Len(t, before, 1)
		originalID := before[0].ID

		// Upstream resolves the same character under its full name.
		mock.series["fz"].Characters[0].Name = "Artoria Pendragon"

		result, err := service.ImportFromMetadata(ctx, anime.ID, "fz")
		require.NoError(t, err)
		assert.Equal(t, 0, result.CharactersCreated)
		assert.Equal(t, 1, result.CharactersUpdated)

		after, err := te.dbClient.Client.Character().FindByAnimeID(anime.ID)
		require.NoError(t, err)
		require.Len(t, after, 1, "the character was updated, not duplicated")
		assert.Equal(t, originalID, after[0].ID, "the row id is stable, so FileCharacter links survive")
		assert.Equal(t, "Artoria Pendragon", after[0].Name)
	})

	t.Run("a character the user renamed keeps their name", func(t *testing.T) {
		te := newTester(t)
		mock := &mockMetadataClient{
			series: map[string]*animemetadata.Series{
				"cr": {
					ID:         "cr",
					Characters: []animemetadata.Character{{ID: "saber", Name: "Saber"}},
				},
			},
		}
		service := te.serviceWithMetadata(mock)

		anime, err := service.Create(ctx, "Renamed Cast")
		require.NoError(t, err)
		_, err = service.ImportFromMetadata(ctx, anime.ID, "cr")
		require.NoError(t, err)

		rows, err := te.dbClient.Client.Character().FindByAnimeID(anime.ID)
		require.NoError(t, err)
		require.Len(t, rows, 1)
		rows[0].Name = "My Saber"
		require.NoError(t, te.dbClient.Client.Character().Update(ctx, &rows[0]))

		mock.series["cr"].Characters[0].Name = "Artoria"

		_, err = service.ImportFromMetadata(ctx, anime.ID, "cr")
		require.NoError(t, err)

		after, err := te.dbClient.Client.Character().FindByAnimeID(anime.ID)
		require.NoError(t, err)
		require.Len(t, after, 1)
		assert.Equal(t, "My Saber", after[0].Name)
	})

	t.Run("adopts folders and characters created before ids were stored", func(t *testing.T) {
		te := newTester(t)
		mock := &mockMetadataClient{
			series: map[string]*animemetadata.Series{
				"legacy": {
					ID:         "legacy",
					Seasons:    []animemetadata.Season{{ID: "legacy-s1", Number: 1, Title: "Season 1"}},
					Movies:     []animemetadata.Movie{{ID: "legacy-film", Title: "A Film", ReleaseYear: 2019}},
					Characters: []animemetadata.Character{{ID: "hero", Name: "Hero"}},
				},
			},
		}
		service := te.serviceWithMetadata(mock)

		anime, err := service.Create(ctx, "Pre-Id Install")
		require.NoError(t, err)

		// Stand in for rows written by the previous release: correct names and
		// numbers, but no upstream id.
		seasonNumber := uint(1)
		_, err = service.CreateSeason(ctx, anime.ID, db.SeasonTypeSeason, &seasonNumber, "Season 1")
		require.NoError(t, err)
		_, err = service.CreateSeason(ctx, anime.ID, db.SeasonTypeMovie, nil, "A Film")
		require.NoError(t, err)
		require.NoError(t, te.dbClient.Client.Character().Create(ctx, &db.Character{Name: "Hero", AnimeID: anime.ID}))

		result, err := service.ImportFromMetadata(ctx, anime.ID, "legacy")
		require.NoError(t, err)
		assert.Equal(t, 0, result.SeasonsCreated, "the existing folders are adopted, not duplicated")
		assert.Equal(t, 0, result.CharactersCreated, "the existing character is adopted, not duplicated")

		seasons, err := service.GetAnimeSeasons(anime.ID)
		require.NoError(t, err)
		assert.ElementsMatch(t, []string{"Season 1", "A Film"}, seasonNames(seasons))

		// Having been adopted, they now carry the id and re-import cleanly.
		assert.Equal(t, map[string]string{
			"Season 1": "legacy-s1",
			"A Film":   "legacy-film",
		}, metadataIDsByPath(t, te, service, anime.ID))

		again, err := service.ImportFromMetadata(ctx, anime.ID, "legacy")
		require.NoError(t, err)
		assert.Equal(t, MetadataImportResult{}, *again, "a settled re-import changes nothing")
	})

	t.Run("never takes a folder that belongs to another entry", func(t *testing.T) {
		te := newTester(t)
		mock := &mockMetadataClient{
			series: map[string]*animemetadata.Series{
				"steal": {
					ID: "steal",
					Seasons: []animemetadata.Season{
						{ID: "steal-s1", Number: 1, Title: "Alpha"},
					},
				},
			},
		}
		service := te.serviceWithMetadata(mock)

		anime, err := service.Create(ctx, "No Stealing")
		require.NoError(t, err)
		_, err = service.ImportFromMetadata(ctx, anime.ID, "steal")
		require.NoError(t, err)

		// A different entry takes over season number 1; the existing folder is
		// linked to steal-s1, so it must not be reused for steal-s2.
		mock.series["steal"].Seasons = []animemetadata.Season{
			{ID: "steal-s2", Number: 1, Title: "Beta"},
		}

		result, err := service.ImportFromMetadata(ctx, anime.ID, "steal")
		require.NoError(t, err)
		assert.Equal(t, 1, result.SeasonsCreated)

		seasons, err := service.GetAnimeSeasons(anime.ID)
		require.NoError(t, err)
		assert.ElementsMatch(t, []string{"Alpha", "Beta"}, seasonNames(seasons))
	})
}

func TestService_LinkMetadataSeries(t *testing.T) {
	ctx := context.Background()

	t.Run("sets the series id without importing", func(t *testing.T) {
		te := newTester(t)
		service := te.service()

		anime, err := service.Create(ctx, "Link Only")
		require.NoError(t, err)

		require.NoError(t, service.LinkMetadataSeries(ctx, anime.ID, "fate-zero", 10087))

		row, err := te.dbClient.Client.Anime().FindByValue(ctx, &db.Anime{ID: anime.ID})
		require.NoError(t, err)
		require.NotNil(t, row.MetadataSeriesID)
		assert.Equal(t, "fate-zero", *row.MetadataSeriesID)
		require.NotNil(t, row.AniListID)
		assert.Equal(t, 10087, *row.AniListID)

		seasons, err := service.GetAnimeSeasons(anime.ID)
		require.NoError(t, err)
		assert.Empty(t, seasons)
	})

	t.Run("leaves an existing AniList id alone when given zero", func(t *testing.T) {
		te := newTester(t)
		service := te.service()

		anime, err := service.Create(ctx, "Keep AniList")
		require.NoError(t, err)
		require.NoError(t, service.LinkMetadataSeries(ctx, anime.ID, "first", 555))
		require.NoError(t, service.LinkMetadataSeries(ctx, anime.ID, "second", 0))

		row, err := te.dbClient.Client.Anime().FindByValue(ctx, &db.Anime{ID: anime.ID})
		require.NoError(t, err)
		assert.Equal(t, "second", *row.MetadataSeriesID)
		require.NotNil(t, row.AniListID)
		assert.Equal(t, 555, *row.AniListID)
	})

	t.Run("errors for an anime that does not exist", func(t *testing.T) {
		te := newTester(t)
		err := te.service().LinkMetadataSeries(ctx, 99999, "fate-zero", 0)
		require.Error(t, err)
		assert.ErrorIs(t, err, ErrAnimeNotFound)
	})
}
