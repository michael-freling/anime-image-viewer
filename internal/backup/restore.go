package backup

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"

	"github.com/michael-freling/anime-image-viewer/internal/config"
	"github.com/michael-freling/anime-image-viewer/internal/image"
)

var (
	ErrNoValidBackup = errors.New("no valid backup found for file")
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
// If TargetDirectory is set, the database is restored into that directory and
// images are restored into TargetDirectory/images/, allowing testing without
// overwriting existing data.
type RestoreOptions struct {
	RestoreImages   bool
	TargetDirectory string
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
	imageDir := s.config.ImageRootDirectory
	useTargetDir := opts.TargetDirectory != ""
	if useTargetDir {
		configDir = opts.TargetDirectory
		imageDir = filepath.Join(opts.TargetDirectory, "images")
	}

	// Restore database
	dbSource := filepath.Join(backupDir, metadata.DatabaseFileName)
	dbDest := filepath.Join(configDir, string(s.config.Environment)+"_v1.sqlite")

	// Check if the target database is the currently active database.
	// If so, the app has the file locked and the copy would produce a corrupt/empty file.
	activeDB := filepath.Join(s.config.ConfigDirectory, string(s.config.Environment)+"_v1.sqlite")
	if !useTargetDir && dbDest == activeDB {
		// Restoring to the active config directory — the app will lock the file.
		// We copy to a temp file and rename, which is more likely to succeed.
		s.logger.Warn("restoring database to the active config directory; a restart is required")
	}

	// Ensure target directory exists
	if err := os.MkdirAll(filepath.Dir(dbDest), 0755); err != nil {
		return fmt.Errorf("create config directory: %w", err)
	}

	if err := copyFile(dbSource, dbDest); err != nil {
		return fmt.Errorf("restore database: %w", err)
	}

	// Verify the copy was successful by checking file sizes match
	srcInfo, err := os.Stat(dbSource)
	if err != nil {
		return fmt.Errorf("stat source database: %w", err)
	}
	dstInfo, err := os.Stat(dbDest)
	if err != nil {
		return fmt.Errorf("stat destination database: %w", err)
	}
	if srcInfo.Size() != dstInfo.Size() {
		return fmt.Errorf("restore database: file size mismatch (source=%d, dest=%d); the database may be locked by the running application", srcInfo.Size(), dstInfo.Size())
	}

	// Optionally restore images
	if opts.RestoreImages && metadata.IncludesImages {
		imagesSource := filepath.Join(backupDir, imagesDirName)
		if _, err := os.Stat(imagesSource); err == nil {
			// When restoring to the default location, remove existing images first.
			// When restoring to a target directory, just copy into it.
			if !useTargetDir {
				if err := os.RemoveAll(imageDir); err != nil {
					return fmt.Errorf("remove existing images: %w", err)
				}
			}
			if err := copyDirectory(ctx, imagesSource, imageDir); err != nil {
				return fmt.Errorf("restore images: %w", err)
			}
		}
	}

	s.logger.Info("restore completed", "backupDir", backupDir, "configDir", configDir, "imageDir", imageDir)
	return nil
}

// RestoreSingleFile attempts to restore a single corrupted image file from the
// newest available backup. relativeFilePath is the path of the image relative to
// imageRootDir (e.g. "photos/vacation/beach.jpg"). The method iterates through
// backups from newest to oldest, looking for a valid copy of the file.
func (s *RestoreService) RestoreSingleFile(ctx context.Context, relativeFilePath string, imageRootDir string) error {
	backupService := NewBackupService(s.logger, s.config)
	backups, err := backupService.ListBackups()
	if err != nil {
		return fmt.Errorf("list backups: %w", err)
	}

	if len(backups) == 0 {
		return fmt.Errorf("%w: %s (no backups exist)", ErrNoValidBackup, relativeFilePath)
	}

	for _, backup := range backups {
		if !backup.IncludesImages {
			s.logger.DebugContext(ctx, "skipping backup without images",
				"backupPath", backup.Path,
				"relativeFilePath", relativeFilePath,
			)
			continue
		}

		backupImagePath := filepath.Join(backup.Path, imagesDirName, relativeFilePath)

		// Check if the file exists in this backup
		if _, err := os.Stat(backupImagePath); err != nil {
			s.logger.DebugContext(ctx, "file not found in backup",
				"backupPath", backup.Path,
				"backupImagePath", backupImagePath,
				"relativeFilePath", relativeFilePath,
			)
			continue
		}

		// Validate the backup copy is not also corrupted
		if err := image.ValidateImageFile(backupImagePath); err != nil {
			s.logger.WarnContext(ctx, "backup copy is also corrupted",
				"backupPath", backup.Path,
				"backupImagePath", backupImagePath,
				"error", err,
			)
			continue
		}

		// Copy the valid backup to the original location
		destPath := filepath.Join(imageRootDir, relativeFilePath)
		if err := os.MkdirAll(filepath.Dir(destPath), 0755); err != nil {
			return fmt.Errorf("create parent directory for %s: %w", destPath, err)
		}
		if err := copyFile(backupImagePath, destPath); err != nil {
			return fmt.Errorf("copy restored file: %w", err)
		}

		s.logger.InfoContext(ctx, "restored file from backup",
			"relativeFilePath", relativeFilePath,
			"backupPath", backup.Path,
			"destPath", destPath,
		)
		return nil
	}

	return fmt.Errorf("%w: %s", ErrNoValidBackup, relativeFilePath)
}

