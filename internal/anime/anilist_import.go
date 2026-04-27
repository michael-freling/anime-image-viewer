package anime

import (
	"context"
	"fmt"
	"regexp"
	"sort"
	"strconv"
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

// sanitizeFolderName replaces characters that are invalid in folder names
// with a dash. invalidFolderChars is defined in service.go.
func sanitizeFolderName(name string) string {
	return invalidFolderChars.ReplaceAllString(name, "-")
}

// partSuffixRe matches a trailing "Part N" suffix (case-insensitive) preceded
// by at least one whitespace character.
var partSuffixRe = regexp.MustCompile(`(?i)\s+Part\s+(\d+)\s*$`)

// detailDisplayName picks the best display name from a MediaDetail's title.
func detailDisplayName(detail *anilist.MediaDetail) string {
	if detail.Title.English != "" {
		return detail.Title.English
	}
	return detail.Title.Romaji
}

// parsePartSuffix extracts a "Part N" suffix from a title.
// Returns the base title and the part number. If no suffix is found, partNumber is 0.
func parsePartSuffix(title string) (baseTitle string, partNumber int) {
	m := partSuffixRe.FindStringSubmatchIndex(title)
	if m == nil {
		return title, 0
	}
	base := strings.TrimSpace(title[:m[0]])
	numStr := title[m[2]:m[3]]
	n, _ := strconv.Atoi(numStr)
	return base, n
}

type partEntry struct {
	detail     *anilist.MediaDetail
	fullTitle  string
	partNumber int // 0 means no "Part N" suffix
}

type seasonGroup struct {
	baseTitle string
	parts     []partEntry
}

// groupSeasonsByPart groups a sorted slice of MediaDetail entries by base
// title, detecting "Part N" suffixes to create multi-part groups.
func groupSeasonsByPart(sortedDetails []*anilist.MediaDetail) []seasonGroup {
	groupMap := make(map[string]*seasonGroup)
	var groupOrder []string

	for _, detail := range sortedDetails {
		title := detailDisplayName(detail)
		base, partNum := parsePartSuffix(title)

		g, exists := groupMap[base]
		if !exists {
			g = &seasonGroup{baseTitle: base}
			groupMap[base] = g
			groupOrder = append(groupOrder, base)
		}
		g.parts = append(g.parts, partEntry{
			detail:     detail,
			fullTitle:  title,
			partNumber: partNum,
		})
	}

	result := make([]seasonGroup, 0, len(groupOrder))
	for _, key := range groupOrder {
		g := groupMap[key]
		// If a group has >1 entry, any entry with partNumber==0 is implicitly Part 1.
		if len(g.parts) > 1 {
			for i := range g.parts {
				if g.parts[i].partNumber == 0 {
					g.parts[i].partNumber = 1
				}
			}
		}
		result = append(result, *g)
	}
	return result
}

// ImportFromAniList uses BFS to follow the SEQUEL/PREQUEL chain from the
// selected AniList entry, fetching each season individually. This avoids
// the query-complexity limit that nested GraphQL queries hit on AniList.
func (s *Service) ImportFromAniList(ctx context.Context, animeID uint, aniListID int) (*AniListImportResult, error) {
	if s.anilistClient == nil {
		return nil, fmt.Errorf("anilist client is not configured")
	}

	_, err := s.Read(ctx, animeID)
	if err != nil {
		return nil, err
	}

	// BFS: fetch root and follow SEQUEL/PREQUEL chain.
	fetched := make(map[int]*anilist.MediaDetail)
	queue := []int{aniListID}

	for len(queue) > 0 {
		currentID := queue[0]
		queue = queue[1:]

		if fetched[currentID] != nil {
			continue
		}

		detail, err := s.anilistClient.GetAnimeDetail(ctx, currentID)
		if err != nil {
			return nil, fmt.Errorf("anilist.GetAnimeDetail(%d): %w", currentID, err)
		}
		if detail == nil {
			continue
		}
		fetched[currentID] = detail

		// Discover SEQUEL/PREQUEL TV/ONA relations to follow.
		for _, rel := range detail.Relations {
			if rel.Type != "ANIME" {
				continue
			}
			if !isSeasonFormat(rel.Format) {
				continue
			}
			if rel.RelationType != "SEQUEL" && rel.RelationType != "PREQUEL" {
				continue
			}
			if fetched[rel.ID] == nil {
				queue = append(queue, rel.ID)
			}
		}
	}

	result := &AniListImportResult{}

	// Link anime to AniList.
	if err := s.LinkAniList(ctx, animeID, aniListID); err != nil {
		return nil, fmt.Errorf("LinkAniList: %w", err)
	}

	// Build season list from all fetched details.
	type seasonInfo struct {
		season     string
		seasonYear int
		id         int
	}
	var seasons []seasonInfo
	var allMovieRelations []anilist.MediaRelation
	seenMovies := make(map[int]bool)

	for _, detail := range fetched {
		// Each fetched entry is a season.
		seasons = append(seasons, seasonInfo{
			season:     detail.Season,
			seasonYear: detail.SeasonYear,
			id:         detail.ID,
		})
		// Collect movie relations from all entries.
		for _, rel := range detail.Relations {
			if rel.Type != "ANIME" || rel.Format != "MOVIE" || !isMovieRelationType(rel.RelationType) {
				continue
			}
			if !seenMovies[rel.ID] {
				seenMovies[rel.ID] = true
				allMovieRelations = append(allMovieRelations, rel)
			}
		}
	}

	// Sort seasons by year, then AniList ID as tiebreaker.
	sort.Slice(seasons, func(i, j int) bool {
		if seasons[i].seasonYear != seasons[j].seasonYear {
			return seasons[i].seasonYear < seasons[j].seasonYear
		}
		return seasons[i].id < seasons[j].id
	})

	// Build sorted detail list and group by base title.
	sortedDetails := make([]*anilist.MediaDetail, len(seasons))
	for i, si := range seasons {
		sortedDetails[i] = fetched[si.id]
	}
	groups := groupSeasonsByPart(sortedDetails)

	// Build map of existing season entries to skip duplicates.
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

	// Create season entries from groups.
	for i, group := range groups {
		seasonNum := uint(i + 1)
		displayName := sanitizeFolderName(group.baseTitle)
		first := group.parts[0].detail

		// parentID is the file ID of the season entry used as parent for sub-entries.
		var parentID uint

		if existing, ok := existingSeasonsByNum[seasonNum]; ok {
			if err := s.updateEntryAiringInfo(ctx, existing.ID, first.Season, first.SeasonYear); err != nil {
				return nil, fmt.Errorf("updateEntryAiringInfo for existing season %d: %w", seasonNum, err)
			}
			parentID = existing.ID
		} else {
			created, err := s.CreateEntry(ctx, animeID, db.EntryTypeSeason, &seasonNum, displayName)
			if err != nil {
				if isUniqueViolation(err) || strings.Contains(err.Error(), "already exists") {
					continue
				}
				return nil, fmt.Errorf("CreateEntry season %d: %w", seasonNum, err)
			}
			result.EntriesCreated++
			if err := s.updateEntryAiringInfo(ctx, created.ID, first.Season, first.SeasonYear); err != nil {
				return nil, fmt.Errorf("updateEntryAiringInfo for season %d: %w", seasonNum, err)
			}
			parentID = created.ID
		}

		// Create or update sub-entries for multi-part groups.
		if len(group.parts) > 1 {
			for _, part := range group.parts {
				partName := fmt.Sprintf("Part %d", part.partNumber)
				subEntry, err := s.CreateSubEntry(ctx, parentID, partName)
				if err != nil {
					if isUniqueViolation(err) || strings.Contains(err.Error(), "already exists") {
						// Sub-entry already exists; look it up and update its airing info.
						existingSub, findErr := s.dbClient.File().FindByValue(ctx, &db.File{
							ParentID: parentID,
							Name:     sanitizeFolderName(partName),
						})
						if findErr != nil {
							return nil, fmt.Errorf("find existing sub-entry %s: %w", partName, findErr)
						}
						if err := s.updateEntryAiringInfo(ctx, existingSub.ID, part.detail.Season, part.detail.SeasonYear); err != nil {
							return nil, fmt.Errorf("updateEntryAiringInfo for existing %s: %w", partName, err)
						}
						continue
					}
					return nil, fmt.Errorf("CreateSubEntry %s: %w", partName, err)
				}
				result.EntriesCreated++
				// Set airing info on the part from its AniList detail.
				if err := s.updateEntryAiringInfo(ctx, subEntry.ID, part.detail.Season, part.detail.SeasonYear); err != nil {
					return nil, fmt.Errorf("updateEntryAiringInfo for %s: %w", partName, err)
				}
			}
		}
	}

	// Create movie entries with sanitized names.
	// Fetch full details for each movie individually, since relation edges
	// often have incomplete data (e.g. SeasonYear: 0).
	for _, rel := range allMovieRelations {
		movieDetail, err := s.anilistClient.GetAnimeDetail(ctx, rel.ID)
		if err != nil {
			// Log/skip gracefully rather than failing the entire import.
			movieDetail = nil
		}

		// Determine display name, season, and year from the fetched detail,
		// falling back to the relation edge data when the detail is unavailable.
		var displayName string
		var movieSeason string
		var movieSeasonYear int
		if movieDetail != nil {
			displayName = sanitizeFolderName(detailDisplayName(movieDetail))
			movieSeason = movieDetail.Season
			movieSeasonYear = movieDetail.SeasonYear
		} else {
			displayName = sanitizeFolderName(relationDisplayName(rel))
			movieSeason = rel.Season
			movieSeasonYear = rel.SeasonYear
		}

		var year *uint
		if movieSeasonYear > 0 {
			y := uint(movieSeasonYear)
			year = &y
		}
		created, err := s.CreateEntry(ctx, animeID, db.EntryTypeMovie, year, displayName)
		if err != nil {
			if isUniqueViolation(err) || strings.Contains(err.Error(), "already exists") {
				// Movie already exists; look it up and update its airing info.
				rootFolder, findErr := s.FindAnimeRootFolder(animeID)
				if findErr != nil {
					return nil, fmt.Errorf("FindAnimeRootFolder for existing movie: %w", findErr)
				}
				existingMovie, findErr := s.dbClient.File().FindByValue(ctx, &db.File{
					ParentID: rootFolder.ID,
					Name:     displayName,
				})
				if findErr != nil {
					return nil, fmt.Errorf("find existing movie %s: %w", displayName, findErr)
				}
				if err := s.updateEntryAiringInfo(ctx, existingMovie.ID, movieSeason, movieSeasonYear); err != nil {
					return nil, fmt.Errorf("updateEntryAiringInfo for existing movie %s: %w", displayName, err)
				}
				continue
			}
			return nil, fmt.Errorf("CreateEntry movie: %w", err)
		}
		result.EntriesCreated++
		if err := s.updateEntryAiringInfo(ctx, created.ID, movieSeason, movieSeasonYear); err != nil {
			return nil, fmt.Errorf("updateEntryAiringInfo for movie %s: %w", displayName, err)
		}
	}

	// Collect characters from ALL fetched entries, dedup by name.
	existingChars, err := s.dbClient.Character().FindByAnimeID(animeID)
	if err != nil {
		return nil, fmt.Errorf("Character.FindByAnimeID: %w", err)
	}
	existingNames := make(map[string]bool, len(existingChars))
	for _, c := range existingChars {
		existingNames[c.Name] = true
	}

	for _, detail := range fetched {
		for _, ch := range detail.Characters {
			if ch.Role != "MAIN" && ch.Role != "SUPPORTING" {
				continue
			}
			if ch.Name.Full == "" || existingNames[ch.Name.Full] {
				continue
			}
			character := db.Character{
				Name:    ch.Name.Full,
				AnimeID: animeID,
			}
			if err := s.dbClient.Character().Create(ctx, &character); err != nil {
				if isUniqueViolation(err) {
					continue
				}
				return nil, fmt.Errorf("Character.Create for %q: %w", ch.Name.Full, err)
			}
			existingNames[ch.Name.Full] = true
			result.CharactersCreated++
		}
	}

	return result, nil
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

