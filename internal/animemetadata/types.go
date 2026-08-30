package animemetadata

// The types below mirror the protojson encoding of `anime.v1` from
// github.com/michael-freling/anime-metadata-db. Only the fields this
// application consumes are modelled; proto3 JSON omits zero values, so every
// field must tolerate being absent.

// Entry kinds returned by Search.
//
// The upstream enum values are unprefixed — the JSON reads "SERIES", not
// "ENTRY_KIND_SERIES" — because protobuf scopes enum values to the package.
const (
	EntryKindUnspecified = "ENTRY_UNSPECIFIED"
	EntryKindFranchise   = "FRANCHISE"
	EntryKindSeries      = "SERIES"
)

// Release seasons. These mirror anime.v1.ReleaseSeason, whose values are
// unprefixed apart from the zero value.
const (
	ReleaseSeasonUnspecified = "SEASON_UNSPECIFIED"
	ReleaseSeasonWinter      = "WINTER"
	ReleaseSeasonSpring      = "SPRING"
	ReleaseSeasonSummer      = "SUMMER"
	ReleaseSeasonFall        = "FALL"
)

// Special formats. These mirror anime.v1.SpecialFormat, which is prefixed
// "FORMAT_" only because a bare SPECIAL would collide with WorkKind's.
const (
	SpecialFormatUnspecified = "FORMAT_UNSPECIFIED"
	SpecialFormatOVA         = "FORMAT_OVA"
	SpecialFormatONA         = "FORMAT_ONA"
	SpecialFormatSpecial     = "FORMAT_SPECIAL"
)

// Work kinds. These mirror anime.v1.WorkKind and tag each WorkSummary that
// ListWorks returns.
const (
	WorkKindUnspecified = "WORK_UNSPECIFIED"
	WorkKindSeason      = "WORK_SEASON"
	WorkKindMovie       = "WORK_MOVIE"
	WorkKindSpecial     = "WORK_SPECIAL"
)

// ExternalIDs cross-maps a node to external databases. All fields are optional.
type ExternalIDs struct {
	AniListID  int    `json:"anilistId"`
	AniDBID    int    `json:"anidbId"`
	TMDBID     int    `json:"tmdbId"`
	TVDBID     int    `json:"tvdbId"`
	WikidataID string `json:"wikidataId"`
}

// Episode is one TV episode. AbsoluteNumber is the franchise-wide number and
// is absent for series that are not linearly numbered.
type Episode struct {
	AbsoluteNumber *int   `json:"absoluteNumber"`
	AiredNumber    int    `json:"airedNumber"`
	ReleaseDate    string `json:"releaseDate"`
	Title          string `json:"title"`
}

// Season is one numbered TV installment. Seasons split across cours share a
// Number and are distinguished by Part.
//
// Episodes is the first page only; EpisodesTotal is the real count. This
// application does not import episodes, so the rest are never fetched.
type Season struct {
	ID            string      `json:"id"`
	Title         string      `json:"title"`
	Number        int         `json:"number"`
	Part          *int        `json:"part"`
	ReleaseDate   string      `json:"releaseDate"`
	ReleaseYear   int         `json:"releaseYear"`
	ReleaseSeason string      `json:"releaseSeason"`
	ExternalIDs   ExternalIDs `json:"externalIds"`
	Episodes      []Episode   `json:"episodes"`
	EpisodesTotal int         `json:"episodesTotal"`
}

// AlternateCutOf links an alternate-cut film to the Season it re-cuts.
type AlternateCutOf struct {
	SeasonID string `json:"seasonId"`
	Episodes string `json:"episodes"`
}

// Movie is one film.
type Movie struct {
	ID             string          `json:"id"`
	Title          string          `json:"title"`
	ReleaseDate    string          `json:"releaseDate"`
	ReleaseYear    int             `json:"releaseYear"`
	ExternalIDs    ExternalIDs     `json:"externalIds"`
	AbsoluteNumber *int            `json:"absoluteNumber"`
	AlternateCutOf *AlternateCutOf `json:"alternateCutOf"`
}

// Special is one OVA / ONA / special.
type Special struct {
	ID             string      `json:"id"`
	Title          string      `json:"title"`
	Format         string      `json:"format"`
	ReleaseDate    string      `json:"releaseDate"`
	ReleaseYear    int         `json:"releaseYear"`
	ExternalIDs    ExternalIDs `json:"externalIds"`
	Episodes       []Episode   `json:"episodes"`
	EpisodesTotal  int         `json:"episodesTotal"`
	AbsoluteNumber *int        `json:"absoluteNumber"`
}

// VoiceActor links a Character to the Staff who voices it in one language.
// StaffName is denormalized by the API so no follow-up call is needed.
type VoiceActor struct {
	StaffID   string `json:"staffId"`
	Language  string `json:"language"`
	StaffName string `json:"staffName"`
}

// CharacterAppearance is a Character <-> Series edge.
type CharacterAppearance struct {
	SeriesID string `json:"seriesId"`
}

// Character is a global fictional entity. Name is resolved for the request's
// Accept-Language and is empty when the dataset carries no name yet.
type Character struct {
	ID          string                `json:"id"`
	Name        string                `json:"name"`
	ExternalIDs ExternalIDs           `json:"externalIds"`
	VoiceActors []VoiceActor          `json:"voiceActors"`
	Appearances []CharacterAppearance `json:"appearances"`
}

// Series is the base unit: one storyline / continuity.
//
// Every collection below is the first page only, capped by the API at a fixed
// limit, and the matching *Total is the real count. GetSeries fills them back
// in from the paging RPCs, so a Series handed to a caller is complete.
type Series struct {
	ID              string      `json:"id"`
	Title           string      `json:"title"`
	Seasons         []Season    `json:"seasons"`
	SeasonsTotal    int         `json:"seasonsTotal"`
	Movies          []Movie     `json:"movies"`
	MoviesTotal     int         `json:"moviesTotal"`
	Specials        []Special   `json:"specials"`
	SpecialsTotal   int         `json:"specialsTotal"`
	Characters      []Character `json:"characters"`
	CharactersTotal int         `json:"charactersTotal"`
}

// WorkSummary is one release — a season, movie or special — flattened out of
// the hierarchy by ListWorks, which is the only way to page past the capped
// collections GetSeries embeds.
//
// It is deliberately narrower than the nested records: notably it carries no
// Part, so a split cour recovered through it falls back to positional part
// numbering.
type WorkSummary struct {
	Kind          string      `json:"kind"`
	ID            string      `json:"id"`
	Title         string      `json:"title"`
	SeriesID      string      `json:"seriesId"`
	SeriesTitle   string      `json:"seriesTitle"`
	Number        int         `json:"number"`
	ReleaseDate   string      `json:"releaseDate"`
	ReleaseYear   int         `json:"releaseYear"`
	ReleaseSeason string      `json:"releaseSeason"`
	Format        string      `json:"format"`
	EpisodeCount  int         `json:"episodeCount"`
	ExternalIDs   ExternalIDs `json:"externalIds"`
}

// SearchResult is one match: a top-level franchise or a series. FranchiseID is
// set only when Kind is EntryKindSeries and the series belongs to a franchise.
type SearchResult struct {
	Kind        string `json:"kind"`
	ID          string `json:"id"`
	Title       string `json:"title"`
	FranchiseID string `json:"franchiseId"`
}
