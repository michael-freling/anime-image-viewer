package anime

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"github.com/michael-freling/anime-image-viewer/internal/animemetadata"
	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/michael-freling/anime-image-viewer/internal/xerrors"
)

// MetadataImportResult summarises what was created during an import from the
// anime metadata database.
type MetadataImportResult struct {
	SeasonsCreated    int `json:"seasonsCreated"`
	CharactersCreated int `json:"charactersCreated"`
}

// sanitizeFolderName replaces characters that are invalid in folder names
// with a dash. invalidFolderChars is defined in service.go.
func sanitizeFolderName(name string) string {
	return invalidFolderChars.ReplaceAllString(name, "-")
}

// SearchMetadata proxies a search to the anime metadata database, keeping only
// series entries. One anime maps to one storyline, so a franchise — which
// groups several series — is not a valid import target.
func (s *Service) SearchMetadata(ctx context.Context, query string) ([]animemetadata.SearchResult, error) {
	if s.metadataClient == nil {
		return nil, fmt.Errorf("anime metadata client is not configured")
	}

	results, err := s.metadataClient.Search(ctx, query, 0)
	if err != nil {
		return nil, err
	}

	series := make([]animemetadata.SearchResult, 0, len(results))
	for _, result := range results {
		if result.Kind == animemetadata.EntryKindSeries {
			series = append(series, result)
		}
	}
	return series, nil
}

// LinkMetadataSeries records the metadata database's series id on an anime
// without importing anything.
//
// aniListID, when non-zero, is stored alongside it purely so the UI can
// deep-link to anilist.co. It comes from the metadata database's externalIds;
// the AniList API itself is never called.
func (s *Service) LinkMetadataSeries(ctx context.Context, animeID uint, seriesID string, aniListID int) error {
	row, err := s.dbClient.Anime().FindByValue(ctx, &db.Anime{ID: animeID})
	if err != nil {
		if err == db.ErrRecordNotFound {
			return fmt.Errorf("%w: id %d", ErrAnimeNotFound, animeID)
		}
		return err
	}

	row.MetadataSeriesID = &seriesID
	if aniListID > 0 {
		row.AniListID = &aniListID
	}
	return s.dbClient.Anime().Update(ctx, &row)
}

// seasonGroup is one top-level season: either a single installment, or several
// cours that share a season number and differ only by part.
type seasonGroup struct {
	number int
	title  string
	parts  []animemetadata.Season
}

// partNumber returns a season's part, or 0 when it is not a split cour.
func partNumber(season animemetadata.Season) int {
	if season.Part == nil {
		return 0
	}
	return *season.Part
}

// groupSeasons groups a series' seasons by season number.
//
// The metadata database models a split-cour season as several entries sharing
// Number with distinct Part values, which is exactly the parent/sub-season
// shape this application stores. That replaces the "Part N" title parsing the
// AniList import needed, since parts are now first-class fields.
func groupSeasons(seasons []animemetadata.Season) []seasonGroup {
	groupsByNumber := make(map[int]*seasonGroup)
	var order []int

	for _, season := range seasons {
		group, ok := groupsByNumber[season.Number]
		if !ok {
			group = &seasonGroup{number: season.Number}
			groupsByNumber[season.Number] = group
			order = append(order, season.Number)
		}
		group.parts = append(group.parts, season)
	}

	sort.Ints(order)
	result := make([]seasonGroup, 0, len(order))
	for _, number := range order {
		group := groupsByNumber[number]
		sort.SliceStable(group.parts, func(i, j int) bool {
			return partNumber(group.parts[i]) < partNumber(group.parts[j])
		})
		group.title = seasonGroupTitle(*group)
		result = append(result, *group)
	}
	return result
}

// seasonGroupTitle picks a display name for a season group. Season titles are
// relative to their series and are often empty (only distinctly-named arcs
// carry one), so fall back to the season number.
func seasonGroupTitle(group seasonGroup) string {
	for _, part := range group.parts {
		if strings.TrimSpace(part.Title) != "" {
			return part.Title
		}
	}
	return fmt.Sprintf("Season %d", group.number)
}

