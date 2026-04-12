package anime

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"github.com/michael-freling/anime-image-viewer/internal/anilist"
	"github.com/michael-freling/anime-image-viewer/internal/db"
)

// AniListImportResult summarises what was created during an AniList import.
type AniListImportResult struct {
	EntriesCreated    int `json:"entriesCreated"`
	CharactersCreated int `json:"charactersCreated"`
}

// SearchAniList proxies a search request to the AniList client.
func (s *Service) SearchAniList(ctx context.Context, query string) ([]anilist.MediaSearchResult, error) {
	if s.anilistClient == nil {
		return nil, fmt.Errorf("anilist client is not configured")
	}
	return s.anilistClient.SearchAnime(ctx, query, 1, 10)
}

// LinkAniList sets the AniListID on an anime record without performing a full
// import. It verifies the anime exists first.
func (s *Service) LinkAniList(ctx context.Context, animeID uint, aniListID int) error {
	if s.anilistClient == nil {
		return fmt.Errorf("anilist client is not configured")
	}

	row, err := s.dbClient.Anime().FindByValue(ctx, &db.Anime{ID: animeID})
	if err != nil {
		if err == db.ErrRecordNotFound {
			return fmt.Errorf("%w: id %d", ErrAnimeNotFound, animeID)
		}
		return err
	}

	row.AniListID = &aniListID
	return s.dbClient.Anime().Update(ctx, &row)
}

// ImportFromAniList fetches detail from AniList, follows the SEQUEL/PREQUEL
// chain to discover all seasons, and creates entries (seasons, movies) and
// character tags for the given anime. Characters are deduplicated across all
// entries in the chain.
func (s *Service) ImportFromAniList(ctx context.Context, animeID uint, aniListID int) (*AniListImportResult, error) {
	if s.anilistClient == nil {
		return nil, fmt.Errorf("anilist client is not configured")
	}

	// Verify the anime exists.
	_, err := s.Read(ctx, animeID)
	if err != nil {
		return nil, err
	}

	// 1. Fetch the full series chain by following SEQUEL/PREQUEL relations.
	seriesEntries, movieRelations, err := s.fetchSeriesChain(ctx, aniListID)
	if err != nil {
		return nil, fmt.Errorf("fetchSeriesChain: %w", err)
	}
	if len(seriesEntries) == 0 {
		return nil, fmt.Errorf("anilist: no detail found for id %d", aniListID)
	}

	result := &AniListImportResult{}

	// 2. Link the anime to AniList by setting AniListID on the db.Anime record.
	if err := s.LinkAniList(ctx, animeID, aniListID); err != nil {
		return nil, fmt.Errorf("LinkAniList: %w", err)
	}

	// 3. Build a map of existing season entries so we can skip duplicates and
	//    update airing info on pre-existing seasons.
	existingEntries, err := s.GetAnimeEntries(animeID)
	if err != nil {
		return nil, fmt.Errorf("GetAnimeEntries: %w", err)
	}
	existingSeasonsByNum := make(map[uint]AnimeEntry)
	for _, e := range existingEntries {
		if e.EntryType == db.EntryTypeSeason && e.EntryNumber != nil {
			existingSeasonsByNum[*e.EntryNumber] = e
		}
	}

	// 4. Create season entries from the chain (sorted by seasonYear).
	for i, entry := range seriesEntries {
		seasonNum := uint(i + 1)

		if existing, ok := existingSeasonsByNum[seasonNum]; ok {
			// Season already exists — just update its airing info.
			if err := s.updateEntryAiringInfo(ctx, existing.ID, entry.Season, entry.SeasonYear); err != nil {
				return nil, fmt.Errorf("updateEntryAiringInfo for existing season %d: %w", seasonNum, err)
			}
			continue
		}

		created, err := s.CreateEntry(ctx, animeID, db.EntryTypeSeason, &seasonNum, fmt.Sprintf("Season %d", seasonNum))
		if err != nil {
			if isUniqueViolation(err) || strings.Contains(err.Error(), "already exists") {
				continue
			}
			return nil, fmt.Errorf("CreateEntry season %d: %w", seasonNum, err)
		}
		result.EntriesCreated++
		if err := s.updateEntryAiringInfo(ctx, created.ID, entry.Season, entry.SeasonYear); err != nil {
			return nil, fmt.Errorf("updateEntryAiringInfo for season %d: %w", seasonNum, err)
		}
	}

	// 5. Create movie entries from movie relations found across the chain.
	for _, rel := range movieRelations {
		displayName := relationDisplayName(rel)
		var year *uint
		if rel.SeasonYear > 0 {
			y := uint(rel.SeasonYear)
			year = &y
		}
		_, err := s.CreateEntry(ctx, animeID, db.EntryTypeMovie, year, displayName)
		if err != nil {
			if isUniqueViolation(err) || strings.Contains(err.Error(), "already exists") {
				continue
			}
			return nil, fmt.Errorf("CreateEntry movie for %d: %w", rel.ID, err)
		}
		result.EntriesCreated++
	}

	// 6. Collect ALL characters from ALL fetched entries, deduplicate by name.
	allCharacters := collectUniqueCharacters(seriesEntries)

	existingTags, err := s.dbClient.Tag().FindTagsByAnimeID(animeID)
	if err != nil {
		return nil, fmt.Errorf("Tag.FindTagsByAnimeID: %w", err)
	}
	existingNames := make(map[string]bool, len(existingTags))
	for _, t := range existingTags {
		existingNames[t.Name] = true
	}

	for _, ch := range allCharacters {
		if existingNames[ch.Name.Full] {
			continue
		}

		aid := animeID
		tag := db.Tag{
			Name:     ch.Name.Full,
			Category: "character",
			AnimeID:  &aid,
		}
		if err := s.dbClient.Tag().Create(ctx, &tag); err != nil {
			if isUniqueViolation(err) {
				continue
			}
			return nil, fmt.Errorf("Tag.Create for character %q: %w", ch.Name.Full, err)
		}
		existingNames[ch.Name.Full] = true
		result.CharactersCreated++
	}

	return result, nil
}

