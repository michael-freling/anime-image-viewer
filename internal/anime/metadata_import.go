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

// MetadataImportResult summarises what an import changed. A re-import of an
// unchanged series reports all zeroes: entries are matched by their upstream
// id, so nothing is recreated.
type MetadataImportResult struct {
	SeasonsCreated    int `json:"seasonsCreated"`
	SeasonsUpdated    int `json:"seasonsUpdated"`
	CharactersCreated int `json:"charactersCreated"`
	CharactersUpdated int `json:"charactersUpdated"`
}

// sanitizeFolderName replaces characters that are invalid in folder names
// with a dash. invalidFolderChars is defined in service.go.
func sanitizeFolderName(name string) string {
	return invalidFolderChars.ReplaceAllString(name, "-")
}

func equalStringPtr(a, b *string) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return *a == *b
}

func equalUintPtr(a, b *uint) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return *a == *b
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

// entrySpec is one upstream entry as this application stores it.
type entrySpec struct {
	// metadataID is the anime-metadata-db id of the season, movie or special.
	// It is the identity a re-import matches on.
	metadataID string
	// title is the upstream display name. The folder is named after it, and it
	// is recorded so a later import can tell an untouched folder from a
	// user-renamed one.
	title      string
	seasonType string
	// entryNumber is stored on the folder: the season number, or a movie's
	// release year.
	entryNumber *uint
	// seasonNumber is used to adopt an unlinked folder, and is set for TV
	// seasons only — a movie's year is not an identity.
	seasonNumber  *uint
	releaseSeason string
	releaseYear   int
}

// folderIndex indexes the folders that already exist under one parent so an
// import can find the row an upstream entry maps to.
type folderIndex struct {
	byMetadataID map[string]db.File
	byNumber     map[uint]db.File
	byName       map[string]db.File
	claimed      map[uint]bool
}

func newFolderIndex(files []db.File) *folderIndex {
	index := &folderIndex{
		byMetadataID: make(map[string]db.File),
		byNumber:     make(map[uint]db.File),
		byName:       make(map[string]db.File),
		claimed:      make(map[uint]bool),
	}
	for _, file := range files {
		index.add(file)
	}
	return index
}

func (index *folderIndex) add(file db.File) {
	if file.MetadataEntryID != nil && *file.MetadataEntryID != "" {
		index.byMetadataID[*file.MetadataEntryID] = file
	}
	if file.SeasonType == db.SeasonTypeSeason && file.SeasonNumber != nil {
		index.byNumber[*file.SeasonNumber] = file
	}
	index.byName[strings.ToLower(file.Name)] = file
}

func isLinked(file db.File) bool {
	return file.MetadataEntryID != nil && *file.MetadataEntryID != ""
}

// match finds the folder an upstream entry maps to.
//
// The stored metadata id wins, so an entry that upstream retitles or renumbers
// resolves to the folder it already created instead of growing a second one.
// Only an *unlinked* folder is adopted by season number or name: those either
// predate the id being stored or were made by hand, and adopting them once is
// what stops the first re-import after an upgrade from duplicating everything.
// A folder already linked to a different entry is never taken.
func (index *folderIndex) match(spec entrySpec, folderName string) (db.File, bool) {
	if spec.metadataID != "" {
		if file, ok := index.byMetadataID[spec.metadataID]; ok && !index.claimed[file.ID] {
			index.claimed[file.ID] = true
			return file, true
		}
	}
	if spec.seasonNumber != nil {
		if file, ok := index.byNumber[*spec.seasonNumber]; ok && !index.claimed[file.ID] && !isLinked(file) {
			index.claimed[file.ID] = true
			return file, true
		}
	}
	if file, ok := index.byName[strings.ToLower(folderName)]; ok && !index.claimed[file.ID] && !isLinked(file) {
		index.claimed[file.ID] = true
		return file, true
	}
	return db.File{}, false
}

