package backup

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"

	"github.com/michael-freling/anime-image-viewer/internal/config"
)

type RestoreService struct {
	logger *slog.Logger
	config config.Config
}

func NewRestoreService(logger *slog.Logger, conf config.Config) *RestoreService {
	return &RestoreService{
		logger: logger,
		config: conf,
	}
}

// Restore restores a backup from the given backup directory.
// This is a full replace: the existing database is replaced entirely.
// If the backup includes images and restoreImages is true, the image directory is replaced too.
func (s *RestoreService) Restore(ctx context.Context, backupDir string, restoreImages bool) error {
	// Read and validate metadata
	metadataPath := filepath.Join(backupDir, metadataFileName)
	metadata, err := readMetadata(metadataPath)
	if err != nil {
		return fmt.Errorf("read backup metadata: %w", err)
	}

	if metadata.Version > currentVersion {
		return fmt.Errorf("backup version %d is newer than supported version %d", metadata.Version, currentVersion)
	}

	s.logger.Info("starting restore", "backupDir", backupDir, "includesImages", metadata.IncludesImages, "restoreImages", restoreImages)

	// Restore database
	dbSource := filepath.Join(backupDir, metadata.DatabaseFileName)
	dbDest := s.databasePath()

	// Ensure target directory exists
	if err := os.MkdirAll(filepath.Dir(dbDest), 0755); err != nil {
		return fmt.Errorf("create config directory: %w", err)
	}

	if err := copyFile(dbSource, dbDest); err != nil {
		return fmt.Errorf("restore database: %w", err)
	}

	// Optionally restore images
	if restoreImages && metadata.IncludesImages {
		imagesSource := filepath.Join(backupDir, imagesDirName)
		if _, err := os.Stat(imagesSource); err == nil {
			// Remove existing images directory and replace
			imagesDest := s.config.ImageRootDirectory
			if err := os.RemoveAll(imagesDest); err != nil {
				return fmt.Errorf("remove existing images: %w", err)
			}
			if err := copyDirectory(ctx, imagesSource, imagesDest); err != nil {
				return fmt.Errorf("restore images: %w", err)
			}
		}
	}

	s.logger.Info("restore completed", "backupDir", backupDir)
	return nil
}

func (s *RestoreService) databasePath() string {
	return filepath.Join(s.config.ConfigDirectory, string(s.config.Environment)+"_v1.sqlite")
}
