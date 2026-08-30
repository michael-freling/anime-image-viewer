package animemetadata

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// These are contract tests: they run against the real anime-metadata-db
// deployment and assert the parts of its wire format this package depends on.
//
// They exist because that API has twice changed underneath us without anything
// failing loudly. Both breaks were string comparisons that simply stopped
// matching: the enum values lost their prefixes ("ENTRY_KIND_SERIES" became
// "SERIES"), which made every search return nothing, and the embedded
// collections became capped first pages, which silently truncated an import to
// 25 characters. Neither the compiler nor the hermetic tests in client_test.go
// can catch that class of change, because those tests assert against fixtures
// written by hand from the same stale assumption as the code.
//
// They are skipped unless ANIME_METADATA_CONTRACT=1, so the normal test run and
// the PR gate stay hermetic and offline. They still compile on every run, so
// they cannot rot unnoticed. A scheduled workflow runs them against the live
// API — see .github/workflows/metadata-contract.yml.
const contractEnvVar = "ANIME_METADATA_CONTRACT"

// ListCatalog is used only to discover test candidates, so its request and
// response live here rather than in the production client.
type listCatalogRequest struct {
	Kind      string `json:"kind,omitempty"`
	Limit     int    `json:"limit"`
	PageToken string `json:"pageToken,omitempty"`
}

type catalogEntry struct {
	Kind string `json:"kind"`
	ID   string `json:"id"`
}

type listCatalogResponse struct {
	Entries       []catalogEntry `json:"entries"`
	NextPageToken string         `json:"nextPageToken"`
	TotalSize     int            `json:"totalSize"`
}

// contractClient returns a client for the live API, or skips the test.
func contractClient(t *testing.T) *HTTPClient {
	t.Helper()
	if os.Getenv(contractEnvVar) != "1" {
		t.Skipf("set %s=1 to run contract tests against the live API", contractEnvVar)
	}
	endpoint := os.Getenv("ANIME_METADATA_API_ENDPOINT")
	return NewHTTPClient(endpoint)
}

func contractContext(t *testing.T) context.Context {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	t.Cleanup(cancel)
	return ctx
}

// TestContractSearchEntryKinds guards the enum spelling that broke search.
//
// SearchMetadata keeps only results whose Kind equals EntryKindSeries, so if
// upstream respells that value every search silently returns nothing and no
// anime can be linked. Asserting the constant against live data is the only
// thing that catches it.
func TestContractSearchEntryKinds(t *testing.T) {
	client := contractClient(t)

	results, err := client.Search(contractContext(t), "a", 50)
	require.NoError(t, err)
	require.NotEmpty(t, results, "a one-letter substring should match something in any non-empty dataset")

	known := map[string]bool{
		EntryKindFranchise:   true,
		EntryKindSeries:      true,
		EntryKindUnspecified: true,
	}
	seriesCount := 0
	for _, result := range results {
		assert.Truef(t, known[result.Kind],
			"unknown EntryKind %q for %q — upstream respelled the enum and the constants in types.go are stale",
			result.Kind, result.ID)
		if result.Kind == EntryKindSeries {
			seriesCount++
		}
	}

	// This is exactly the filter SearchMetadata applies. Zero here means the
	// application's search box is empty no matter what the user types.
	assert.NotZero(t, seriesCount, "no result had Kind == EntryKindSeries; SearchMetadata would return nothing")
}

// TestContractReleaseSeasons guards the enum spelling that silently cleared the
// airing season on every imported folder.
func TestContractReleaseSeasons(t *testing.T) {
	client := contractClient(t)
	ctx := contractContext(t)

	known := map[string]bool{
		ReleaseSeasonWinter:      true,
		ReleaseSeasonSpring:      true,
		ReleaseSeasonSummer:      true,
		ReleaseSeasonFall:        true,
		ReleaseSeasonUnspecified: true,
	}

	results, err := client.Search(ctx, "a", 25)
	require.NoError(t, err)

	recognised := 0
	checked := 0
	for _, result := range results {
		if result.Kind != EntryKindSeries {
			continue
		}
		if checked >= 5 {
			break
		}
		checked++

		series, err := client.GetSeries(ctx, result.ID)
		require.NoError(t, err)
		for _, season := range series.Seasons {
			if season.ReleaseSeason == "" {
				// A season need not carry a quarter.
				continue
			}
			assert.Truef(t, known[season.ReleaseSeason],
				"unknown ReleaseSeason %q on season %q — upstream respelled the enum, so imports would clear the airing season",
				season.ReleaseSeason, season.ID)
			if known[season.ReleaseSeason] && season.ReleaseSeason != ReleaseSeasonUnspecified {
				recognised++
			}
		}
	}

	require.NotZero(t, checked, "no series to check")
	// If every season came back with a value we do not recognise, the loop
	// above already failed. This catches the other direction: the field
	// disappearing or being renamed, which leaves everything empty.
	assert.NotZero(t, recognised,
		"no season carried a recognised release season; the releaseSeason field may have been renamed")
}

