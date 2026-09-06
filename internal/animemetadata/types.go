package animemetadata

// The types below mirror the protojson encoding of `anime.v1` from
// github.com/michael-freling/anime-metadata-db. Only the fields this
// application consumes are modelled; proto3 JSON omits zero values, so every
// field must tolerate being absent.

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
// "FORMAT_" only because a bare SPECIAL would collide with another enum's.
const (
	SpecialFormatUnspecified = "FORMAT_UNSPECIFIED"
	SpecialFormatOVA         = "FORMAT_OVA"
	SpecialFormatONA         = "FORMAT_ONA"
	SpecialFormatSpecial     = "FORMAT_SPECIAL"
)

// ExternalIDs cross-maps a node to external databases. All fields are optional.
type ExternalIDs struct {
	AniListID  int    `json:"anilistId"`
	AniDBID    int    `json:"anidbId"`
	TMDBID     int    `json:"tmdbId"`
	TVDBID     int    `json:"tvdbId"`
	WikidataID string `json:"wikidataId"`
}

// Episode is one numbered entry of a season or special. It carries numbering
// and nothing else: AiredNumber is its position within the installment and
// AbsoluteNumber is the franchise-wide running count, absent for series that
// are not linearly numbered.
//
// The upstream Episode used to declare a title and a release date as well.
// Neither was ever populated, and both have been removed from the API.
type Episode struct {
	AbsoluteNumber *int `json:"absoluteNumber"`
	AiredNumber    int  `json:"airedNumber"`
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
//
// The API also marks which credits hold across every work a character appears
// in (`throughout`) and scopes an appearance to individual installments
// (`scope`). This application imports a cast list and nothing finer, so neither
// is modelled.
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
//
// A character reached through GetSeries is the full global node, so its
// Appearances may name series other than the one that was asked for.
type Character struct {
	ID          string                `json:"id"`
	Name        string                `json:"name"`
	ExternalIDs ExternalIDs           `json:"externalIds"`
	VoiceActors []VoiceActor          `json:"voiceActors"`
	Appearances []CharacterAppearance `json:"appearances"`
}

// Series is the base unit: one storyline / continuity.
//
// Every collection below is complete. The API used to embed a capped first page
// of each alongside a total, which had to be paged back in; it now serializes a
// series whole, so each collection's length is its count.
type Series struct {
	ID         string      `json:"id"`
	Title      string      `json:"title"`
	Seasons    []Season    `json:"seasons"`
	Movies     []Movie     `json:"movies"`
	Specials   []Special   `json:"specials"`
	Characters []Character `json:"characters"`
}

// SeriesSummary is one SearchSeries hit: enough to render a result row and
// decide whether to open it. It is deliberately not a Series — a page of whole
// series would be a bulk export of the dataset.
//
// FranchiseID is the brand the series belongs to, or empty when it stands
// alone; two summaries sharing one are two storylines of the same franchise.
// FirstReleaseYear and LatestReleaseYear span everything in the series and are
// both 0 when nothing in it carries a year. Works counts seasons + movies +
// specials.
type SeriesSummary struct {
	ID                string `json:"id"`
	Title             string `json:"title"`
	FranchiseID       string `json:"franchiseId"`
	FirstReleaseYear  int    `json:"firstReleaseYear"`
	LatestReleaseYear int    `json:"latestReleaseYear"`
	Works             int    `json:"works"`
	Episodes          int    `json:"episodes"`
}
