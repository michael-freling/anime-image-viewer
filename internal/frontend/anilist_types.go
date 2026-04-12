package frontend

// AniListSearchResult is a search result exposed to the frontend.
type AniListSearchResult struct {
	ID            int    `json:"id"`
	TitleRomaji   string `json:"titleRomaji"`
	TitleEnglish  string `json:"titleEnglish"`
	TitleNative   string `json:"titleNative"`
	Format        string `json:"format"`
	Status        string `json:"status"`
	Season        string `json:"season"`
	SeasonYear    int    `json:"seasonYear"`
	Episodes      int    `json:"episodes"`
	CoverImageURL string `json:"coverImageUrl"`
}

// AniListImportResult is the outcome of importing from AniList.
type AniListImportResult struct {
	EntriesCreated    int `json:"entriesCreated"`
	CharactersCreated int `json:"charactersCreated"`
}
