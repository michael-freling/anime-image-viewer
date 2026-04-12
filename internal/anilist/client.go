package anilist

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"
)

const defaultEndpoint = "https://graphql.anilist.co"

// Client is the interface for querying AniList. Using an interface allows
// easy mocking in tests.
type Client interface {
	SearchAnime(ctx context.Context, query string, page int, perPage int) ([]MediaSearchResult, error)
	GetAnimeDetail(ctx context.Context, id int) (*MediaDetail, error)
}

// minRequestGap is the minimum duration between consecutive HTTP requests to
// AniList. 2 seconds keeps us well under the 30 req/min rate limit.
const minRequestGap = 2 * time.Second

// HTTPClient is the production implementation that talks to AniList's GraphQL API.
type HTTPClient struct {
	endpoint    string
	httpClient  *http.Client
	mu          sync.Mutex
	lastRequest time.Time
}

// NewHTTPClient creates a new AniList HTTP client.
func NewHTTPClient() *HTTPClient {
	return &HTTPClient{
		endpoint:   defaultEndpoint,
		httpClient: http.DefaultClient,
	}
}

// NewHTTPClientWithEndpoint creates a client pointing at a custom endpoint (for testing).
func NewHTTPClientWithEndpoint(endpoint string) *HTTPClient {
	return &HTTPClient{
		endpoint:   endpoint,
		httpClient: http.DefaultClient,
	}
}

const searchAnimeQuery = `query SearchAnime($search: String!, $page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    media(search: $search, type: ANIME) {
      id
      title { romaji english native }
      format
      status
      season
      seasonYear
      episodes
      coverImage { large medium }
    }
  }
}`

const getAnimeDetailQuery = `query GetAnimeDetail($id: Int!) {
  Media(id: $id, type: ANIME) {
    id
    title { romaji english native }
    format
    status
    season
    seasonYear
    episodes
    coverImage { large medium }
    relations {
      edges {
        relationType(version: 2)
        node {
          id
          title { romaji english native }
          type
          format
          status
          season
          seasonYear
          episodes
        }
      }
    }
    characters(sort: [ROLE, FAVOURITES_DESC], page: 1, perPage: 25) {
      edges {
        role
        node {
          id
          name { full native }
        }
      }
    }
  }
}`

// graphqlRequest is the JSON body sent to the AniList GraphQL API.
type graphqlRequest struct {
	Query     string         `json:"query"`
	Variables map[string]any `json:"variables"`
}

// searchResponse is the raw GraphQL response for a search query.
type searchResponse struct {
	Data struct {
		Page struct {
			Media []MediaSearchResult `json:"media"`
		} `json:"Page"`
	} `json:"data"`
}

// detailResponse is the raw GraphQL response for a detail query.
type detailResponse struct {
	Data struct {
		Media *rawMediaDetail `json:"Media"`
	} `json:"data"`
}

// rawMediaDetail mirrors the GraphQL response shape, which uses edges/node
// for relations and characters.
type rawMediaDetail struct {
	ID         int        `json:"id"`
	Title      MediaTitle `json:"title"`
	Format     string     `json:"format"`
	Status     string     `json:"status"`
	Season     string     `json:"season"`
	SeasonYear int        `json:"seasonYear"`
	Episodes   int        `json:"episodes"`
	CoverImage CoverImage `json:"coverImage"`
	Relations  struct {
		Edges []struct {
			RelationType string `json:"relationType"`
			Node         struct {
				ID         int        `json:"id"`
				Title      MediaTitle `json:"title"`
				Type       string     `json:"type"`
				Format     string     `json:"format"`
				Status     string     `json:"status"`
				Season     string     `json:"season"`
				SeasonYear int        `json:"seasonYear"`
				Episodes   int        `json:"episodes"`
			} `json:"node"`
		} `json:"edges"`
	} `json:"relations"`
	Characters struct {
		Edges []struct {
			Role string `json:"role"`
			Node struct {
				ID   int `json:"id"`
				Name struct {
					Full   string `json:"full"`
					Native string `json:"native"`
				} `json:"name"`
			} `json:"node"`
		} `json:"edges"`
	} `json:"characters"`
}

