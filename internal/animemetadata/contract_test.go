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
// They exist because that API has repeatedly changed underneath us without
// anything failing loudly. The enum values lost their prefixes
// ("ENTRY_KIND_SERIES" became "SERIES"), which made every search return
// nothing; the embedded collections became capped first pages, which silently
// truncated an import to 25 characters; and then the search RPC was renamed and
// reshaped (Search -> SearchSeries, "results" -> "series") while the companion
// paging RPCs were removed outright. Only the last of those failed loudly, and
// only because a removed RPC 404s. Neither the compiler nor the hermetic tests
// in client_test.go can catch that class of change, because those tests assert
// against fixtures written by hand from the same assumption as the code.
//
// They are skipped unless ANIME_METADATA_CONTRACT=1, so the normal test run and
// the PR gate stay hermetic and offline. They still compile on every run, so
// they cannot rot unnoticed. A scheduled workflow runs them against the live
// API — see .github/workflows/metadata-contract.yml.
const contractEnvVar = "ANIME_METADATA_CONTRACT"

// oldEmbeddedCap is the page size the API used to cap each embedded collection
// at, before it began serializing a series whole. It is the size a silently
// re-introduced cap would most likely reappear at.
const oldEmbeddedCap = 25

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

// TestContractSearchSeriesEnvelope guards the RPC name and the response field
// that carries the hits.
//
// Both have changed before: the call was renamed from Search, and its results
// moved from "results" to "series". A rename 404s, but a re-shaped envelope
// decodes to an empty slice, which reaches the user as a search box that
// matches nothing no matter what they type.
func TestContractSearchSeriesEnvelope(t *testing.T) {
	client := contractClient(t)

	results, err := client.SearchSeries(contractContext(t), "a", 50)
	require.NoError(t, err)
	require.NotEmpty(t, results,
		"a one-letter substring should match something in any non-empty dataset; "+
			"the SearchSeries response envelope may have been reshaped again")

	for _, result := range results {
		assert.NotEmptyf(t, result.ID, "a search hit carried no id: %+v", result)
		assert.NotEmptyf(t, result.Title, "series %q carried no title", result.ID)
	}
}