// fetchSeriesChain follows SEQUEL and PREQUEL relations from the starting
// entry to discover all seasons in the series via BFS. It returns:
//   - a list of MediaDetail entries sorted by seasonYear (then by ID) representing seasons
//   - a list of MOVIE relations found across all entries in the chain
func (s *Service) fetchSeriesChain(ctx context.Context, startID int) ([]*anilist.MediaDetail, []anilist.MediaRelation, error) {
	visited := map[int]bool{}
	var seasonEntries []*anilist.MediaDetail
	var movieRelations []anilist.MediaRelation
	seenMovies := map[int]bool{}
	queue := []int{startID}

	for len(queue) > 0 {
		id := queue[0]
		queue = queue[1:]
		if visited[id] {
			continue
		}
		visited[id] = true

		detail, err := s.anilistClient.GetAnimeDetail(ctx, id)
		if err != nil {
			return nil, nil, fmt.Errorf("anilist.GetAnimeDetail(%d): %w", id, err)
		}
		if detail == nil {
			continue
		}

		seasonEntries = append(seasonEntries, detail)

		for _, rel := range detail.Relations {
			if rel.Type != "ANIME" {
				continue
			}

			// Follow TV-format SEQUEL/PREQUEL to find more seasons.
			if isSeasonFormat(rel.Format) && (rel.RelationType == "SEQUEL" || rel.RelationType == "PREQUEL") {
				if !visited[rel.ID] {
					queue = append(queue, rel.ID)
				}
			}

			// Collect MOVIE relations (don't follow them in the chain).
			if rel.Format == "MOVIE" && isMovieRelationType(rel.RelationType) && !seenMovies[rel.ID] {
				seenMovies[rel.ID] = true
				movieRelations = append(movieRelations, rel)
			}
		}
	}

	// Sort seasons by seasonYear, then by AniList ID as tiebreaker.
	sort.Slice(seasonEntries, func(i, j int) bool {
		if seasonEntries[i].SeasonYear != seasonEntries[j].SeasonYear {
			return seasonEntries[i].SeasonYear < seasonEntries[j].SeasonYear
		}
		return seasonEntries[i].ID < seasonEntries[j].ID
	})

	return seasonEntries, movieRelations, nil
}

// collectUniqueCharacters gathers characters from all entries and deduplicates
// by Name.Full. Only MAIN and SUPPORTING roles are included.
func collectUniqueCharacters(entries []*anilist.MediaDetail) []anilist.Character {
	seen := map[string]bool{}
	var result []anilist.Character
	for _, entry := range entries {
		for _, ch := range entry.Characters {
			if ch.Role != "MAIN" && ch.Role != "SUPPORTING" {
				continue
			}
			if ch.Name.Full == "" {
				continue
			}
			if seen[ch.Name.Full] {
				continue
			}
			seen[ch.Name.Full] = true
			result = append(result, ch)
		}
	}
	return result
}

// updateEntryAiringInfo sets AiringSeason and AiringYear on a file entry.
func (s *Service) updateEntryAiringInfo(ctx context.Context, fileID uint, season string, seasonYear int) error {
	airingSeason := anilistSeasonToDBSeason(season)
	var airingYear *uint
	if seasonYear > 0 {
		y := uint(seasonYear)
		airingYear = &y
	}
	return s.dbClient.File().UpdateAiringFields(ctx, fileID, airingSeason, airingYear)
}

// anilistSeasonToDBSeason maps AniList season strings to DB constants.
// AniList uses the same strings (WINTER, SPRING, SUMMER, FALL) so this is
// mostly a pass-through with validation.
func anilistSeasonToDBSeason(season string) string {
	switch season {
	case "WINTER":
		return db.AiringSeasonWinter
	case "SPRING":
		return db.AiringSeasonSpring
	case "SUMMER":
		return db.AiringSeasonSummer
	case "FALL":
		return db.AiringSeasonFall
	default:
		return ""
	}
}

// isSeasonFormat returns true if the AniList format indicates a TV-style
// season entry.
func isSeasonFormat(format string) bool {
	return format == "TV" || format == "TV_SHORT" || format == "ONA"
}

// isMovieRelationType returns true if the relation type is one we import as
// a movie entry.
func isMovieRelationType(relationType string) bool {
	return relationType == "SEQUEL" || relationType == "SIDE_STORY" || relationType == "PARENT"
}

// relationDisplayName picks the best display name from a relation's title.
func relationDisplayName(rel anilist.MediaRelation) string {
	if rel.Title.English != "" {
		return rel.Title.English
	}
	return rel.Title.Romaji
}