// seriesAniListID picks the AniList id to store for the outbound anilist.co
// link, preferring the first season, then the first movie, then the first
// special.
func seriesAniListID(series *animemetadata.Series) int {
	for _, season := range series.Seasons {
		if season.ExternalIDs.AniListID > 0 {
			return season.ExternalIDs.AniListID
		}
	}
	for _, movie := range series.Movies {
		if movie.ExternalIDs.AniListID > 0 {
			return movie.ExternalIDs.AniListID
		}
	}
	for _, special := range series.Specials {
		if special.ExternalIDs.AniListID > 0 {
			return special.ExternalIDs.AniListID
		}
	}
	return 0
}

// ImportFromMetadata imports a series' seasons, movies, specials and cast from
// the anime metadata database into the given anime.
//
// Unlike the AniList import this replaced, no graph traversal is needed: the
// metadata database already resolves a series into its full set of
// installments, so a single GetSeries call returns everything.
func (s *Service) ImportFromMetadata(ctx context.Context, animeID uint, seriesID string) (*MetadataImportResult, error) {
	if s.metadataClient == nil {
		return nil, fmt.Errorf("anime metadata client is not configured")
	}
	if strings.TrimSpace(seriesID) == "" {
		return nil, fmt.Errorf("%w: series id is required", xerrors.ErrInvalidArgument)
	}

	if _, err := s.Read(ctx, animeID); err != nil {
		return nil, err
	}

	series, err := s.metadataClient.GetSeries(ctx, seriesID)
	if err != nil {
		return nil, fmt.Errorf("animemetadata.GetSeries(%q): %w", seriesID, err)
	}

	result := &MetadataImportResult{}

	if err := s.LinkMetadataSeries(ctx, animeID, series.ID, seriesAniListID(series)); err != nil {
		return nil, fmt.Errorf("LinkMetadataSeries: %w", err)
	}

	// Index the entries that already exist so a re-import updates them in
	// place instead of failing on duplicates.
	existingSeasons, err := s.GetAnimeSeasons(animeID)
	if err != nil {
		return nil, fmt.Errorf("GetAnimeSeasons: %w", err)
	}
	existingByNumber := make(map[uint]AnimeSeason)
	existingByName := make(map[string]AnimeSeason)
	for _, existing := range existingSeasons {
		if existing.SeasonType == db.SeasonTypeSeason && existing.SeasonNumber != nil {
			existingByNumber[*existing.SeasonNumber] = existing
		}
		existingByName[strings.ToLower(existing.Name)] = existing
	}

	if err := s.importSeasons(ctx, animeID, series.Seasons, existingByNumber, existingByName, result); err != nil {
		return nil, err
	}
	if err := s.importMovies(ctx, animeID, series.Movies, existingByName, result); err != nil {
		return nil, err
	}
	if err := s.importSpecials(ctx, animeID, series.Specials, existingByName, result); err != nil {
		return nil, err
	}
	if err := s.importCharacters(ctx, animeID, series.Characters, result); err != nil {
		return nil, err
	}

	return result, nil
}

// importSeasons materialises the TV seasons, creating a sub-season folder per
// part for split-cour seasons.
func (s *Service) importSeasons(
	ctx context.Context,
	animeID uint,
	seasons []animemetadata.Season,
	existingByNumber map[uint]AnimeSeason,
	existingByName map[string]AnimeSeason,
	result *MetadataImportResult,
) error {
	for _, group := range groupSeasons(seasons) {
		if group.number <= 0 {
			continue
		}
		seasonNumber := uint(group.number)
		displayName := sanitizeFolderName(group.title)
		first := group.parts[0]

		// parentID is the folder that part sub-seasons are created under.
		var parentID uint

		switch existing, ok := existingByNumber[seasonNumber]; {
		case ok:
			if err := s.updateSeasonAiringInfo(ctx, existing.ID, first.ReleaseSeason, first.ReleaseYear); err != nil {
				return fmt.Errorf("updateSeasonAiringInfo for existing season %d: %w", seasonNumber, err)
			}
			parentID = existing.ID
		default:
			legacy, isLegacy := existingByName[strings.ToLower(displayName)]
			if isLegacy {
				// A folder with this name exists but predates entry_type
				// metadata. Backfill it rather than creating a duplicate.
				if err := s.dbClient.File().UpdateSeasonFields(ctx, legacy.ID, db.SeasonTypeSeason, &seasonNumber); err != nil {
					return fmt.Errorf("backfill season fields for %q: %w", displayName, err)
				}
				if err := s.updateSeasonAiringInfo(ctx, legacy.ID, first.ReleaseSeason, first.ReleaseYear); err != nil {
					return fmt.Errorf("updateSeasonAiringInfo for legacy season %q: %w", displayName, err)
				}
				parentID = legacy.ID
				break
			}

			created, err := s.CreateSeason(ctx, animeID, db.SeasonTypeSeason, &seasonNumber, displayName)
			if err != nil {
				if isAlreadyExists(err) {
					continue
				}
				return fmt.Errorf("CreateSeason %d: %w", seasonNumber, err)
			}
			result.SeasonsCreated++
			if err := s.updateSeasonAiringInfo(ctx, created.ID, first.ReleaseSeason, first.ReleaseYear); err != nil {
				return fmt.Errorf("updateSeasonAiringInfo for season %d: %w", seasonNumber, err)
			}
			parentID = created.ID
		}

		// A single-cour season needs no part folders.
		if len(group.parts) < 2 {
			continue
		}
		for index, part := range group.parts {
			number := partNumber(part)
			if number == 0 {
				// An untagged entry alongside tagged ones is implicitly the
				// part at its sorted position.
				number = index + 1
			}
			if err := s.importSeasonPart(ctx, parentID, number, part, result); err != nil {
				return err
			}
		}
	}
	return nil
}

