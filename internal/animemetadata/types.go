package animemetadata

// The types below mirror the protojson encoding of `anime.v1` from
// github.com/michael-freling/anime-metadata-db. Only the fields this
// application consumes are modelled; proto3 JSON omits zero values, so every
// field must tolerate being absent.

// Entry kinds returned by Search.
const (
	EntryKindFranchise = "ENTRY_KIND_FRANCHISE"
	EntryKindSeries    = "ENTRY_KIND_SERIES"
)

// Release seasons. These mirror anime.v1.ReleaseSeason.
const (
	ReleaseSeasonUnspecified = "RELEASE_SEASON_UNSPECIFIED"
	ReleaseSeasonWinter      = "RELEASE_SEASON_WINTER"
	ReleaseSeasonSpring      = "RELEASE_SEASON_SPRING"
	ReleaseSeasonSummer      = "RELEASE_SEASON_SUMMER"
	ReleaseSeasonFall        = "RELEASE_SEASON_FALL"
)

// Special formats. These mirror anime.v1.SpecialFormat.
const (
	SpecialFormatOVA     = "SPECIAL_FORMAT_OVA"
	SpecialFormatONA     = "SPECIAL_FORMAT_ONA"
	SpecialFormatSpecial = "SPECIAL_FORMAT_SPECIAL"
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
type Series struct {
	ID         string      `json:"id"`
	Title      string      `json:"title"`
	Seasons    []Season    `json:"seasons"`
	Movies     []Movie     `json:"movies"`
	Specials   []Special   `json:"specials"`
	Characters []Character `json:"characters"`
}

// SearchResult is one match: a top-level franchise or a series. FranchiseID is
// set only when Kind is EntryKindSeries and the series belongs to a franchise.
type SearchResult struct {
	Kind        string `json:"kind"`
	ID          string `json:"id"`
	Title       string `json:"title"`
	FranchiseID string `json:"franchiseId"`
}
