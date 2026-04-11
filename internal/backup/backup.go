package backup

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/michael-freling/anime-image-viewer/internal/config"
	"github.com/michael-freling/anime-image-viewer/internal/image"
)

type BackupService struct {
	logger         *slog.Logger
	config         config.Config
	restoreService *RestoreService
}

func NewBackupService(logger *slog.Logger, conf config.Config) *BackupService {
	return &BackupService{
		logger: logger,
		config: conf,
	}
}

// SetRestoreService sets the restore service used for pre-backup validation.
// When set, the backup process will validate image files and attempt to restore
// corrupted ones from existing backups before copying them into the new backup.
func (s *BackupService) SetRestoreService(rs *RestoreService) {
	s.restoreService = rs
}

// Backup creates a backup of the database and optionally images.
// destDir is the parent directory where the backup folder will be created.
// If destDir is empty, uses the configured backup directory.
func (s *BackupService) Backup(ctx context.Context, destDir string, includeImages bool) (string, error) {
	if destDir == "" {
		destDir = s.config.Backup.BackupDirectory
	}

	if err := os.MkdirAll(destDir, 0755); err != nil {
		return "", fmt.Errorf("create backup directory: %w", err)
	}

	// Create timestamped backup folder
	timestamp := time.Now().Format("2006-01-02T15-04-05")
	backupDir := filepath.Join(destDir, "backup_"+timestamp)
	if err := os.MkdirAll(backupDir, 0755); err != nil {
		return "", fmt.Errorf("create backup folder: %w", err)
	}

	s.logger.Info("starting backup", "directory", backupDir, "includeImages", includeImages)

	// Copy database file
	dbSource := s.databasePath()
	dbDest := filepath.Join(backupDir, databaseFileName)
	if err := copyFile(dbSource, dbDest); err != nil {
		return "", fmt.Errorf("copy database: %w", err)
	}

	// Optionally copy images
	if includeImages {
		// Validate and restore corrupted images before copying them into the backup
		if s.restoreService != nil {
			s.validateAndRestoreImages(ctx)
		}

		imagesDir := filepath.Join(backupDir, imagesDirName)
		if err := copyDirectory(ctx, s.config.ImageRootDirectory, imagesDir); err != nil {
			return "", fmt.Errorf("copy images: %w", err)
		}
	}

	// Write metadata
	metadata := BackupMetadata{
		Version:          currentVersion,
		CreatedAt:        time.Now(),
		IncludesImages:   includeImages,
		ImageRootDir:     s.config.ImageRootDirectory,
		DatabaseFileName: databaseFileName,
	}
	if err := writeMetadata(filepath.Join(backupDir, metadataFileName), metadata); err != nil {
		return "", fmt.Errorf("write metadata: %w", err)
	}

	// Enforce retention
	if err := s.enforceRetention(destDir); err != nil {
		s.logger.Warn("failed to enforce retention", "error", err)
		// Don't fail the backup for retention issues
	}

	s.logger.Info("backup completed", "directory", backupDir)
	return backupDir, nil
}

// validateAndRestoreImages walks the image root directory, validates each image
// file, and attempts to restore corrupted ones from existing backups.
func (s *BackupService) validateAndRestoreImages(ctx context.Context) {
	imageRootDir := s.config.ImageRootDirectory
	s.logger.Info("backup: validating images before backup", "imageRootDir", imageRootDir)

	var validated, corrupted, restored, failedRestore int

	err := filepath.Walk(imageRootDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}
		if info.IsDir() {
			return nil
		}

		if valErr := image.ValidateImageFile(path); valErr != nil {
			corrupted++
			relPath, relErr := filepath.Rel(imageRootDir, path)
			if relErr != nil {
				s.logger.Warn("backup: failed to compute relative path for corrupted image",
					"path", path, "error", relErr,
				)
				failedRestore++
				validated++
				return nil
			}

			s.logger.Warn("backup: corrupted image detected, attempting restore",
				"path", path, "error", valErr,
			)
			if restoreErr := s.restoreService.RestoreSingleFile(ctx, relPath, imageRootDir); restoreErr != nil {
				s.logger.Warn("backup: failed to restore corrupted image before backup",
					"path", path, "error", restoreErr,
				)
				failedRestore++
			} else {
				s.logger.Info("backup: restored corrupted image before backup", "path", path)
				restored++
			}
		}

		validated++
		return nil
	})

	if err != nil {
		s.logger.Warn("backup: error walking image directory for validation", "error", err)
	}

	s.logger.Info("backup: image validation complete",
		"validated", validated, "corrupted", corrupted, "restored", restored, "failedRestore", failedRestore,
	)
}

