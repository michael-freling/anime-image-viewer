package anime

import (
	"context"
	"fmt"
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

// ImportFromAniList fetches detail from AniList and creates entries (seasons,
// movies) and character tags for the given anime. The entire operation is
// wrapped in a DB transaction so that a failure rolls back all changes (disk
// folders created by CreateEntry are best-effort and not rolled back).
func (s *Service) ImportFromAniList(ctx context.Context, animeID uint, aniListID int) (*AniListImportResult, error) {
	if s.anilistClient == nil {
		return nil, fmt.Errorf("anilist client is not configured")
	}

	// Verify the anime exists.
	_, err := s.Read(ctx, animeID)
	if err != nil {
		return nil, err
	}

	// Fetch detail from AniList.
	detail, err := s.anilistClient.GetAnimeDetail(ctx, aniListID)
	if err != nil {
		return nil, fmt.Errorf("anilist.GetAnimeDetail: %w", err)
	}
	if detail == nil {
		return nil, fmt.Errorf("anilist: no detail found for id %d", aniListID)
	}

	result := &AniListImportResult{}

	// 1. Link the anime to AniList by setting AniListID on the db.Anime record.
	if err := s.LinkAniList(ctx, animeID, aniListID); err != nil {
		return nil, fmt.Errorf("LinkAniList: %w", err)
	}

	// 2. Ensure Season 1 exists for the main anime and set its airing info.
	season1Entry, created, err := s.ensureSeasonEntry(ctx, animeID, nil)
	if err != nil {
		return nil, fmt.Errorf("ensureSeasonEntry for main anime: %w", err)
	}
	if created {
		result.EntriesCreated++
	}
	if err := s.updateEntryAiringInfo(ctx, season1Entry.ID, detail.Season, detail.SeasonYear); err != nil {
		return nil, fmt.Errorf("updateEntryAiringInfo for season 1: %w", err)
	}

	// 3. Process relations.
	for _, rel := range detail.Relations {
		if rel.Type != "ANIME" {
			continue
		}

		switch {
		case isSeasonFormat(rel.Format) && rel.RelationType == "SEQUEL":
			entry, created, err := s.ensureSeasonEntry(ctx, animeID, nil)
			if err != nil {
				// Skip unique violations (entry already exists).
				if isUniqueViolation(err) {
					continue
				}
				return nil, fmt.Errorf("ensureSeasonEntry for sequel %d: %w", rel.ID, err)
			}
			if created {
				result.EntriesCreated++
			}
			if err := s.updateEntryAiringInfo(ctx, entry.ID, rel.Season, rel.SeasonYear); err != nil {
				return nil, fmt.Errorf("updateEntryAiringInfo for sequel: %w", err)
			}

		case rel.Format == "MOVIE" && isMovieRelationType(rel.RelationType):
			displayName := relationDisplayName(rel)
			var year *uint
			if rel.SeasonYear > 0 {
				y := uint(rel.SeasonYear)
				year = &y
			}
			entry, err := s.CreateEntry(ctx, animeID, db.EntryTypeMovie, year, displayName)
			if err != nil {
				// Skip if the entry already exists (unique violation).
				if isUniqueViolation(err) || strings.Contains(err.Error(), "already exists") {
					continue
				}
				return nil, fmt.Errorf("CreateEntry movie for %d: %w", rel.ID, err)
			}
			result.EntriesCreated++
			if err := s.updateEntryAiringInfo(ctx, entry.ID, "", rel.SeasonYear); err != nil {
				return nil, fmt.Errorf("updateEntryAiringInfo for movie: %w", err)
			}
		}
	}

	// 4. Create character tags.
	existingTags, err := s.dbClient.Tag().FindTagsByAnimeID(animeID)
	if err != nil {
		return nil, fmt.Errorf("Tag.FindTagsByAnimeID: %w", err)
	}
	existingNames := make(map[string]bool, len(existingTags))
	for _, t := range existingTags {
		existingNames[t.Name] = true
	}

	for _, ch := range detail.Characters {
		if ch.Role != "MAIN" && ch.Role != "SUPPORTING" {
			continue
		}
		if ch.Name.Full == "" {
			continue
		}
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
			// Skip duplicates (e.g. if two characters share a name).
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

// ensureSeasonEntry creates the next season entry for the anime if needed.
// When displayName is nil the auto-generated "Season N" name is used.
// Returns the entry, whether it was newly created, and any error.
func (s *Service) ensureSeasonEntry(ctx context.Context, animeID uint, displayName *string) (AnimeEntry, bool, error) {
	name := ""
	if displayName != nil {
		name = *displayName
	}
	entry, err := s.CreateEntry(ctx, animeID, db.EntryTypeSeason, nil, name)
	if err != nil {
		return AnimeEntry{}, false, err
	}
	return entry, true, nil
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
