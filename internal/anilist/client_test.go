package anilist

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSearchAnime(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPost, r.Method)
		assert.Equal(t, "application/json", r.Header.Get("Content-Type"))

		var req graphqlRequest
		err := json.NewDecoder(r.Body).Decode(&req)
		require.NoError(t, err)
		assert.Equal(t, "bocchi", req.Variables["search"])
		assert.Equal(t, float64(1), req.Variables["page"])
		assert.Equal(t, float64(10), req.Variables["perPage"])

		resp := map[string]any{
			"data": map[string]any{
				"Page": map[string]any{
					"media": []map[string]any{
						{
							"id": 130003,
							"title": map[string]any{
								"romaji":  "Bocchi the Rock!",
								"english": "Bocchi the Rock!",
								"native":  "ぼっち・ざ・ろっく！",
							},
							"format":     "TV",
							"status":     "FINISHED",
							"season":     "FALL",
							"seasonYear": 2022,
							"episodes":   12,
							"coverImage": map[string]any{
								"large":  "https://example.com/large.jpg",
								"medium": "https://example.com/medium.jpg",
							},
						},
						{
							"id": 999999,
							"title": map[string]any{
								"romaji":  "Bocchi the Rock! Movie",
								"english": "Bocchi the Rock! Re:",
								"native":  "劇場版ぼっち・ざ・ろっく！",
							},
							"format":     "MOVIE",
							"status":     "NOT_YET_RELEASED",
							"season":     "SUMMER",
							"seasonYear": 2025,
							"episodes":   1,
							"coverImage": map[string]any{
								"large":  "https://example.com/movie_large.jpg",
								"medium": "https://example.com/movie_medium.jpg",
							},
						},
					},
				},
			},
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client := NewHTTPClientWithEndpoint(server.URL)
	results, err := client.SearchAnime(context.Background(), "bocchi", 1, 10)
	require.NoError(t, err)
	require.Len(t, results, 2)

	// First result
	assert.Equal(t, 130003, results[0].ID)
	assert.Equal(t, "Bocchi the Rock!", results[0].Title.Romaji)
	assert.Equal(t, "Bocchi the Rock!", results[0].Title.English)
	assert.Equal(t, "ぼっち・ざ・ろっく！", results[0].Title.Native)
	assert.Equal(t, "TV", results[0].Format)
	assert.Equal(t, "FINISHED", results[0].Status)
	assert.Equal(t, "FALL", results[0].Season)
	assert.Equal(t, 2022, results[0].SeasonYear)
	assert.Equal(t, 12, results[0].Episodes)
	assert.Equal(t, "https://example.com/large.jpg", results[0].CoverImage.Large)
	assert.Equal(t, "https://example.com/medium.jpg", results[0].CoverImage.Medium)

	// Second result
	assert.Equal(t, 999999, results[1].ID)
	assert.Equal(t, "Bocchi the Rock! Movie", results[1].Title.Romaji)
	assert.Equal(t, "MOVIE", results[1].Format)
	assert.Equal(t, "NOT_YET_RELEASED", results[1].Status)
	assert.Equal(t, "SUMMER", results[1].Season)
	assert.Equal(t, 2025, results[1].SeasonYear)
	assert.Equal(t, 1, results[1].Episodes)
}