// TestContractPaginationEnvelope asserts the paging fields this client steers
// by are still there and still work. If nextPageToken or totalSize is renamed,
// they decode as zero values, paging stops after one page and imports truncate
// without any error.
func TestContractPaginationEnvelope(t *testing.T) {
	client := contractClient(t)
	ctx := contractContext(t)

	var first listCharactersResponse
	require.NoError(t, client.call(ctx, "ListCharacters", listCharactersRequest{Limit: 2}, &first))

	require.NotEmpty(t, first.Characters, "the dataset should have characters")
	require.Greaterf(t, first.TotalSize, len(first.Characters),
		"totalSize (%d) should exceed a 2-item page; the field may have been renamed", first.TotalSize)
	require.NotEmpty(t, first.NextPageToken, "nextPageToken should be set when more pages remain")

	// The token must actually advance, not replay the first page.
	var second listCharactersResponse
	require.NoError(t, client.call(ctx, "ListCharacters",
		listCharactersRequest{Limit: 2, PageToken: first.NextPageToken}, &second))
	require.NotEmpty(t, second.Characters)
	assert.NotEqual(t, first.Characters[0].ID, second.Characters[0].ID,
		"the second page repeated the first; pageToken is not being honoured")
}

// TestContractGetSeriesReturnsWholeCast is the regression test for the
// truncation bug: it finds a series the API actually truncates and asserts
// GetSeries hands back the whole cast anyway.
func TestContractGetSeriesReturnsWholeCast(t *testing.T) {
	client := contractClient(t)
	ctx := contractContext(t)

	seriesID, embedded, total := findTruncatedSeries(ctx, t, client)
	if seriesID == "" {
		t.Skip("no series in the dataset currently exceeds the embedded cast cap; nothing to exercise")
	}
	t.Logf("series %q embeds %d of %d characters", seriesID, embedded, total)

	series, err := client.GetSeries(ctx, seriesID)
	require.NoError(t, err)
	assert.Lenf(t, series.Characters, total,
		"GetSeries returned %d of %d characters for %q; the cast is being truncated again",
		len(series.Characters), total, seriesID)

	// Every collection GetSeries hands out should be complete, not just the
	// cast — the same cap applies to seasons, movies and specials.
	assert.GreaterOrEqual(t, len(series.Seasons), series.SeasonsTotal, "seasons truncated")
	assert.GreaterOrEqual(t, len(series.Movies), series.MoviesTotal, "movies truncated")
	assert.GreaterOrEqual(t, len(series.Specials), series.SpecialsTotal, "specials truncated")
}

// findTruncatedSeries scans the catalog for a series whose cast does not fit in
// the page GetSeries embeds, returning its id and the embedded/total counts. It
// returns an empty id when the dataset has no such series.
//
// The scan is deliberately not a hardcoded id: the dataset is regenerated
// upstream and any particular series can be renamed or removed, which would
// turn this into a false failure rather than a real one.
func findTruncatedSeries(ctx context.Context, t *testing.T, client *HTTPClient) (string, int, int) {
	t.Helper()

	const maxCandidates = 60
	var pageToken string
	scanned := 0

	for scanned < maxCandidates {
		var catalog listCatalogResponse
		req := listCatalogRequest{Kind: EntryKindSeries, Limit: 50, PageToken: pageToken}
		require.NoError(t, client.call(ctx, "ListCatalog", req, &catalog))
		if len(catalog.Entries) == 0 {
			return "", 0, 0
		}

		for _, entry := range catalog.Entries {
			if scanned >= maxCandidates {
				break
			}
			scanned++

			// The raw response, not client.GetSeries, which fills the gap
			// this is looking for.
			var raw getSeriesResponse
			if err := client.call(ctx, "GetSeries", getSeriesRequest{ID: entry.ID}, &raw); err != nil {
				continue
			}
			if raw.Series != nil && raw.Series.CharactersTotal > len(raw.Series.Characters) {
				return entry.ID, len(raw.Series.Characters), raw.Series.CharactersTotal
			}
		}

		if catalog.NextPageToken == "" {
			break
		}
		pageToken = catalog.NextPageToken
	}
	return "", 0, 0
}
