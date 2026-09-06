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

func TestHTTPClient_SearchSeries(t *testing.T) {
	t.Run("returns results and sends a well-formed Connect request", func(t *testing.T) {
		var gotPath, gotContentType, gotLanguage string
		var gotBody searchSeriesRequest

		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			gotPath = r.URL.Path
			gotContentType = r.Header.Get("Content-Type")
			gotLanguage = r.Header.Get("Accept-Language")
			body, err := io.ReadAll(r.Body)
			require.NoError(t, err)
			require.NoError(t, json.Unmarshal(body, &gotBody))

			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"series":[
				{"id":"fate-stay-night","title":"Fate/stay night","franchiseId":"fate",
				 "firstReleaseYear":2006,"latestReleaseYear":2017,"works":3,"episodes":36},
				{"id":"demon-slayer","title":"Demon Slayer"}
			],"totalSize":2}`))
		}))
		defer server.Close()

		client := NewHTTPClient(server.URL)
		results, err := client.SearchSeries(context.Background(), "fate", 25)
		require.NoError(t, err)

		assert.Equal(t, "/anime.v1.AnimeService/SearchSeries", gotPath)
		assert.Equal(t, "application/json", gotContentType)
		assert.Equal(t, "en", gotLanguage)
		assert.Equal(t, searchSeriesRequest{Query: "fate", Limit: 25}, gotBody)

		require.Len(t, results, 2)
		assert.Equal(t, SeriesSummary{
			ID:                "fate-stay-night",
			Title:             "Fate/stay night",
			FranchiseID:       "fate",
			FirstReleaseYear:  2006,
			LatestReleaseYear: 2017,
			Works:             3,
			Episodes:          36,
		}, results[0])

		// A series that stands alone carries no franchise and no year span.
		assert.Equal(t, SeriesSummary{ID: "demon-slayer", Title: "Demon Slayer"}, results[1])
	})

	t.Run("applies the default limit when non-positive", func(t *testing.T) {
		var gotBody searchSeriesRequest
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			body, err := io.ReadAll(r.Body)
			require.NoError(t, err)
			require.NoError(t, json.Unmarshal(body, &gotBody))
			_, _ = w.Write([]byte(`{}`))
		}))
		defer server.Close()

		_, err := NewHTTPClient(server.URL).SearchSeries(context.Background(), "fate", 0)
		require.NoError(t, err)
		assert.Equal(t, defaultSearchLimit, gotBody.Limit)
	})

	t.Run("an empty query is sent as-is to walk the catalogue", func(t *testing.T) {
		var gotBody searchSeriesRequest
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			body, err := io.ReadAll(r.Body)
			require.NoError(t, err)
			require.NoError(t, json.Unmarshal(body, &gotBody))
			_, _ = w.Write([]byte(`{"series":[{"id":"a"}],"totalSize":152}`))
		}))
		defer server.Close()

		results, err := NewHTTPClient(server.URL).SearchSeries(context.Background(), "", 1)
		require.NoError(t, err)
		assert.Equal(t, "", gotBody.Query)
		assert.Len(t, results, 1)
	})

	t.Run("an empty response yields no results", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			_, _ = w.Write([]byte(`{}`))
		}))
		defer server.Close()

		results, err := NewHTTPClient(server.URL).SearchSeries(context.Background(), "nothing", 10)
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
					 "voiceActors":[{"staffId":"ayako-kawasumi","language":"ja","staffName":"Ayako Kawasumi","throughout":true}],
					 "appearances":[
						{"seriesId":"fate-stay-night","seriesTitle":"Fate/stay night",
						 "scope":[{"seasonId":"fate-stay-night-s2","number":2}]},
						{"seriesId":"fate-zero","seriesTitle":"Fate/Zero"}
					 ]}
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
		assert.Equal(t, 1, series.Seasons[0].Episodes[0].AiredNumber)
		require.NotNil(t, series.Seasons[1].Part)
		assert.Equal(t, 2, *series.Seasons[1].Part)

		require.Len(t, series.Movies, 1)
		assert.Equal(t, "Mugen Train", series.Movies[0].Title)
		require.NotNil(t, series.Movies[0].AlternateCutOf)
		assert.Equal(t, "demon-slayer-s2", series.Movies[0].AlternateCutOf.SeasonID)

		require.Len(t, series.Specials, 1)
		assert.Equal(t, SpecialFormatOVA, series.Specials[0].Format)

		require.Len(t, series.Characters, 1)
		character := series.Characters[0]
		assert.Equal(t, "Saber", character.Name)
		require.Len(t, character.VoiceActors, 1)
		assert.Equal(t, "Ayako Kawasumi", character.VoiceActors[0].StaffName)

		// A character is the global node, so it names the other series it
		// appears in. The per-appearance detail the API sends alongside —
		// scope and cast — is deliberately not modelled, and decoding must
		// simply ignore it rather than fail.
		require.Len(t, character.Appearances, 2)
		assert.Equal(t, "fate-stay-night", character.Appearances[0].SeriesID)
		assert.Equal(t, "fate-zero", character.Appearances[1].SeriesID)
	})

	t.Run("the series is returned in one call", func(t *testing.T) {
		// The API used to embed a capped first page of each collection, which
		// this client topped up through companion List RPCs. Those RPCs no
		// longer exist upstream, so calling one would 404 rather than truncate
		// quietly: GetSeries must be a single round trip.
		var methods []string
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			methods = append(methods, r.URL.Path[strings.LastIndex(r.URL.Path, "/")+1:])
			_, _ = w.Write([]byte(`{"series":{"id":"x","title":"X",
				"seasons":[{"id":"x-s1","number":1}],
				"characters":[{"id":"c1","name":"One"},{"id":"c2","name":"Two"}]}}`))
		}))
		defer server.Close()

		series, err := NewHTTPClient(server.URL).GetSeries(context.Background(), "x")
		require.NoError(t, err)
		assert.Equal(t, []string{"GetSeries"}, methods)
		assert.Len(t, series.Characters, 2)
		assert.Len(t, series.Seasons, 1)
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

		_, err := NewHTTPClient(server.URL).SearchSeries(context.Background(), "", 10)
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

		_, err := NewHTTPClient(server.URL).SearchSeries(context.Background(), "fate", 10)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "502")
		assert.Contains(t, err.Error(), "upstream exploded")
	})

	t.Run("malformed JSON is reported as a parse failure", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			_, _ = w.Write([]byte(`{"series":`))
		}))
		defer server.Close()

		_, err := NewHTTPClient(server.URL).SearchSeries(context.Background(), "fate", 10)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "failed to parse SearchSeries response")
	})

	t.Run("an unusable endpoint fails before the request is sent", func(t *testing.T) {
		// A control character cannot appear in a URL, so building the request
		// fails rather than the request itself.
		_, err := NewHTTPClient("http://exa\x7fmple.invalid").SearchSeries(context.Background(), "fate", 10)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "failed to create SearchSeries request")
	})

	t.Run("a truncated response body is reported as a read failure", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			// Promise more bytes than are written, then return. The server
			// closes the connection short, so the client's read fails.
			w.Header().Set("Content-Length", "512")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"series":`))
		}))
		defer server.Close()

		_, err := NewHTTPClient(server.URL).SearchSeries(context.Background(), "fate", 10)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "failed to read SearchSeries response")
	})

	t.Run("a transport failure is wrapped", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
		server.Close() // nothing is listening any more

		_, err := NewHTTPClient(server.URL).SearchSeries(context.Background(), "fate", 10)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "SearchSeries request failed")
	})

	t.Run("a cancelled context aborts the request", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			_, _ = w.Write([]byte(`{}`))
		}))
		defer server.Close()

		ctx, cancel := context.WithCancel(context.Background())
		cancel()

		_, err := NewHTTPClient(server.URL).SearchSeries(ctx, "fate", 10)
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

