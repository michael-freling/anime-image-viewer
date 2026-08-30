// Package animemetadata is a client for the read-only Connect RPC API of
// github.com/michael-freling/anime-metadata-db.
//
// That service models anime as Franchise -> Series -> Season -> Episode (plus
// Movie and Special) and serves the cast alongside it, which is what this
// application imports. Connect speaks plain HTTP POST + JSON, so no generated
// stubs or extra dependencies are needed: each RPC is a POST to
// /anime.v1.AnimeService/<Method> with a JSON body.
//
// The API paginates: every collection it embeds in a record is the first page
// only, capped, with the real count alongside it. This client hides that from
// its callers — Search and GetSeries both follow the page tokens and return
// the whole thing.
package animemetadata

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// DefaultEndpoint is the hosted deployment of anime-metadata-db. It can be
// overridden through the `anime_metadata_api_endpoint` config key, e.g. to
// point at a locally running `go run ./api/cmd/api`.
const DefaultEndpoint = "https://anime-metadata-db.vercel.app"

// defaultTimeout bounds a single RPC. The dataset is embedded in the server
// binary, so responses are fast; a slow one means the deployment is unhealthy.
const defaultTimeout = 15 * time.Second

// defaultSearchLimit caps search results when the caller does not specify one.
const defaultSearchLimit = 25

// pageLimit is the page size this client asks for when paging a collection.
// The server caps what it embeds in a record at a much smaller number, so
// asking for a large page keeps a big cast to one or two extra round trips.
const pageLimit = 100

// maxPages bounds how many pages one collection may be walked over. It exists
// so a server that keeps handing back a page token can never spin this client
// forever; the dataset is nowhere near this size.
const maxPages = 100

// ErrNotFound is returned when the API reports that an id is not in the
// dataset (Connect code "not_found").
var ErrNotFound = errors.New("animemetadata: not found")

// Client queries the anime-metadata-db API. The interface keeps the anime
// service testable without network access.
type Client interface {
	Search(ctx context.Context, query string, limit int) ([]SearchResult, error)
	GetSeries(ctx context.Context, id string) (*Series, error)
}

// HTTPClient is the production implementation.
type HTTPClient struct {
	endpoint   string
	language   string
	httpClient *http.Client
}

// NewHTTPClient creates a client for the given endpoint. An empty endpoint
// falls back to DefaultEndpoint.
func NewHTTPClient(endpoint string) *HTTPClient {
	if strings.TrimSpace(endpoint) == "" {
		endpoint = DefaultEndpoint
	}
	return &HTTPClient{
		endpoint:   strings.TrimRight(strings.TrimSpace(endpoint), "/"),
		language:   "en",
		httpClient: &http.Client{Timeout: defaultTimeout},
	}
}

// connectError is the JSON body Connect returns for a failed RPC.
type connectError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type searchRequest struct {
	Query     string `json:"query"`
	Limit     int    `json:"limit"`
	PageToken string `json:"pageToken,omitempty"`
}

type searchResponse struct {
	Results       []SearchResult `json:"results"`
	NextPageToken string         `json:"nextPageToken"`
	TotalSize     int            `json:"totalSize"`
}

type getSeriesRequest struct {
	ID string `json:"id"`
}

type getSeriesResponse struct {
	Series      *Series `json:"series"`
	FranchiseID string  `json:"franchiseId"`
}

type listCharactersRequest struct {
	SeriesID  string `json:"seriesId"`
	Limit     int    `json:"limit"`
	PageToken string `json:"pageToken,omitempty"`
}

type listCharactersResponse struct {
	Characters    []Character `json:"characters"`
	NextPageToken string      `json:"nextPageToken"`
	TotalSize     int         `json:"totalSize"`
}

type listWorksRequest struct {
	SeriesID  string `json:"seriesId"`
	Kind      string `json:"kind,omitempty"`
	Limit     int    `json:"limit"`
	PageToken string `json:"pageToken,omitempty"`
}

type listWorksResponse struct {
	Works         []WorkSummary `json:"works"`
	NextPageToken string        `json:"nextPageToken"`
	TotalSize     int           `json:"totalSize"`
}

// Search matches franchises and series by title (case-insensitive substring).
// A limit <= 0 applies defaultSearchLimit.
//
// The API pages results, and a page may be smaller than the limit asked for,
// so this follows the page tokens until it has limit matches or the matches
// run out.
func (c *HTTPClient) Search(ctx context.Context, query string, limit int) ([]SearchResult, error) {
	if limit <= 0 {
		limit = defaultSearchLimit
	}

	var results []SearchResult
	var pageToken string
	for page := 0; page < maxPages && len(results) < limit; page++ {
		var resp searchResponse
		req := searchRequest{Query: query, Limit: limit - len(results), PageToken: pageToken}
		if err := c.call(ctx, "Search", req, &resp); err != nil {
			return nil, err
		}
		results = append(results, resp.Results...)
		if resp.NextPageToken == "" || len(resp.Results) == 0 {
			break
		}
		pageToken = resp.NextPageToken
	}

	if len(results) > limit {
		results = results[:limit]
	}
	return results, nil
}

// GetSeries returns one series by id, with its seasons, movies, specials and
// cast. It returns ErrNotFound when the id is not in the dataset.
//
// The API embeds only the first page of each of those collections, so anything
// beyond that page is fetched here: a series whose cast runs to a few hundred
// characters is returned whole, not silently truncated to the first 25.
func (c *HTTPClient) GetSeries(ctx context.Context, id string) (*Series, error) {
	var resp getSeriesResponse
	if err := c.call(ctx, "GetSeries", getSeriesRequest{ID: id}, &resp); err != nil {
		return nil, err
	}
	if resp.Series == nil {
		return nil, fmt.Errorf("%w: series %q", ErrNotFound, id)
	}

	series := resp.Series
	if err := c.fillCharacters(ctx, series); err != nil {
		return nil, err
	}
	if err := c.fillWorks(ctx, series); err != nil {
		return nil, err
	}
	return series, nil
}

