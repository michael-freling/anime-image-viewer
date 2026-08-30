package animemetadata

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewHTTPClient(t *testing.T) {
	testCases := []struct {
		name     string
		endpoint string
		want     string
	}{
		{
			name:     "empty endpoint falls back to the default",
			endpoint: "",
			want:     DefaultEndpoint,
		},
		{
			name:     "blank endpoint falls back to the default",
			endpoint: "   ",
			want:     DefaultEndpoint,
		},
		{
			name:     "trailing slashes are trimmed",
			endpoint: "http://localhost:8080/",
			want:     "http://localhost:8080",
		},
		{
			name:     "surrounding whitespace is trimmed",
			endpoint: "  http://localhost:8080  ",
			want:     "http://localhost:8080",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			client := NewHTTPClient(tc.endpoint)
			assert.Equal(t, tc.want, client.endpoint)
		})
	}
}

func TestHTTPClient_Search(t *testing.T) {
	t.Run("returns results and sends a well-formed Connect request", func(t *testing.T) {
		var gotPath, gotContentType, gotLanguage string
		var gotBody searchRequest

		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			gotPath = r.URL.Path
			gotContentType = r.Header.Get("Content-Type")
			gotLanguage = r.Header.Get("Accept-Language")
			body, err := io.ReadAll(r.Body)
			require.NoError(t, err)
			require.NoError(t, json.Unmarshal(body, &gotBody))

			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"results":[
				{"kind":"SERIES","id":"fate-zero","title":"Fate/Zero","franchiseId":"fate"},
				{"kind":"FRANCHISE","id":"fate","title":"Fate"}
			]}`))
		}))
		defer server.Close()

		client := NewHTTPClient(server.URL)
		results, err := client.Search(context.Background(), "fate", 25)
		require.NoError(t, err)

		assert.Equal(t, "/anime.v1.AnimeService/Search", gotPath)
		assert.Equal(t, "application/json", gotContentType)
		assert.Equal(t, "en", gotLanguage)
		assert.Equal(t, searchRequest{Query: "fate", Limit: 25}, gotBody)

		require.Len(t, results, 2)
		assert.Equal(t, SearchResult{
			Kind:        EntryKindSeries,
			ID:          "fate-zero",
			Title:       "Fate/Zero",
			FranchiseID: "fate",
		}, results[0])
		assert.Equal(t, EntryKindFranchise, results[1].Kind)
	})

	t.Run("applies the default limit when non-positive", func(t *testing.T) {
		var gotBody searchRequest
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			body, err := io.ReadAll(r.Body)
			require.NoError(t, err)
			require.NoError(t, json.Unmarshal(body, &gotBody))
			_, _ = w.Write([]byte(`{}`))
		}))
		defer server.Close()

		_, err := NewHTTPClient(server.URL).Search(context.Background(), "fate", 0)
		require.NoError(t, err)
		assert.Equal(t, defaultSearchLimit, gotBody.Limit)
	})

	t.Run("an empty response yields no results", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			_, _ = w.Write([]byte(`{}`))
		}))
		defer server.Close()

		results, err := NewHTTPClient(server.URL).Search(context.Background(), "nothing", 10)
		require.NoError(t, err)
		assert.Empty(t, results)
	})
}

func TestHTTPClient_GetSeries(t *testing.T) {
	t.Run("decodes seasons, movies, specials and cast", func(t *testing.T) {
		var gotBody getSeriesRequest
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			assert.Equal(t, "/anime.v1.AnimeService/GetSeries", r.URL.Path)
			body, err := io.ReadAll(r.Body)
			require.NoError(t, err)
			require.NoError(t, json.Unmarshal(body, &gotBody))

			_, _ = w.Write([]byte(`{"series":{
				"id":"fate-zero",
				"title":"Fate/Zero",
				"seasons":[
					{"id":"fate-zero-s1","number":1,"part":1,"releaseYear":2011,
					 "releaseSeason":"FALL",
					 "externalIds":{"anilistId":10087,"anidbId":8160,"tvdbId":275798},
					 "episodes":[{"absoluteNumber":1,"airedNumber":1}]},
					{"id":"fate-zero-s2","number":1,"part":2,"releaseYear":2012,
					 "releaseSeason":"SPRING","externalIds":{"anilistId":11741}}
				],
				"movies":[
					{"id":"dsm","title":"Mugen Train","releaseYear":2020,
					 "externalIds":{"anilistId":112151},
					 "alternateCutOf":{"seasonId":"demon-slayer-s2"}}
				],
				"specials":[
					{"id":"ova","title":"An OVA","format":"FORMAT_OVA","releaseYear":2013}
				],
				"characters":[
					{"id":"artoria-pendragon","name":"Saber",
					 "externalIds":{"wikidataId":"Q4918886"},
					 "voiceActors":[{"staffId":"ayako-kawasumi","language":"ja","staffName":"Ayako Kawasumi"}],
					 "appearances":[{"seriesId":"fate-zero"}]}
				]
			},"franchiseId":"fate"}`))
		}))
		defer server.Close()

		series, err := NewHTTPClient(server.URL).GetSeries(context.Background(), "fate-zero")
		require.NoError(t, err)
		assert.Equal(t, getSeriesRequest{ID: "fate-zero"}, gotBody)

		assert.Equal(t, "fate-zero", series.ID)
		assert.Equal(t, "Fate/Zero", series.Title)

		require.Len(t, series.Seasons, 2)
		require.NotNil(t, series.Seasons[0].Part)
		assert.Equal(t, 1, series.Seasons[0].Number)
		assert.Equal(t, 1, *series.Seasons[0].Part)
		assert.Equal(t, ReleaseSeasonFall, series.Seasons[0].ReleaseSeason)
		assert.Equal(t, 10087, series.Seasons[0].ExternalIDs.AniListID)
		require.Len(t, series.Seasons[0].Episodes, 1)
		require.NotNil(t, series.Seasons[0].Episodes[0].AbsoluteNumber)
		assert.Equal(t, 1, *series.Seasons[0].Episodes[0].AbsoluteNumber)
		require.NotNil(t, series.Seasons[1].Part)
		assert.Equal(t, 2, *series.Seasons[1].Part)

		require.Len(t, series.Movies, 1)
		assert.Equal(t, "Mugen Train", series.Movies[0].Title)
		require.NotNil(t, series.Movies[0].AlternateCutOf)
		assert.Equal(t, "demon-slayer-s2", series.Movies[0].AlternateCutOf.SeasonID)

		require.Len(t, series.Specials, 1)
		assert.Equal(t, SpecialFormatOVA, series.Specials[0].Format)

		require.Len(t, series.Characters, 1)
		assert.Equal(t, "Saber", series.Characters[0].Name)
		require.Len(t, series.Characters[0].VoiceActors, 1)
		assert.Equal(t, "Ayako Kawasumi", series.Characters[0].VoiceActors[0].StaffName)
	})

	t.Run("a season without a part decodes to nil", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			_, _ = w.Write([]byte(`{"series":{"id":"x","seasons":[{"id":"x-s1","number":1}]}}`))
		}))
		defer server.Close()

		series, err := NewHTTPClient(server.URL).GetSeries(context.Background(), "x")
		require.NoError(t, err)
		require.Len(t, series.Seasons, 1)
		assert.Nil(t, series.Seasons[0].Part)
	})

	t.Run("a not_found error maps to ErrNotFound", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusNotFound)
			_, _ = w.Write([]byte(`{"code":"not_found","message":"series \"nope\" not found"}`))
		}))
		defer server.Close()

		_, err := NewHTTPClient(server.URL).GetSeries(context.Background(), "nope")
		require.Error(t, err)
		assert.ErrorIs(t, err, ErrNotFound)
		assert.Contains(t, err.Error(), `series "nope" not found`)
	})

	t.Run("a null series maps to ErrNotFound", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			_, _ = w.Write([]byte(`{}`))
		}))
		defer server.Close()

		_, err := NewHTTPClient(server.URL).GetSeries(context.Background(), "gone")
		assert.ErrorIs(t, err, ErrNotFound)
	})
}

func TestHTTPClient_Errors(t *testing.T) {
	t.Run("a non-not_found Connect error is surfaced with its code", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(`{"code":"invalid_argument","message":"query is required"}`))
		}))
		defer server.Close()

		_, err := NewHTTPClient(server.URL).Search(context.Background(), "", 10)
		require.Error(t, err)
		assert.NotErrorIs(t, err, ErrNotFound)
		assert.Contains(t, err.Error(), "invalid_argument")
		assert.Contains(t, err.Error(), "query is required")
	})

	t.Run("a non-JSON error body is surfaced with the status code", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusBadGateway)
			_, _ = w.Write([]byte("upstream exploded"))
		}))
		defer server.Close()

		_, err := NewHTTPClient(server.URL).Search(context.Background(), "fate", 10)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "502")
		assert.Contains(t, err.Error(), "upstream exploded")
	})

	t.Run("malformed JSON is reported as a parse failure", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			_, _ = w.Write([]byte(`{"results":`))
		}))
		defer server.Close()

		_, err := NewHTTPClient(server.URL).Search(context.Background(), "fate", 10)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "failed to parse Search response")
	})

	t.Run("an unusable endpoint fails before the request is sent", func(t *testing.T) {
		// A control character cannot appear in a URL, so building the request
		// fails rather than the request itself.
		_, err := NewHTTPClient("http://exa\x7fmple.invalid").Search(context.Background(), "fate", 10)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "failed to create Search request")
	})

	t.Run("a truncated response body is reported as a read failure", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			// Promise more bytes than are written, then return. The server
			// closes the connection short, so the client's read fails.
			w.Header().Set("Content-Length", "512")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"results":`))
		}))
		defer server.Close()

		_, err := NewHTTPClient(server.URL).Search(context.Background(), "fate", 10)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "failed to read Search response")
	})

	t.Run("a transport failure is wrapped", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
		server.Close() // nothing is listening any more

		_, err := NewHTTPClient(server.URL).Search(context.Background(), "fate", 10)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "Search request failed")
	})

	t.Run("a cancelled context aborts the request", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			_, _ = w.Write([]byte(`{}`))
		}))
		defer server.Close()

		ctx, cancel := context.WithCancel(context.Background())
		cancel()

		_, err := NewHTTPClient(server.URL).Search(ctx, "fate", 10)
		require.Error(t, err)
		assert.True(t, errors.Is(err, context.Canceled))
	})
}