func TestHTTPClient_SearchSeriesPaging(t *testing.T) {
	t.Run("follows page tokens until the limit is filled", func(t *testing.T) {
		var gotLimits []int
		var gotTokens []string
		server := routeByMethod(t, map[string]func(map[string]any) string{
			"SearchSeries": func(req map[string]any) string {
				gotLimits = append(gotLimits, int(req["limit"].(float64)))
				token, _ := req["pageToken"].(string)
				gotTokens = append(gotTokens, token)
				if token == "" {
					return `{"series":[{"id":"a"},{"id":"b"}],"nextPageToken":"p2","totalSize":3}`
				}
				return `{"series":[{"id":"c"}],"totalSize":3}`
			},
		})
		defer server.Close()

		results, err := NewHTTPClient(server.URL).SearchSeries(context.Background(), "x", 3)
		require.NoError(t, err)
		require.Len(t, results, 3)
		assert.Equal(t, "c", results[2].ID)

		// The second page asks only for what is still missing.
		assert.Equal(t, []int{3, 1}, gotLimits)
		assert.Equal(t, []string{"", "p2"}, gotTokens)
	})

	t.Run("stops at the limit even if a page overshoots it", func(t *testing.T) {
		server := routeByMethod(t, map[string]func(map[string]any) string{
			"SearchSeries": func(map[string]any) string {
				return `{"series":[{"id":"a"},{"id":"b"},{"id":"c"}],"nextPageToken":"more"}`
			},
		})
		defer server.Close()

		results, err := NewHTTPClient(server.URL).SearchSeries(context.Background(), "x", 2)
		require.NoError(t, err)
		assert.Len(t, results, 2)
	})

	t.Run("an empty page ends the walk even with a page token", func(t *testing.T) {
		calls := 0
		server := routeByMethod(t, map[string]func(map[string]any) string{
			"SearchSeries": func(map[string]any) string {
				calls++
				return `{"series":[],"nextPageToken":"forever"}`
			},
		})
		defer server.Close()

		results, err := NewHTTPClient(server.URL).SearchSeries(context.Background(), "x", 10)
		require.NoError(t, err)
		assert.Empty(t, results)
		assert.Equal(t, 1, calls)
	})

	t.Run("an error on a later page fails the whole search", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			body, err := io.ReadAll(r.Body)
			require.NoError(t, err)
			if !strings.Contains(string(body), "pageToken") {
				_, _ = w.Write([]byte(`{"series":[{"id":"a"}],"nextPageToken":"p2"}`))
				return
			}
			w.WriteHeader(http.StatusInternalServerError)
			_, _ = w.Write([]byte(`{"code":"internal","message":"boom"}`))
		}))
		defer server.Close()

		_, err := NewHTTPClient(server.URL).SearchSeries(context.Background(), "x", 10)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "boom")
	})
}
