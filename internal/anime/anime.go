package anime

import (
	"errors"
)

var (
	ErrAnimeNotFound      = errors.New("anime not found")
	ErrAnimeAlreadyExists = errors.New("anime already exists")
	ErrAnimeAncestorAssigned = errors.New("an ancestor folder is already assigned to an anime")
)

// Anime is the JSON-friendly anime model used by the frontend service.
type Anime struct {
	ID   uint   `json:"id"`
	Name string `json:"name"`
}