// routeByMethod serves a Connect endpoint from a map of RPC method name to
// response body, failing the test on any method it was not given.
func routeByMethod(t *testing.T, bodies map[string]func(req map[string]any) string) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		method := r.URL.Path[strings.LastIndex(r.URL.Path, "/")+1:]
		handler, ok := bodies[method]
		if !ok {
			t.Errorf("unexpected RPC %q", method)
			w.WriteHeader(http.StatusNotImplemented)
			return
		}
		body, err := io.ReadAll(r.Body)
		require.NoError(t, err)
		var req map[string]any
		require.NoError(t, json.Unmarshal(body, &req))
		_, _ = w.Write([]byte(handler(req)))
	}))
}

func TestHTTPClient_SearchPaging(t *testing.T) {
	t.Run("follows page tokens until the limit is filled", func(t *testing.T) {
		var gotLimits []int
		var gotTokens []string
		server := routeByMethod(t, map[string]func(map[string]any) string{
			"Search": func(req map[string]any) string {
				gotLimits = append(gotLimits, int(req["limit"].(float64)))
				token, _ := req["pageToken"].(string)
				gotTokens = append(gotTokens, token)
				if token == "" {
					return `{"results":[
						{"kind":"SERIES","id":"a"},{"kind":"SERIES","id":"b"}
					],"nextPageToken":"p2","totalSize":3}`
				}
				return `{"results":[{"kind":"SERIES","id":"c"}],"totalSize":3}`
			},
		})
		defer server.Close()

		results, err := NewHTTPClient(server.URL).Search(context.Background(), "x", 3)
		require.NoError(t, err)
		require.Len(t, results, 3)
		assert.Equal(t, "c", results[2].ID)

		// The second page asks only for what is still missing.
		assert.Equal(t, []int{3, 1}, gotLimits)
		assert.Equal(t, []string{"", "p2"}, gotTokens)
	})

	t.Run("stops at the limit even if a page overshoots it", func(t *testing.T) {
		server := routeByMethod(t, map[string]func(map[string]any) string{
			"Search": func(map[string]any) string {
				return `{"results":[
					{"kind":"SERIES","id":"a"},{"kind":"SERIES","id":"b"},{"kind":"SERIES","id":"c"}
				],"nextPageToken":"more"}`
			},
		})
		defer server.Close()

		results, err := NewHTTPClient(server.URL).Search(context.Background(), "x", 2)
		require.NoError(t, err)
		assert.Len(t, results, 2)
	})

	t.Run("an empty page ends the walk even with a page token", func(t *testing.T) {
		calls := 0
		server := routeByMethod(t, map[string]func(map[string]any) string{
			"Search": func(map[string]any) string {
				calls++
				return `{"results":[],"nextPageToken":"forever"}`
			},
		})
		defer server.Close()

		results, err := NewHTTPClient(server.URL).Search(context.Background(), "x", 10)
		require.NoError(t, err)
		assert.Empty(t, results)
		assert.Equal(t, 1, calls)
	})

	t.Run("an error on a later page fails the whole search", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			body, err := io.ReadAll(r.Body)
			require.NoError(t, err)
			if !strings.Contains(string(body), "pageToken") {
				_, _ = w.Write([]byte(`{"results":[{"kind":"SERIES","id":"a"}],"nextPageToken":"p2"}`))
				return
			}
			w.WriteHeader(http.StatusInternalServerError)
			_, _ = w.Write([]byte(`{"code":"internal","message":"boom"}`))
		}))
		defer server.Close()

		_, err := NewHTTPClient(server.URL).Search(context.Background(), "x", 10)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "boom")
	})
}