func TestGetAnimeDetail(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req graphqlRequest
		err := json.NewDecoder(r.Body).Decode(&req)
		require.NoError(t, err)
		assert.Equal(t, float64(130003), req.Variables["id"])

		resp := map[string]any{
			"data": map[string]any{
				"Media": map[string]any{
					"id": 130003,
					"title": map[string]any{
						"romaji":  "Bocchi the Rock!",
						"english": "Bocchi the Rock!",
						"native":  "ぼっち・ざ・ろっく！",
					},
					"format":     "TV",
					"status":     "FINISHED",
					"season":     "FALL",
					"seasonYear": 2022,
					"episodes":   12,
					"coverImage": map[string]any{
						"large":  "https://example.com/large.jpg",
						"medium": "https://example.com/medium.jpg",
					},
					"relations": map[string]any{
						"edges": []map[string]any{
							{
								"relationType": "SEQUEL",
								"node": map[string]any{
									"id": 170010,
									"title": map[string]any{
										"romaji":  "Bocchi the Rock! 2nd Season",
										"english": "Bocchi the Rock! Season 2",
										"native":  "ぼっち・ざ・ろっく！ 2期",
									},
									"type":       "ANIME",
									"format":     "TV",
									"status":     "NOT_YET_RELEASED",
									"season":     "WINTER",
									"seasonYear": 2026,
									"episodes":   12,
								},
							},
							{
								"relationType": "SIDE_STORY",
								"node": map[string]any{
									"id": 180050,
									"title": map[string]any{
										"romaji":  "Bocchi the Rock! OVA",
										"english": "",
										"native":  "ぼっち・ざ・ろっく！ OVA",
									},
									"type":       "ANIME",
									"format":     "OVA",
									"status":     "FINISHED",
									"season":     "",
									"seasonYear": 0,
									"episodes":   1,
								},
							},
						},
					},
					"characters": map[string]any{
						"edges": []map[string]any{
							{
								"role": "MAIN",
								"node": map[string]any{
									"id": 200001,
									"name": map[string]any{
										"full":   "Hitori Gotou",
										"native": "後藤 ひとり",
									},
								},
							},
							{
								"role": "SUPPORTING",
								"node": map[string]any{
									"id": 200002,
									"name": map[string]any{
										"full":   "Nijika Ijichi",
										"native": "伊地知 虹夏",
									},
								},
							},
						},
					},
				},
			},
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client := NewHTTPClientWithEndpoint(server.URL)
	detail, err := client.GetAnimeDetail(context.Background(), 130003)
	require.NoError(t, err)
	require.NotNil(t, detail)

	// Verify base fields
	assert.Equal(t, 130003, detail.ID)
	assert.Equal(t, "Bocchi the Rock!", detail.Title.Romaji)
	assert.Equal(t, "TV", detail.Format)
	assert.Equal(t, "FINISHED", detail.Status)
	assert.Equal(t, "FALL", detail.Season)
	assert.Equal(t, 2022, detail.SeasonYear)
	assert.Equal(t, 12, detail.Episodes)
	assert.Equal(t, "https://example.com/large.jpg", detail.CoverImage.Large)

	// Verify relations
	require.Len(t, detail.Relations, 2)

	assert.Equal(t, "SEQUEL", detail.Relations[0].RelationType)
	assert.Equal(t, 170010, detail.Relations[0].ID)
	assert.Equal(t, "Bocchi the Rock! 2nd Season", detail.Relations[0].Title.Romaji)
	assert.Equal(t, "ANIME", detail.Relations[0].Type)
	assert.Equal(t, "TV", detail.Relations[0].Format)
	assert.Equal(t, "NOT_YET_RELEASED", detail.Relations[0].Status)
	assert.Equal(t, "WINTER", detail.Relations[0].Season)
	assert.Equal(t, 2026, detail.Relations[0].SeasonYear)
	assert.Equal(t, 12, detail.Relations[0].Episodes)

	assert.Equal(t, "SIDE_STORY", detail.Relations[1].RelationType)
	assert.Equal(t, 180050, detail.Relations[1].ID)
	assert.Equal(t, "OVA", detail.Relations[1].Format)
	assert.Equal(t, 1, detail.Relations[1].Episodes)

	// Verify characters
	require.Len(t, detail.Characters, 2)

	assert.Equal(t, 200001, detail.Characters[0].ID)
	assert.Equal(t, "Hitori Gotou", detail.Characters[0].Name.Full)
	assert.Equal(t, "後藤 ひとり", detail.Characters[0].Name.Native)
	assert.Equal(t, "MAIN", detail.Characters[0].Role)

	assert.Equal(t, 200002, detail.Characters[1].ID)
	assert.Equal(t, "Nijika Ijichi", detail.Characters[1].Name.Full)
	assert.Equal(t, "伊地知 虹夏", detail.Characters[1].Name.Native)
	assert.Equal(t, "SUPPORTING", detail.Characters[1].Role)
}

func TestSearchAnime_HTTPError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
		w.Write([]byte(`{"message":"rate limited"}`))
	}))
	defer server.Close()

	client := NewHTTPClientWithEndpoint(server.URL)
	results, err := client.SearchAnime(context.Background(), "test", 1, 10)
	require.Error(t, err)
	assert.Nil(t, results)
	assert.Contains(t, err.Error(), "429")
}

func TestGetAnimeDetail_NotFound(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := map[string]any{
			"data": map[string]any{
				"Media": nil,
			},
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client := NewHTTPClientWithEndpoint(server.URL)
	detail, err := client.GetAnimeDetail(context.Background(), 9999999)
	require.NoError(t, err)
	assert.Nil(t, detail)
}