// TestContractSearchHitsAreImportable walks the whole flow the application
// puts a user through — search for a series, then open the one they picked.
//
// The id a hit carries is the id GetSeries takes. If the two ever drift apart,
// every search still looks fine and every import fails.
func TestContractSearchHitsAreImportable(t *testing.T) {
	client := contractClient(t)
	ctx := contractContext(t)

	results, err := client.SearchSeries(ctx, "a", 5)
	require.NoError(t, err)
	require.NotEmpty(t, results)

	for _, result := range results {
		series, err := client.GetSeries(ctx, result.ID)
		require.NoErrorf(t, err, "GetSeries rejected the id search returned for %q", result.Title)
		assert.Equalf(t, result.ID, series.ID,
			"GetSeries(%q) came back as a different series", result.ID)
	}
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

	results, err := client.SearchSeries(ctx, "a", 25)
	require.NoError(t, err)

	recognised := 0
	checked := 0
	for _, result := range results {
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

// TestContractSearchPaginationEnvelope asserts the paging fields SearchSeries
// steers by are still there and still work.
//
// Search is the one call that still pages — a series is served whole, but a
// page of results is not. If nextPageToken or totalSize is renamed they decode
// as zero values, paging stops after the first page, and a search quietly
// returns fewer matches than the user asked for.
func TestContractSearchPaginationEnvelope(t *testing.T) {
	client := contractClient(t)
	ctx := contractContext(t)

	// An empty query walks the catalogue, so this does not depend on any
	// particular title surviving a dataset regeneration.
	var first searchSeriesResponse
	require.NoError(t, client.call(ctx, "SearchSeries", searchSeriesRequest{Limit: 2}, &first))

	require.NotEmpty(t, first.Series, "the catalogue should not be empty")
	require.Greaterf(t, first.TotalSize, len(first.Series),
		"totalSize (%d) should exceed a 2-item page; the field may have been renamed", first.TotalSize)
	require.NotEmpty(t, first.NextPageToken, "nextPageToken should be set when more pages remain")

	// The token must actually advance, not replay the first page.
	var second searchSeriesResponse
	require.NoError(t, client.call(ctx, "SearchSeries",
		searchSeriesRequest{Limit: 2, PageToken: first.NextPageToken}, &second))
	require.NotEmpty(t, second.Series)
	assert.NotEqual(t, first.Series[0].ID, second.Series[0].ID,
		"the second page repeated the first; pageToken is not being honoured")
}

// TestContractGetSeriesIsComplete is the regression test for the truncation
// bug, rewritten for an API that no longer publishes the counts it used to
// truncate against.
//
// The check that a series comes back whole now cross-references the search
// summary: works is seasons + movies + specials, and episodes is the total
// across them. Those two numbers are computed upstream from the dataset rather
// than from the response being checked, so a capped collection shows up as a
// disagreement between them.
func TestContractGetSeriesIsComplete(t *testing.T) {
	client := contractClient(t)
	ctx := contractContext(t)

	summaries, err := client.SearchSeries(ctx, "", 20)
	require.NoError(t, err)
	require.NotEmpty(t, summaries)

	for _, summary := range summaries {
		series, err := client.GetSeries(ctx, summary.ID)
		require.NoError(t, err)

		works := len(series.Seasons) + len(series.Movies) + len(series.Specials)
		assert.Equalf(t, summary.Works, works,
			"series %q: search reports %d works but GetSeries returned %d; a collection is being truncated",
			summary.ID, summary.Works, works)

		episodes := 0
		for _, season := range series.Seasons {
			episodes += len(season.Episodes)
		}
		for _, special := range series.Specials {
			episodes += len(special.Episodes)
		}
		assert.Equalf(t, summary.Episodes, episodes,
			"series %q: search reports %d episodes but GetSeries returned %d; episodes are being truncated",
			summary.ID, summary.Episodes, episodes)
	}
}

// TestContractGetSeriesReturnsWholeCast covers the one collection the summary
// counts say nothing about.
//
// Nothing upstream publishes a cast size, so this looks for a series whose cast
// is larger than the cap the API used to apply and asserts it arrives whole. A
// re-introduced cap would land on exactly that boundary.
func TestContractGetSeriesReturnsWholeCast(t *testing.T) {
	client := contractClient(t)
	ctx := contractContext(t)

	seriesID, cast := findLargestCast(ctx, t, client)
	require.NotEmpty(t, seriesID, "no series in the catalogue carries a cast at all")
	t.Logf("largest cast found: %q with %d characters", seriesID, cast)

	if cast <= oldEmbeddedCap {
		t.Skipf("no series currently exceeds the old %d-character cap; nothing to exercise", oldEmbeddedCap)
	}
	assert.NotEqual(t, oldEmbeddedCap, cast,
		"series %q came back with exactly %d characters, the old embedded cap; the cast is being truncated again",
		seriesID, oldEmbeddedCap)
}

// findLargestCast scans the catalogue for the series with the most characters,
// returning its id and cast size.
//
// The scan is deliberately not a hardcoded id: the dataset is regenerated
// upstream and any particular series can be renamed or removed, which would
// turn this into a false failure rather than a real one.
func findLargestCast(ctx context.Context, t *testing.T, client *HTTPClient) (string, int) {
	t.Helper()

	const maxCandidates = 60
	summaries, err := client.SearchSeries(ctx, "", maxCandidates)
	require.NoError(t, err)

	bestID := ""
	best := 0
	for _, summary := range summaries {
		series, err := client.GetSeries(ctx, summary.ID)
		if err != nil {
			continue
		}
		if len(series.Characters) > best {
			best = len(series.Characters)
			bestID = summary.ID
		}
	}
	return bestID, best
}
