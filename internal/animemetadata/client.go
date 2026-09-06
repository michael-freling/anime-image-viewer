// Package animemetadata is a client for the read-only Connect RPC API of
// github.com/michael-freling/anime-metadata-db.
//
// That service models anime as Series -> Season / Movie / Special (plus the
// episodes under them) and serves the cast alongside it, which is what this
// application imports. Connect speaks plain HTTP POST + JSON, so no generated
// stubs or extra dependencies are needed: each RPC is a POST to
// /anime.v1.AnimeService/<Method> with a JSON body.
//
// The API is three calls wide — SearchSeries, SearchReleases and GetSeries —
// and only the two this application needs are implemented here. GetSeries
// returns a series whole, so nothing below it has to be paged back in; only
// SearchSeries pages, because a page of results is unbounded where one series
// is not.
//
// Titles are resolved server-side from the Accept-Language header, which this
// client sends as "en". The API can additionally return every translation of
// each title, but only for `Accept-Language: *`, and this application has no
// use for them, so they are neither requested nor modelled.
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

// maxPages bounds how many pages of search results may be walked. It exists so
// a server that keeps handing back a page token can never spin this client
// forever; a search that needs this many pages is not a search.
const maxPages = 100

// ErrNotFound is returned when the API reports that an id is not in the
// dataset (Connect code "not_found").
var ErrNotFound = errors.New("animemetadata: not found")

// Client queries the anime-metadata-db API. The interface keeps the anime
// service testable without network access.
type Client interface {
	SearchSeries(ctx context.Context, query string, limit int) ([]SeriesSummary, error)
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

type searchSeriesRequest struct {
	Query     string `json:"query"`
	Limit     int    `json:"limit"`
	PageToken string `json:"pageToken,omitempty"`
}

type searchSeriesResponse struct {
	Series        []SeriesSummary `json:"series"`
	NextPageToken string          `json:"nextPageToken"`
	TotalSize     int             `json:"totalSize"`
}

type getSeriesRequest struct {
	ID string `json:"id"`
}

type getSeriesResponse struct {
	Series      *Series `json:"series"`
	FranchiseID string  `json:"franchiseId"`
}

// SearchSeries matches series by title (case-insensitive substring, in any
// language). A limit <= 0 applies defaultSearchLimit, and an empty query walks
// the whole catalogue in dataset order.
//
// Every hit is a series: franchises are a grouping the API does not search
// over, so unlike the call this replaced there is nothing to filter out.
//
// Results are paged, and a page may be smaller than the limit asked for, so
// this follows the page tokens until it has limit matches or they run out.
func (c *HTTPClient) SearchSeries(ctx context.Context, query string, limit int) ([]SeriesSummary, error) {
	if limit <= 0 {
		limit = defaultSearchLimit
	}

	var results []SeriesSummary
	var pageToken string
	for page := 0; page < maxPages && len(results) < limit; page++ {
		var resp searchSeriesResponse
		req := searchSeriesRequest{Query: query, Limit: limit - len(results), PageToken: pageToken}
		if err := c.call(ctx, "SearchSeries", req, &resp); err != nil {
			return nil, err
		}
		results = append(results, resp.Series...)
		if resp.NextPageToken == "" || len(resp.Series) == 0 {
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
// The response is complete: the API used to embed a capped first page of each
// collection alongside its real count, which this client had to page back in
// through companion List calls. Those calls are gone and nothing is capped, so
// what the server sends is what the caller gets.
func (c *HTTPClient) GetSeries(ctx context.Context, id string) (*Series, error) {
	var resp getSeriesResponse
	if err := c.call(ctx, "GetSeries", getSeriesRequest{ID: id}, &resp); err != nil {
		return nil, err
	}
	if resp.Series == nil {
		return nil, fmt.Errorf("%w: series %q", ErrNotFound, id)
	}
	return resp.Series, nil
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
