package backup

import "time"

type BackupMetadata struct {
	Version          int       `json:"version"`
	CreatedAt        time.Time `json:"created_at"`
	IncludesImages   bool      `json:"includes_images"`
	ImageRootDir     string    `json:"image_root_directory"`
	DatabaseFileName string    `json:"database_file_name"`
	Path             string    `json:"path"`
}

const (
	metadataFileName = "metadata.json"
	databaseFileName = "database.sqlite"
	imagesDirName    = "images"
	currentVersion   = 1
)
