package frontend

// MetadataSearchResult is a series match from the anime metadata database,
// exposed to the frontend. Only series are returned: a franchise groups several
// series and is not a valid import target for a single anime.
type MetadataSearchResult struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	FranchiseID string `json:"franchiseId"`
}

// MetadataImportResult is the outcome of importing from the anime metadata
// database. A re-import of an unchanged series reports all zeroes, since
// entries are matched by their upstream id rather than recreated.
type MetadataImportResult struct {
	SeasonsCreated    int `json:"seasonsCreated"`
	SeasonsUpdated    int `json:"seasonsUpdated"`
	CharactersCreated int `json:"charactersCreated"`
	CharactersUpdated int `json:"charactersUpdated"`
}