// fillCharacters replaces a truncated cast with the full one. ListCharacters
// returns the same Character records GetSeries embeds, scoped to the series,
// so the whole list is re-fetched rather than stitched onto the first page.
func (c *HTTPClient) fillCharacters(ctx context.Context, series *Series) error {
	if series.CharactersTotal <= len(series.Characters) {
		return nil
	}

	characters := make([]Character, 0, series.CharactersTotal)
	var pageToken string
	for page := 0; page < maxPages; page++ {
		var resp listCharactersResponse
		req := listCharactersRequest{SeriesID: series.ID, Limit: pageLimit, PageToken: pageToken}
		if err := c.call(ctx, "ListCharacters", req, &resp); err != nil {
			return fmt.Errorf("ListCharacters(%q): %w", series.ID, err)
		}
		characters = append(characters, resp.Characters...)
		if resp.NextPageToken == "" || len(resp.Characters) == 0 {
			break
		}
		pageToken = resp.NextPageToken
	}

	// Keep the embedded page if paging somehow came back with less than it,
	// so a partial response can never lose data that was already in hand.
	if len(characters) >= len(series.Characters) {
		series.Characters = characters
	}
	return nil
}

// fillWorks tops up the seasons, movies and specials that did not fit in the
// embedded page.
//
// ListWorks is the only RPC that pages a series' releases, and it returns the
// flattened WorkSummary rather than the nested records, so the recovered
// entries carry less than the embedded ones — a season notably has no Part.
// They are appended to the embedded page instead of replacing it, which keeps
// the richer records for the entries that did fit.
func (c *HTTPClient) fillWorks(ctx context.Context, series *Series) error {
	if series.SeasonsTotal <= len(series.Seasons) &&
		series.MoviesTotal <= len(series.Movies) &&
		series.SpecialsTotal <= len(series.Specials) {
		return nil
	}

	seen := make(map[string]bool, len(series.Seasons)+len(series.Movies)+len(series.Specials))
	for _, season := range series.Seasons {
		seen[season.ID] = true
	}
	for _, movie := range series.Movies {
		seen[movie.ID] = true
	}
	for _, special := range series.Specials {
		seen[special.ID] = true
	}

	var pageToken string
	for page := 0; page < maxPages; page++ {
		var resp listWorksResponse
		req := listWorksRequest{SeriesID: series.ID, Limit: pageLimit, PageToken: pageToken}
		if err := c.call(ctx, "ListWorks", req, &resp); err != nil {
			return fmt.Errorf("ListWorks(%q): %w", series.ID, err)
		}
		for _, work := range resp.Works {
			if work.ID == "" || seen[work.ID] {
				continue
			}
			seen[work.ID] = true
			series.appendWork(work)
		}
		if resp.NextPageToken == "" || len(resp.Works) == 0 {
			break
		}
		pageToken = resp.NextPageToken
	}
	return nil
}

// appendWork adds one flattened release to the collection its kind belongs to.
func (s *Series) appendWork(work WorkSummary) {
	switch work.Kind {
	case WorkKindSeason:
		s.Seasons = append(s.Seasons, Season{
			ID:            work.ID,
			Title:         work.Title,
			Number:        work.Number,
			ReleaseDate:   work.ReleaseDate,
			ReleaseYear:   work.ReleaseYear,
			ReleaseSeason: work.ReleaseSeason,
			ExternalIDs:   work.ExternalIDs,
			EpisodesTotal: work.EpisodeCount,
		})
	case WorkKindMovie:
		s.Movies = append(s.Movies, Movie{
			ID:          work.ID,
			Title:       work.Title,
			ReleaseDate: work.ReleaseDate,
			ReleaseYear: work.ReleaseYear,
			ExternalIDs: work.ExternalIDs,
		})
	case WorkKindSpecial:
		s.Specials = append(s.Specials, Special{
			ID:            work.ID,
			Title:         work.Title,
			Format:        work.Format,
			ReleaseDate:   work.ReleaseDate,
			ReleaseYear:   work.ReleaseYear,
			ExternalIDs:   work.ExternalIDs,
			EpisodesTotal: work.EpisodeCount,
		})
	}
}

// call performs one Connect RPC and decodes the response into out.
func (c *HTTPClient) call(ctx context.Context, method string, reqBody any, out any) error {
	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return fmt.Errorf("animemetadata: failed to marshal %s request: %w", method, err)
	}

	url := c.endpoint + "/anime.v1.AnimeService/" + method
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(jsonBody))
	if err != nil {
		return fmt.Errorf("animemetadata: failed to create %s request: %w", method, err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept-Language", c.language)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("animemetadata: %s request failed: %w", method, err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("animemetadata: failed to read %s response: %w", method, err)
	}

	if resp.StatusCode != http.StatusOK {
		var cerr connectError
		if json.Unmarshal(body, &cerr) == nil && cerr.Code != "" {
			if cerr.Code == "not_found" {
				return fmt.Errorf("%w: %s", ErrNotFound, cerr.Message)
			}
			return fmt.Errorf("animemetadata: %s failed: %s: %s", method, cerr.Code, cerr.Message)
		}
		return fmt.Errorf("animemetadata: %s unexpected status %d: %s", method, resp.StatusCode, string(body))
	}

	if err := json.Unmarshal(body, out); err != nil {
		return fmt.Errorf("animemetadata: failed to parse %s response: %w", method, err)
	}
	return nil
}