// importSeasonPart creates (or updates) the "Part N" folder for one cour.
func (s *Service) importSeasonPart(
	ctx context.Context,
	parentID uint,
	number int,
	part animemetadata.Season,
	result *MetadataImportResult,
) error {
	partName := fmt.Sprintf("Part %d", number)

	subSeason, err := s.CreateSubSeason(ctx, parentID, partName)
	if err != nil {
		if !isAlreadyExists(err) {
			return fmt.Errorf("CreateSubSeason %s: %w", partName, err)
		}
		existing, findErr := s.dbClient.File().FindByValue(ctx, &db.File{
			ParentID: parentID,
			Name:     sanitizeFolderName(partName),
		})
		if findErr != nil {
			return fmt.Errorf("find existing sub-season %s: %w", partName, findErr)
		}
		if err := s.updateSeasonAiringInfo(ctx, existing.ID, part.ReleaseSeason, part.ReleaseYear); err != nil {
			return fmt.Errorf("updateSeasonAiringInfo for existing %s: %w", partName, err)
		}
		return nil
	}

	result.SeasonsCreated++
	if err := s.updateSeasonAiringInfo(ctx, subSeason.ID, part.ReleaseSeason, part.ReleaseYear); err != nil {
		return fmt.Errorf("updateSeasonAiringInfo for %s: %w", partName, err)
	}
	return nil
}

// importMovies materialises the series' films as movie entries.
func (s *Service) importMovies(
	ctx context.Context,
	animeID uint,
	movies []animemetadata.Movie,
	existingByName map[string]AnimeSeason,
	result *MetadataImportResult,
) error {
	for _, movie := range movies {
		if strings.TrimSpace(movie.Title) == "" {
			continue
		}
		if err := s.ensureAnimeEntry(ctx, animeID, existingByName, db.SeasonTypeMovie,
			sanitizeFolderName(movie.Title), movie.ReleaseYear, result); err != nil {
			return err
		}
	}
	return nil
}

// importSpecials materialises OVAs, ONAs and specials. They carry no season
// number, so they are stored as "other" entries.
func (s *Service) importSpecials(
	ctx context.Context,
	animeID uint,
	specials []animemetadata.Special,
	existingByName map[string]AnimeSeason,
	result *MetadataImportResult,
) error {
	for _, special := range specials {
		if strings.TrimSpace(special.Title) == "" {
			continue
		}
		if err := s.ensureAnimeEntry(ctx, animeID, existingByName, db.SeasonTypeOther,
			sanitizeFolderName(special.Title), special.ReleaseYear, result); err != nil {
			return err
		}
	}
	return nil
}

