package animemetadata

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
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
				{"kind":"ENTRY_KIND_SERIES","id":"fate-zero","title":"Fate/Zero","franchiseId":"fate"},
				{"kind":"ENTRY_KIND_FRANCHISE","id":"fate","title":"Fate"}
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
					 "releaseSeason":"RELEASE_SEASON_FALL",
					 "externalIds":{"anilistId":10087,"anidbId":8160,"tvdbId":275798},
					 "episodes":[{"absoluteNumber":1,"airedNumber":1}]},
					{"id":"fate-zero-s2","number":1,"part":2,"releaseYear":2012,
					 "releaseSeason":"RELEASE_SEASON_SPRING","externalIds":{"anilistId":11741}}
				],
				"movies":[
					{"id":"dsm","title":"Mugen Train","releaseYear":2020,
					 "externalIds":{"anilistId":112151},
					 "alternateCutOf":{"seasonId":"demon-slayer-s2"}}
				],
				"specials":[
					{"id":"ova","title":"An OVA","format":"SPECIAL_FORMAT_OVA","releaseYear":2013}
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