// SearchAnime searches for anime by name. page is 1-indexed.
func (c *HTTPClient) SearchAnime(ctx context.Context, query string, page int, perPage int) ([]MediaSearchResult, error) {
	reqBody := graphqlRequest{
		Query: searchAnimeQuery,
		Variables: map[string]any{
			"search":  query,
			"page":    page,
			"perPage": perPage,
		},
	}

	body, err := c.doRequest(ctx, reqBody)
	if err != nil {
		return nil, err
	}

	var resp searchResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, fmt.Errorf("anilist: failed to parse search response: %w", err)
	}

	return resp.Data.Page.Media, nil
}

// GetAnimeDetail fetches full details for a single anime by its AniList ID.
func (c *HTTPClient) GetAnimeDetail(ctx context.Context, id int) (*MediaDetail, error) {
	reqBody := graphqlRequest{
		Query: getAnimeDetailQuery,
		Variables: map[string]any{
			"id": id,
		},
	}

	body, err := c.doRequest(ctx, reqBody)
	if err != nil {
		return nil, err
	}

	var resp detailResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, fmt.Errorf("anilist: failed to parse detail response: %w", err)
	}

	if resp.Data.Media == nil {
		return nil, nil
	}

	return convertRawDetail(resp.Data.Media), nil
}

// doRequest sends the GraphQL request and returns the raw response body.
// It enforces a minimum gap between consecutive requests to stay within
// AniList's rate limit.
func (c *HTTPClient) doRequest(ctx context.Context, reqBody graphqlRequest) ([]byte, error) {
	// Throttle: ensure at least minRequestGap between requests.
	c.mu.Lock()
	if !c.lastRequest.IsZero() {
		elapsed := time.Since(c.lastRequest)
		if elapsed < minRequestGap {
			wait := minRequestGap - elapsed
			c.mu.Unlock()
			select {
			case <-time.After(wait):
			case <-ctx.Done():
				return nil, ctx.Err()
			}
			c.mu.Lock()
		}
	}
	c.lastRequest = time.Now()
	c.mu.Unlock()

	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("anilist: failed to marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.endpoint, bytes.NewReader(jsonBody))
	if err != nil {
		return nil, fmt.Errorf("anilist: failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("anilist: request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("anilist: failed to read response body: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("anilist: unexpected status %d: %s", resp.StatusCode, string(body))
	}

	return body, nil
}

// convertRawDetail converts the raw GraphQL response into the MediaDetail type.
func convertRawDetail(raw *rawMediaDetail) *MediaDetail {
	detail := &MediaDetail{
		ID:         raw.ID,
		Title:      raw.Title,
		Format:     raw.Format,
		Status:     raw.Status,
		Season:     raw.Season,
		SeasonYear: raw.SeasonYear,
		Episodes:   raw.Episodes,
		CoverImage: raw.CoverImage,
	}

	for _, edge := range raw.Relations.Edges {
		detail.Relations = append(detail.Relations, MediaRelation{
			RelationType: edge.RelationType,
			ID:           edge.Node.ID,
			Title:        edge.Node.Title,
			Type:         edge.Node.Type,
			Format:       edge.Node.Format,
			Status:       edge.Node.Status,
			Season:       edge.Node.Season,
			SeasonYear:   edge.Node.SeasonYear,
			Episodes:     edge.Node.Episodes,
		})
	}

	for _, edge := range raw.Characters.Edges {
		ch := Character{
			ID:   edge.Node.ID,
			Role: edge.Role,
		}
		ch.Name.Full = edge.Node.Name.Full
		ch.Name.Native = edge.Node.Name.Native
		detail.Characters = append(detail.Characters, ch)
	}

	return detail
}