func TestHTTPClient_GetSeriesFillsCappedCollections(t *testing.T) {
	t.Run("pages the cast when it is truncated", func(t *testing.T) {
		var gotSeriesIDs []string
		var gotTokens []string
		server := routeByMethod(t, map[string]func(map[string]any) string{
			"GetSeries": func(map[string]any) string {
				return `{"series":{"id":"slime","title":"Slime",
					"characters":[{"id":"c1","name":"Rimuru"}],"charactersTotal":3}}`
			},
			"ListCharacters": func(req map[string]any) string {
				gotSeriesIDs = append(gotSeriesIDs, req["seriesId"].(string))
				token, _ := req["pageToken"].(string)
				gotTokens = append(gotTokens, token)
				if token == "" {
					return `{"characters":[{"id":"c1","name":"Rimuru"},{"id":"c2","name":"Shion"}],
						"nextPageToken":"p2","totalSize":3}`
				}
				return `{"characters":[{"id":"c3","name":"Shuna"}],"totalSize":3}`
			},
		})
		defer server.Close()

		series, err := NewHTTPClient(server.URL).GetSeries(context.Background(), "slime")
		require.NoError(t, err)

		require.Len(t, series.Characters, 3)
		assert.Equal(t, "Shuna", series.Characters[2].Name)
		assert.Equal(t, []string{"slime", "slime"}, gotSeriesIDs)
		assert.Equal(t, []string{"", "p2"}, gotTokens)
	})

	t.Run("does not page when the embedded cast is complete", func(t *testing.T) {
		server := routeByMethod(t, map[string]func(map[string]any) string{
			// ListCharacters is deliberately absent: calling it fails the test.
			"GetSeries": func(map[string]any) string {
				return `{"series":{"id":"x","characters":[{"id":"c1","name":"A"}],"charactersTotal":1}}`
			},
		})
		defer server.Close()

		series, err := NewHTTPClient(server.URL).GetSeries(context.Background(), "x")
		require.NoError(t, err)
		assert.Len(t, series.Characters, 1)
	})

	t.Run("keeps the embedded cast when paging returns less", func(t *testing.T) {
		server := routeByMethod(t, map[string]func(map[string]any) string{
			"GetSeries": func(map[string]any) string {
				return `{"series":{"id":"x",
					"characters":[{"id":"c1","name":"A"},{"id":"c2","name":"B"}],"charactersTotal":9}}`
			},
			"ListCharacters": func(map[string]any) string {
				return `{"characters":[{"id":"c1","name":"A"}],"totalSize":9}`
			},
		})
		defer server.Close()

		series, err := NewHTTPClient(server.URL).GetSeries(context.Background(), "x")
		require.NoError(t, err)
		assert.Len(t, series.Characters, 2)
	})

	t.Run("a paging failure fails the call", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if strings.HasSuffix(r.URL.Path, "GetSeries") {
				_, _ = w.Write([]byte(`{"series":{"id":"x","characters":[],"charactersTotal":5}}`))
				return
			}
			w.WriteHeader(http.StatusInternalServerError)
			_, _ = w.Write([]byte(`{"code":"internal","message":"cast unavailable"}`))
		}))
		defer server.Close()

		_, err := NewHTTPClient(server.URL).GetSeries(context.Background(), "x")
		require.Error(t, err)
		assert.Contains(t, err.Error(), `ListCharacters("x")`)
		assert.Contains(t, err.Error(), "cast unavailable")
	})

	t.Run("appends the works that did not fit, keeping the embedded ones", func(t *testing.T) {
		server := routeByMethod(t, map[string]func(map[string]any) string{
			"GetSeries": func(map[string]any) string {
				return `{"series":{"id":"x",
					"seasons":[{"id":"x-s1","number":1,"part":1,"releaseSeason":"WINTER"}],"seasonsTotal":2,
					"movies":[],"moviesTotal":1,
					"specials":[],"specialsTotal":1}}`
			},
			"ListWorks": func(req map[string]any) string {
				assert.Equal(t, "x", req["seriesId"])
				return `{"works":[
					{"kind":"WORK_SEASON","id":"x-s1","number":1},
					{"kind":"WORK_SEASON","id":"x-s2","title":"Second","number":2,
					 "releaseYear":2024,"releaseSeason":"FALL","episodeCount":12,
					 "externalIds":{"anilistId":42}},
					{"kind":"WORK_MOVIE","id":"x-m1","title":"A Movie","releaseYear":2025},
					{"kind":"WORK_SPECIAL","id":"x-ova","title":"An OVA","format":"FORMAT_OVA"},
					{"kind":"WORK_UNSPECIFIED","id":"x-huh"},
					{"kind":"WORK_SEASON","id":""}
				],"totalSize":4}`
			},
		})
		defer server.Close()

		series, err := NewHTTPClient(server.URL).GetSeries(context.Background(), "x")
		require.NoError(t, err)

		// The embedded season is kept whole — including Part, which the
		// flattened WorkSummary does not carry — and is not duplicated.
		require.Len(t, series.Seasons, 2)
		require.NotNil(t, series.Seasons[0].Part)
		assert.Equal(t, 1, *series.Seasons[0].Part)
		assert.Equal(t, "x-s2", series.Seasons[1].ID)
		assert.Equal(t, "Second", series.Seasons[1].Title)
		assert.Equal(t, ReleaseSeasonFall, series.Seasons[1].ReleaseSeason)
		assert.Equal(t, 12, series.Seasons[1].EpisodesTotal)
		assert.Equal(t, 42, series.Seasons[1].ExternalIDs.AniListID)
		assert.Nil(t, series.Seasons[1].Part)

		require.Len(t, series.Movies, 1)
		assert.Equal(t, "A Movie", series.Movies[0].Title)
		require.Len(t, series.Specials, 1)
		assert.Equal(t, SpecialFormatOVA, series.Specials[0].Format)
	})

	t.Run("does not page works when every collection is complete", func(t *testing.T) {
		server := routeByMethod(t, map[string]func(map[string]any) string{
			// ListWorks is deliberately absent: calling it fails the test.
			"GetSeries": func(map[string]any) string {
				return `{"series":{"id":"x","seasons":[{"id":"x-s1"}],"seasonsTotal":1}}`
			},
		})
		defer server.Close()

		series, err := NewHTTPClient(server.URL).GetSeries(context.Background(), "x")
		require.NoError(t, err)
		assert.Len(t, series.Seasons, 1)
	})

	t.Run("a works paging failure fails the call", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if strings.HasSuffix(r.URL.Path, "GetSeries") {
				_, _ = w.Write([]byte(`{"series":{"id":"x","seasons":[],"seasonsTotal":5}}`))
				return
			}
			w.WriteHeader(http.StatusInternalServerError)
			_, _ = w.Write([]byte(`{"code":"internal","message":"works unavailable"}`))
		}))
		defer server.Close()

		_, err := NewHTTPClient(server.URL).GetSeries(context.Background(), "x")
		require.Error(t, err)
		assert.Contains(t, err.Error(), `ListWorks("x")`)
	})

	t.Run("an empty works page ends the walk even with a page token", func(t *testing.T) {
		calls := 0
		server := routeByMethod(t, map[string]func(map[string]any) string{
			"GetSeries": func(map[string]any) string {
				return `{"series":{"id":"x","seasons":[],"seasonsTotal":5}}`
			},
			"ListWorks": func(map[string]any) string {
				calls++
				return `{"works":[],"nextPageToken":"forever"}`
			},
		})
		defer server.Close()

		series, err := NewHTTPClient(server.URL).GetSeries(context.Background(), "x")
		require.NoError(t, err)
		assert.Empty(t, series.Seasons)
		assert.Equal(t, 1, calls)
	})
}
