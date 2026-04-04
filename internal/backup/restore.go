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

// RestoreOptions configures where to restore data.
// If TargetConfigDir or TargetImageDir are set, the restore writes to those
// directories instead of the configured defaults, allowing testing without
// overwriting existing data.
type RestoreOptions struct {
	RestoreImages  bool
	TargetConfigDir string
	TargetImageDir  string
}

// Restore restores a backup from the given backup directory.
// This is a full replace: the existing database is replaced entirely.
// If the backup includes images and opts.RestoreImages is true, the image directory is replaced too.
func (s *RestoreService) Restore(ctx context.Context, backupDir string, opts RestoreOptions) error {
	// Read and validate metadata
	metadataPath := filepath.Join(backupDir, metadataFileName)
	metadata, err := readMetadata(metadataPath)
	if err != nil {
		return fmt.Errorf("read backup metadata: %w", err)
	}

	if metadata.Version > currentVersion {
		return fmt.Errorf("backup version %d is newer than supported version %d", metadata.Version, currentVersion)
	}

	s.logger.Info("starting restore", "backupDir", backupDir, "includesImages", metadata.IncludesImages, "restoreImages", opts.RestoreImages)

	// Determine target directories
	configDir := s.config.ConfigDirectory
	if opts.TargetConfigDir != "" {
		configDir = opts.TargetConfigDir
	}
	imageDir := s.config.ImageRootDirectory
	if opts.TargetImageDir != "" {
		imageDir = opts.TargetImageDir
	}

	// Restore database
	dbSource := filepath.Join(backupDir, metadata.DatabaseFileName)
	dbDest := filepath.Join(configDir, string(s.config.Environment)+"_v1.sqlite")

	// Ensure target directory exists
	if err := os.MkdirAll(filepath.Dir(dbDest), 0755); err != nil {
		return fmt.Errorf("create config directory: %w", err)
	}

	if err := copyFile(dbSource, dbDest); err != nil {
		return fmt.Errorf("restore database: %w", err)
	}

	// Optionally restore images
	if opts.RestoreImages && metadata.IncludesImages {
		imagesSource := filepath.Join(backupDir, imagesDirName)
		if _, err := os.Stat(imagesSource); err == nil {
			if err := os.RemoveAll(imageDir); err != nil {
				return fmt.Errorf("remove existing images: %w", err)
			}
			if err := copyDirectory(ctx, imagesSource, imageDir); err != nil {
				return fmt.Errorf("restore images: %w", err)
			}
		}
	}

	s.logger.Info("restore completed", "backupDir", backupDir, "configDir", configDir, "imageDir", imageDir)
	return nil
}