// ImportFromMetadata imports a series' seasons, movies, specials and cast from
// the anime metadata database into the given anime.
//
// It is an upsert: every entry carries its upstream id, so running it again
// after the dataset changes updates the folders and characters it created
// rather than duplicating them.
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

	rootFolder, err := s.FindAnimeRootFolder(animeID)
	if err != nil {
		return nil, fmt.Errorf("FindAnimeRootFolder: %w", err)
	}
	if rootFolder == nil {
		return nil, fmt.Errorf("%w: id %d has no root folder", ErrAnimeNotFound, animeID)
	}

	topLevel, err := s.dbClient.File().FindDirectChildDirectories(rootFolder.ID)
	if err != nil {
		return nil, fmt.Errorf("File.FindDirectChildDirectories: %w", err)
	}
	index := newFolderIndex(topLevel)

	if err := s.importSeasons(ctx, animeID, series.Seasons, index, result); err != nil {
		return nil, err
	}
	if err := s.importMovies(ctx, animeID, series.Movies, index, result); err != nil {
		return nil, err
	}
	if err := s.importSpecials(ctx, animeID, series.Specials, index, result); err != nil {
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
	index *folderIndex,
	result *MetadataImportResult,
) error {
	for _, group := range groupSeasons(seasons) {
		if group.number <= 0 {
			continue
		}
		seasonNumber := uint(group.number)
		first := group.parts[0]

		// A group's identity is anchored to its first cour: that id survives
		// upstream renumbering, so a season that moves from 2 to 3 updates its
		// existing folder rather than creating a new one.
		parentID, err := s.ensureEntry(ctx, animeID, index, entrySpec{
			metadataID:    first.ID,
			title:         group.title,
			seasonType:    db.SeasonTypeSeason,
			entryNumber:   &seasonNumber,
			seasonNumber:  &seasonNumber,
			releaseSeason: first.ReleaseSeason,
			releaseYear:   first.ReleaseYear,
		}, result)
		if err != nil {
			return err
		}
		if parentID == 0 {
			// The folder could not be created (a sibling holds the name), so
			// there is nothing to hang parts off.
			continue
		}

		// A single-cour season needs no part folders.
		if len(group.parts) < 2 {
			continue
		}

		children, err := s.dbClient.File().FindDirectChildDirectories(parentID)
		if err != nil {
			return fmt.Errorf("File.FindDirectChildDirectories for season %d: %w", seasonNumber, err)
		}
		partIndex := newFolderIndex(children)

		for position, part := range group.parts {
			number := partNumber(part)
			if number == 0 {
				// An untagged entry alongside tagged ones is implicitly the
				// part at its sorted position.
				number = position + 1
			}
			if err := s.importSeasonPart(ctx, parentID, partIndex, number, part, result); err != nil {
				return err
			}
		}
	}
	return nil
}

// importSeasonPart creates or updates the "Part N" folder for one cour. Parts
// are matched by their cour's upstream id, so re-parting upstream renames the
// existing folder instead of leaving a stale one behind.
func (s *Service) importSeasonPart(
	ctx context.Context,
	parentID uint,
	index *folderIndex,
	number int,
	part animemetadata.Season,
	result *MetadataImportResult,
) error {
	partName := fmt.Sprintf("Part %d", number)
	spec := entrySpec{
		metadataID:    part.ID,
		title:         partName,
		releaseSeason: part.ReleaseSeason,
		releaseYear:   part.ReleaseYear,
	}

	if existing, ok := index.match(spec, sanitizeFolderName(partName)); ok {
		changed, err := s.reconcileEntry(ctx, existing, spec, false)
		if err != nil {
			return err
		}
		if changed {
			result.SeasonsUpdated++
		}
		return nil
	}

	created, err := s.CreateSubSeason(ctx, parentID, partName)
	if err != nil {
		if isAlreadyExists(err) {
			return nil
		}
		return fmt.Errorf("CreateSubSeason %s: %w", partName, err)
	}
	result.SeasonsCreated++

	if err := s.updateSeasonAiringInfo(ctx, created.ID, part.ReleaseSeason, part.ReleaseYear); err != nil {
		return fmt.Errorf("updateSeasonAiringInfo for %s: %w", partName, err)
	}
	if err := s.recordMetadataFields(ctx, created.ID, spec); err != nil {
		return err
	}
	index.add(db.File{ID: created.ID, Name: created.Name, MetadataEntryID: &spec.metadataID})
	return nil
}

