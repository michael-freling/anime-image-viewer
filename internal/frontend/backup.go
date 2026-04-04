package frontend

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/michael-freling/anime-image-viewer/internal/backup"
	"github.com/michael-freling/anime-image-viewer/internal/config"
	"github.com/wailsapp/wails/v3/pkg/application"
)

type BackupInfo struct {
	CreatedAt      string `json:"createdAt"`
	IncludesImages bool   `json:"includesImages"`
	Path           string `json:"path"`
}

type BackupConfig struct {
	BackupDirectory   string `json:"backupDirectory"`
	RetentionCount    int    `json:"retentionCount"`
	IdleBackupEnabled bool   `json:"idleBackupEnabled"`
	IdleMinutes       int    `json:"idleMinutes"`
}

type BackupFrontendService struct {
	logger         *slog.Logger
	config         config.Config
	backupService  *backup.BackupService
	restoreService *backup.RestoreService
}

func NewBackupFrontendService(
	logger *slog.Logger,
	conf config.Config,
) *BackupFrontendService {
	return &BackupFrontendService{
		logger:         logger,
		config:         conf,
		backupService:  backup.NewBackupService(logger, conf),
		restoreService: backup.NewRestoreService(logger, conf),
	}
}

// Backup creates a backup. Returns the backup directory path.
func (s *BackupFrontendService) Backup(ctx context.Context, includeImages bool) (string, error) {
	return s.backupService.Backup(ctx, "", includeImages)
}

// SelectDirectory opens a native directory picker dialog and returns the selected path.
func (s *BackupFrontendService) SelectDirectory(ctx context.Context) (string, error) {
	path, err := application.OpenFileDialog().
		CanChooseDirectories(true).
		CanChooseFiles(false).
		CanCreateDirectories(true).
		AttachToWindow(application.Get().CurrentWindow()).
		PromptForSingleSelection()
	if err != nil {
		return "", fmt.Errorf("application.OpenFileDialog: %w", err)
	}
	return path, nil
}

// Restore restores from a backup directory path.
func (s *BackupFrontendService) Restore(ctx context.Context, backupPath string, restoreImages bool, targetConfigDir string, targetImageDir string) error {
	return s.restoreService.Restore(ctx, backupPath, backup.RestoreOptions{
		RestoreImages:   restoreImages,
		TargetConfigDir: targetConfigDir,
		TargetImageDir:  targetImageDir,
	})
}

// ListBackups returns all available backups.
func (s *BackupFrontendService) ListBackups(ctx context.Context) ([]BackupInfo, error) {
	backups, err := s.backupService.ListBackups()
	if err != nil {
		return nil, err
	}
	result := make([]BackupInfo, len(backups))
	for i, b := range backups {
		result[i] = BackupInfo{
			CreatedAt:      b.CreatedAt.Format(time.RFC3339),
			IncludesImages: b.IncludesImages,
			Path:           b.Path,
		}
	}
	return result, nil
}

// DeleteBackup deletes a backup by its path.
func (s *BackupFrontendService) DeleteBackup(ctx context.Context, backupPath string) error {
	return s.backupService.DeleteBackup(backupPath)
}

// GetBackupConfig returns the current backup configuration.
func (s *BackupFrontendService) GetBackupConfig(ctx context.Context) BackupConfig {
	return BackupConfig{
		BackupDirectory:   s.config.Backup.BackupDirectory,
		RetentionCount:    s.config.Backup.RetentionCount,
		IdleBackupEnabled: s.config.Backup.IdleBackupEnabled,
		IdleMinutes:       s.config.Backup.IdleMinutes,
	}
}

// RunIdleBackup runs a backup if idle backup is enabled and no backup exists within 24 hours.
// This is called from the frontend when idle time is detected.
func (s *BackupFrontendService) RunIdleBackup(ctx context.Context) (string, error) {
	if !s.config.Backup.IdleBackupEnabled {
		return "", nil
	}

	hasRecent, err := s.backupService.HasRecentBackup(24 * time.Hour)
	if err != nil {
		s.logger.Warn("failed to check recent backup", "error", err)
		return "", err
	}
	if hasRecent {
		s.logger.Debug("skipping idle backup, recent backup exists")
		return "", nil
	}

	s.logger.Info("running idle backup")
	return s.backupService.Backup(ctx, "", false)
}