// ensureAnimeEntry creates a non-season top-level entry, or reuses an existing
// folder of the same name and backfills its metadata. Movies and specials
// carry no release season in the metadata database, only a year.
func (s *Service) ensureAnimeEntry(
	ctx context.Context,
	animeID uint,
	existingByName map[string]AnimeSeason,
	seasonType string,
	displayName string,
	releaseYear int,
	result *MetadataImportResult,
) error {
	// For movie entries the season number slot holds the release year.
	var number *uint
	if seasonType == db.SeasonTypeMovie && releaseYear >= 1900 && releaseYear <= 2100 {
		year := uint(releaseYear)
		number = &year
	}

	if existing, ok := existingByName[strings.ToLower(displayName)]; ok {
		if existing.SeasonType != seasonType {
			if err := s.dbClient.File().UpdateSeasonFields(ctx, existing.ID, seasonType, number); err != nil {
				return fmt.Errorf("backfill %s fields for %q: %w", seasonType, displayName, err)
			}
		}
		if err := s.updateSeasonAiringInfo(ctx, existing.ID, "", releaseYear); err != nil {
			return fmt.Errorf("updateSeasonAiringInfo for existing %s %s: %w", seasonType, displayName, err)
		}
		return nil
	}

	created, err := s.CreateSeason(ctx, animeID, seasonType, number, displayName)
	if err != nil {
		if !isAlreadyExists(err) {
			return fmt.Errorf("CreateSeason %s: %w", seasonType, err)
		}
		rootFolder, findErr := s.FindAnimeRootFolder(animeID)
		if findErr != nil {
			return fmt.Errorf("FindAnimeRootFolder for existing %s: %w", seasonType, findErr)
		}
		existing, findErr := s.dbClient.File().FindByValue(ctx, &db.File{
			ParentID: rootFolder.ID,
			Name:     displayName,
		})
		if findErr != nil {
			return fmt.Errorf("find existing %s %s: %w", seasonType, displayName, findErr)
		}
		if err := s.updateSeasonAiringInfo(ctx, existing.ID, "", releaseYear); err != nil {
			return fmt.Errorf("updateSeasonAiringInfo for existing %s %s: %w", seasonType, displayName, err)
		}
		return nil
	}

	result.SeasonsCreated++
	if err := s.updateSeasonAiringInfo(ctx, created.ID, "", releaseYear); err != nil {
		return fmt.Errorf("updateSeasonAiringInfo for %s %s: %w", seasonType, displayName, err)
	}
	return nil
}

// importCharacters creates a Character row per cast member, skipping any name
// the anime already has.
func (s *Service) importCharacters(
	ctx context.Context,
	animeID uint,
	characters []animemetadata.Character,
	result *MetadataImportResult,
) error {
	existing, err := s.dbClient.Character().FindByAnimeID(animeID)
	if err != nil {
		return fmt.Errorf("Character.FindByAnimeID: %w", err)
	}
	existingNames := make(map[string]bool, len(existing))
	for _, character := range existing {
		existingNames[character.Name] = true
	}

	for _, character := range characters {
		// The dataset carries no name for some characters yet; there is
		// nothing to store for those.
		name := strings.TrimSpace(character.Name)
		if name == "" || existingNames[name] {
			continue
		}

		row := db.Character{Name: name, AnimeID: animeID}
		if err := s.dbClient.Character().Create(ctx, &row); err != nil {
			if isUniqueViolation(err) {
				continue
			}
			return fmt.Errorf("Character.Create for %q: %w", name, err)
		}
		existingNames[name] = true
		result.CharactersCreated++
	}
	return nil
}

// updateSeasonAiringInfo sets AiringSeason and AiringYear on a season folder.
func (s *Service) updateSeasonAiringInfo(ctx context.Context, fileID uint, releaseSeason string, releaseYear int) error {
	var airingYear *uint
	if releaseYear > 0 {
		year := uint(releaseYear)
		airingYear = &year
	}
	return s.dbClient.File().UpdateAiringFields(ctx, fileID, releaseSeasonToDBSeason(releaseSeason), airingYear)
}

// releaseSeasonToDBSeason maps an anime.v1.ReleaseSeason enum value to the
// corresponding DB constant, returning "" for anything unrecognised.
func releaseSeasonToDBSeason(releaseSeason string) string {
	switch releaseSeason {
	case animemetadata.ReleaseSeasonWinter:
		return db.AiringSeasonWinter
	case animemetadata.ReleaseSeasonSpring:
		return db.AiringSeasonSpring
	case animemetadata.ReleaseSeasonSummer:
		return db.AiringSeasonSummer
	case animemetadata.ReleaseSeasonFall:
		return db.AiringSeasonFall
	default:
		return ""
	}
}

// isAlreadyExists reports whether an error means the folder or row is already
// there, which a re-import treats as success.
func isAlreadyExists(err error) bool {
	return isUniqueViolation(err) || strings.Contains(err.Error(), "already exists")
}
