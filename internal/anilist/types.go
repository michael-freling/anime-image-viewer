package anilist

// MediaTitle holds the multi-language title variants returned by AniList.
type MediaTitle struct {
	Romaji  string `json:"romaji"`
	English string `json:"english"`
	Native  string `json:"native"`
}

// CoverImage holds cover image URLs.
type CoverImage struct {
	Large  string `json:"large"`
	Medium string `json:"medium"`
}

// MediaSearchResult is a single result from an anime search.
type MediaSearchResult struct {
	ID         int        `json:"id"`
	Title      MediaTitle `json:"title"`
	Format     string     `json:"format"`     // TV, MOVIE, OVA, ONA, SPECIAL, etc.
	Status     string     `json:"status"`     // FINISHED, RELEASING, NOT_YET_RELEASED, etc.
	Season     string     `json:"season"`     // WINTER, SPRING, SUMMER, FALL
	SeasonYear int        `json:"seasonYear"`
	Episodes   int        `json:"episodes"`
	CoverImage CoverImage `json:"coverImage"`
}

// Character is a character from an anime.
type Character struct {
	ID   int    `json:"id"`
	Name struct {
		Full   string `json:"full"`
		Native string `json:"native"`
	} `json:"name"`
	Role string `json:"role"` // MAIN, SUPPORTING, BACKGROUND
}

// MediaRelation is a related anime (sequel, prequel, etc.).
type MediaRelation struct {
	RelationType string     `json:"relationType"` // SEQUEL, PREQUEL, SIDE_STORY, etc.
	ID           int        `json:"id"`
	Title        MediaTitle `json:"title"`
	Type         string     `json:"type"`   // ANIME, MANGA
	Format       string     `json:"format"` // TV, MOVIE, etc.
	Status       string     `json:"status"`
	Season       string     `json:"season"`
	SeasonYear   int        `json:"seasonYear"`
	Episodes     int        `json:"episodes"`
}

// MediaDetail is the full detail of an anime including relations and characters.
type MediaDetail struct {
	ID         int             `json:"id"`
	Title      MediaTitle      `json:"title"`
	Format     string          `json:"format"`
	Status     string          `json:"status"`
	Season     string          `json:"season"`
	SeasonYear int             `json:"seasonYear"`
	Episodes   int             `json:"episodes"`
	CoverImage CoverImage      `json:"coverImage"`
	Relations  []MediaRelation `json:"relations"`
	Characters []Character     `json:"characters"`
}