// importMovies materialises the series' films as movie entries.
func (s *Service) importMovies(
	ctx context.Context,
	animeID uint,
	movies []animemetadata.Movie,
	index *folderIndex,
	result *MetadataImportResult,
) error {
	for _, movie := range movies {
		if strings.TrimSpace(movie.Title) == "" {
			continue
		}
		// The season-number slot holds a movie's release year.
		var year *uint
		if movie.ReleaseYear >= 1900 && movie.ReleaseYear <= 2100 {
			value := uint(movie.ReleaseYear)
			year = &value
		}
		if _, err := s.ensureEntry(ctx, animeID, index, entrySpec{
			metadataID:  movie.ID,
			title:       movie.Title,
			seasonType:  db.SeasonTypeMovie,
			entryNumber: year,
			releaseYear: movie.ReleaseYear,
		}, result); err != nil {
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
	index *folderIndex,
	result *MetadataImportResult,
) error {
	for _, special := range specials {
		if strings.TrimSpace(special.Title) == "" {
			continue
		}
		if _, err := s.ensureEntry(ctx, animeID, index, entrySpec{
			metadataID:  special.ID,
			title:       special.Title,
			seasonType:  db.SeasonTypeOther,
			releaseYear: special.ReleaseYear,
		}, result); err != nil {
			return err
		}
	}
	return nil
}

// ensureEntry materialises one upstream entry as a top-level folder under the
// anime and returns its file id, or 0 when it could not be created.
func (s *Service) ensureEntry(
	ctx context.Context,
	animeID uint,
	index *folderIndex,
	spec entrySpec,
	result *MetadataImportResult,
) (uint, error) {
	folderName := sanitizeFolderName(spec.title)

	if existing, ok := index.match(spec, folderName); ok {
		changed, err := s.reconcileEntry(ctx, existing, spec, true)
		if err != nil {
			return 0, err
		}
		if changed {
			result.SeasonsUpdated++
		}
		return existing.ID, nil
	}

	created, err := s.CreateSeason(ctx, animeID, spec.seasonType, spec.entryNumber, spec.title)
	if err != nil {
		if isAlreadyExists(err) {
			// A sibling already occupies this folder name and belongs to a
			// different entry; leave it alone rather than overwrite it.
			return 0, nil
		}
		return 0, fmt.Errorf("CreateSeason %s %q: %w", spec.seasonType, spec.title, err)
	}
	result.SeasonsCreated++

	if err := s.updateSeasonAiringInfo(ctx, created.ID, spec.releaseSeason, spec.releaseYear); err != nil {
		return 0, fmt.Errorf("updateSeasonAiringInfo for %s %q: %w", spec.seasonType, spec.title, err)
	}
	if err := s.recordMetadataFields(ctx, created.ID, spec); err != nil {
		return 0, err
	}

	index.add(db.File{
		ID:              created.ID,
		Name:            created.Name,
		SeasonType:      created.SeasonType,
		SeasonNumber:    created.SeasonNumber,
		MetadataEntryID: &spec.metadataID,
	})
	return created.ID, nil
}

// reconcileEntry brings an already-existing folder in line with the upstream
// entry it maps to, reporting whether anything actually changed. renameable is
// false for part folders, whose names are positional rather than titles.
func (s *Service) reconcileEntry(ctx context.Context, file db.File, spec entrySpec, renameable bool) (bool, error) {
	changed := false

	if spec.seasonType != "" &&
		(file.SeasonType != spec.seasonType || !equalUintPtr(file.SeasonNumber, spec.entryNumber)) {
		if err := s.dbClient.File().UpdateSeasonFields(ctx, file.ID, spec.seasonType, spec.entryNumber); err != nil {
			return false, fmt.Errorf("UpdateSeasonFields for %q: %w", file.Name, err)
		}
		changed = true
	}

	airingSeason := releaseSeasonToDBSeason(spec.releaseSeason)
	var airingYear *uint
	if spec.releaseYear > 0 {
		value := uint(spec.releaseYear)
		airingYear = &value
	}
	if file.AiringSeason != airingSeason || !equalUintPtr(file.AiringYear, airingYear) {
		if err := s.dbClient.File().UpdateAiringFields(ctx, file.ID, airingSeason, airingYear); err != nil {
			return false, fmt.Errorf("UpdateAiringFields for %q: %w", file.Name, err)
		}
		changed = true
	}

	if renameable {
		renamed, err := s.renameImportedFolder(ctx, file, sanitizeFolderName(spec.title))
		if err != nil {
			return false, err
		}
		changed = changed || renamed
	}

	if !equalStringPtr(file.MetadataEntryID, &spec.metadataID) || !equalStringPtr(file.MetadataTitle, &spec.title) {
		if err := s.recordMetadataFields(ctx, file.ID, spec); err != nil {
			return false, err
		}
		changed = true
	}

	return changed, nil
}

// recordMetadataFields stores which upstream entry a folder came from.
func (s *Service) recordMetadataFields(ctx context.Context, fileID uint, spec entrySpec) error {
	metadataID, title := spec.metadataID, spec.title
	if err := s.dbClient.File().UpdateMetadataFields(ctx, fileID, &metadataID, &title); err != nil {
		return fmt.Errorf("UpdateMetadataFields for %q: %w", title, err)
	}
	return nil
}

// renameImportedFolder follows an upstream title change, but only when the
// folder still carries the name the import gave it. A folder the user renamed
// keeps their name — renaming moves the directory (and the images in it) on
// disk, so their intent wins over staying in sync.
func (s *Service) renameImportedFolder(ctx context.Context, file db.File, folderName string) (bool, error) {
	if folderName == "" || file.Name == folderName {
		return false, nil
	}
	// Without a recorded title there is no way to tell an untouched folder from
	// a renamed one, so leave it be. This is the case for a folder adopted from
	// before the id was stored.
	if file.MetadataTitle == nil || file.Name != sanitizeFolderName(*file.MetadataTitle) {
		return false, nil
	}

	if err := s.RenameSeason(ctx, file.ID, folderName); err != nil {
		if isAlreadyExists(err) {
			// A sibling already holds the new name; keep the current one.
			return false, nil
		}
		return false, fmt.Errorf("RenameSeason %q -> %q: %w", file.Name, folderName, err)
	}
	return true, nil
}

// importCharacters upserts the series' cast. Characters are matched by their
// upstream id so a rename upstream updates the existing row, keeping the image
// links (FileCharacter) that point at it.
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

	byMetadataID := make(map[string]db.Character)
	byName := make(map[string]db.Character)
	claimed := make(map[uint]bool)
	for _, character := range existing {
		if character.MetadataCharacterID != nil && *character.MetadataCharacterID != "" {
			byMetadataID[*character.MetadataCharacterID] = character
		}
		byName[strings.ToLower(character.Name)] = character
	}

	for _, character := range characters {
		// The dataset carries no name for some characters yet; there is
		// nothing to store for those.
		name := strings.TrimSpace(character.Name)
		if name == "" {
			continue
		}

		row, matched := matchCharacter(byMetadataID, byName, claimed, character.ID, name)
		if matched {
			changed, err := s.reconcileCharacter(ctx, row, character.ID, name)
			if err != nil {
				return err
			}
			if changed {
				result.CharactersUpdated++
			}
			continue
		}

		newRow := db.Character{Name: name, AnimeID: animeID, MetadataName: &name}
		if character.ID != "" {
			metadataID := character.ID
			newRow.MetadataCharacterID = &metadataID
		}
		if err := s.dbClient.Character().Create(ctx, &newRow); err != nil {
			return fmt.Errorf("Character.Create for %q: %w", name, err)
		}
		byName[strings.ToLower(name)] = newRow
		claimed[newRow.ID] = true
		result.CharactersCreated++
	}
	return nil
}

// matchCharacter resolves an upstream character to an existing row, preferring
// its id and adopting an unlinked same-name row otherwise.
func matchCharacter(
	byMetadataID map[string]db.Character,
	byName map[string]db.Character,
	claimed map[uint]bool,
	metadataID string,
	name string,
) (db.Character, bool) {
	if metadataID != "" {
		if row, ok := byMetadataID[metadataID]; ok && !claimed[row.ID] {
			claimed[row.ID] = true
			return row, true
		}
	}
	if row, ok := byName[strings.ToLower(name)]; ok && !claimed[row.ID] &&
		(row.MetadataCharacterID == nil || *row.MetadataCharacterID == "") {
		claimed[row.ID] = true
		return row, true
	}
	return db.Character{}, false
}

// reconcileCharacter brings an existing character row in line with upstream,
// reporting whether anything changed. A character the user renamed keeps their
// name.
func (s *Service) reconcileCharacter(ctx context.Context, row db.Character, metadataID string, name string) (bool, error) {
	changed := false

	if row.Name != name && row.MetadataName != nil && row.Name == *row.MetadataName {
		row.Name = name
		changed = true
	}

	var wantID *string
	if metadataID != "" {
		wantID = &metadataID
	}
	if !equalStringPtr(row.MetadataCharacterID, wantID) || !equalStringPtr(row.MetadataName, &name) {
		row.MetadataCharacterID = wantID
		row.MetadataName = &name
		changed = true
	}

	if !changed {
		return false, nil
	}
	if err := s.dbClient.Character().Update(ctx, &row); err != nil {
		return false, fmt.Errorf("Character.Update for %q: %w", name, err)
	}
	return true, nil
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
