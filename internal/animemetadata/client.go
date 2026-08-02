// Package animemetadata is a client for the read-only Connect RPC API of
// github.com/michael-freling/anime-metadata-db.
//
// That service models anime as Franchise -> Series -> Season -> Episode (plus
// Movie and Special) and serves the cast alongside it, which is what this
// application imports. Connect speaks plain HTTP POST + JSON, so no generated
// stubs or extra dependencies are needed: each RPC is a POST to
// /anime.v1.AnimeService/<Method> with a JSON body.
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
// point at a locally running `go run ./cmd/api`.
const DefaultEndpoint = "https://anime-metadata-db.vercel.app"

// defaultTimeout bounds a single RPC. The dataset is embedded in the server
// binary, so responses are fast; a slow one means the deployment is unhealthy.
const defaultTimeout = 15 * time.Second

// defaultSearchLimit caps search results when the caller does not specify one.
const defaultSearchLimit = 10

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
	Query string `json:"query"`
	Limit int    `json:"limit"`
}

type searchResponse struct {
	Results []SearchResult `json:"results"`
}

type getSeriesRequest struct {
	ID string `json:"id"`
}

type getSeriesResponse struct {
	Series      *Series `json:"series"`
	FranchiseID string  `json:"franchiseId"`
}

// Search matches franchises and series by title (case-insensitive substring).
// A limit <= 0 applies defaultSearchLimit.
func (c *HTTPClient) Search(ctx context.Context, query string, limit int) ([]SearchResult, error) {
	if limit <= 0 {
		limit = defaultSearchLimit
	}
	var resp searchResponse
	if err := c.call(ctx, "Search", searchRequest{Query: query, Limit: limit}, &resp); err != nil {
		return nil, err
	}
	return resp.Results, nil
}

// GetSeries returns one series by id, with its seasons, movies, specials and
// cast. It returns ErrNotFound when the id is not in the dataset.
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