// HasRecentBackup checks if a backup exists within the given duration.
func (s *BackupService) HasRecentBackup(within time.Duration) (bool, error) {
	backupDir := s.config.Backup.BackupDirectory
	entries, err := os.ReadDir(backupDir)
	if err != nil {
		if os.IsNotExist(err) {
			return false, nil
		}
		return false, err
	}

	cutoff := time.Now().Add(-within)
	for _, entry := range entries {
		if !entry.IsDir() || !strings.HasPrefix(entry.Name(), "backup_") {
			continue
		}
		metadataPath := filepath.Join(backupDir, entry.Name(), metadataFileName)
		metadata, err := readMetadata(metadataPath)
		if err != nil {
			continue // skip invalid backups
		}
		if metadata.CreatedAt.After(cutoff) {
			return true, nil
		}
	}
	return false, nil
}

func (s *BackupService) databasePath() string {
	return filepath.Join(s.config.ConfigDirectory, string(s.config.Environment)+"_v1.sqlite")
}

func (s *BackupService) enforceRetention(backupParentDir string) error {
	entries, err := os.ReadDir(backupParentDir)
	if err != nil {
		return err
	}

	var backupDirs []os.DirEntry
	for _, entry := range entries {
		if entry.IsDir() && strings.HasPrefix(entry.Name(), "backup_") {
			backupDirs = append(backupDirs, entry)
		}
	}

	if len(backupDirs) <= s.config.Backup.RetentionCount {
		return nil
	}

	// Sort by name (which includes timestamp) ascending
	sort.Slice(backupDirs, func(i, j int) bool {
		return backupDirs[i].Name() < backupDirs[j].Name()
	})

	// Remove oldest backups exceeding retention count
	toRemove := len(backupDirs) - s.config.Backup.RetentionCount
	for i := range toRemove {
		dirPath := filepath.Join(backupParentDir, backupDirs[i].Name())
		s.logger.Info("removing old backup", "directory", dirPath)
		if err := os.RemoveAll(dirPath); err != nil {
			return fmt.Errorf("remove old backup %s: %w", dirPath, err)
		}
	}
	return nil
}

// ListBackups returns metadata of all backups sorted by creation time (newest first).
func (s *BackupService) ListBackups() ([]BackupMetadata, error) {
	backupDir := s.config.Backup.BackupDirectory
	entries, err := os.ReadDir(backupDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}

	var backups []BackupMetadata
	for _, entry := range entries {
		if !entry.IsDir() || !strings.HasPrefix(entry.Name(), "backup_") {
			continue
		}
		metadataPath := filepath.Join(backupDir, entry.Name(), metadataFileName)
		metadata, err := readMetadata(metadataPath)
		if err != nil {
			continue
		}
		metadata.Path = filepath.Join(backupDir, entry.Name())
		backups = append(backups, metadata)
	}

	sort.Slice(backups, func(i, j int) bool {
		return backups[i].CreatedAt.After(backups[j].CreatedAt)
	})
	return backups, nil
}

// DeleteBackup deletes a backup directory.
// It verifies that backupDir is inside the configured backup directory to prevent deleting arbitrary paths.
func (s *BackupService) DeleteBackup(backupDir string) error {
	configuredDir := s.config.Backup.BackupDirectory

	absBackupDir, err := filepath.Abs(backupDir)
	if err != nil {
		return fmt.Errorf("resolve backup path: %w", err)
	}
	absConfiguredDir, err := filepath.Abs(configuredDir)
	if err != nil {
		return fmt.Errorf("resolve configured backup directory: %w", err)
	}

	// Security check: ensure the backup directory is inside the configured backup directory
	rel, err := filepath.Rel(absConfiguredDir, absBackupDir)
	if err != nil || strings.HasPrefix(rel, "..") || rel == "." {
		return fmt.Errorf("backup path %q is not inside the configured backup directory %q", backupDir, configuredDir)
	}

	s.logger.Info("deleting backup", "directory", absBackupDir)
	if err := os.RemoveAll(absBackupDir); err != nil {
		return fmt.Errorf("delete backup directory: %w", err)
	}

	return nil
}

// Helper functions

func copyFile(src, dst string) error {
	sourceFile, err := os.Open(src)
	if err != nil {
		return fmt.Errorf("open source: %w", err)
	}
	defer sourceFile.Close()

	destFile, err := os.Create(dst)
	if err != nil {
		return fmt.Errorf("create destination: %w", err)
	}
	defer destFile.Close()

	if _, err := io.Copy(destFile, sourceFile); err != nil {
		return fmt.Errorf("copy: %w", err)
	}
	return destFile.Sync()
}

func copyDirectory(ctx context.Context, src, dst string) error {
	return filepath.Walk(src, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		relPath, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		destPath := filepath.Join(dst, relPath)

		if info.IsDir() {
			return os.MkdirAll(destPath, info.Mode())
		}
		return copyFile(path, destPath)
	})
}

func writeMetadata(path string, metadata BackupMetadata) error {
	data, err := json.MarshalIndent(metadata, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}

func readMetadata(path string) (BackupMetadata, error) {
	var metadata BackupMetadata
	data, err := os.ReadFile(path)
	if err != nil {
		return metadata, err
	}
	err = json.Unmarshal(data, &metadata)
	return metadata, err
}
