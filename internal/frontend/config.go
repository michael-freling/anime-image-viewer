package frontend

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/michael-freling/anime-image-viewer/internal/config"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// ConfigSettings is the JSON-friendly representation of application config for the frontend.
type ConfigSettings struct {
	ImageRootDirectory      string `json:"imageRootDirectory"`
	ConfigDirectory         string `json:"configDirectory"`
	LogDirectory            string `json:"logDirectory"`
	BackupDirectory         string `json:"backupDirectory"`
	RetentionCount          int    `json:"retentionCount"`
	IdleBackupEnabled       bool   `json:"idleBackupEnabled"`
	IdleBackupIncludeImages bool   `json:"idleBackupIncludeImages"`
	IdleMinutes             int    `json:"idleMinutes"`
}

// ConfigFrontendService provides methods for reading and updating application configuration
// from the frontend.
type ConfigFrontendService struct {
	logger *slog.Logger
	config config.Config
}

// NewConfigFrontendService creates a new ConfigFrontendService.
func NewConfigFrontendService(logger *slog.Logger, conf config.Config) *ConfigFrontendService {
	return &ConfigFrontendService{
		logger: logger,
		config: conf,
	}
}

// GetConfig returns the current application configuration as ConfigSettings.
func (s *ConfigFrontendService) GetConfig(ctx context.Context) ConfigSettings {
	return ConfigSettings{
		ImageRootDirectory:      s.config.ImageRootDirectory,
		ConfigDirectory:         s.config.ConfigDirectory,
		LogDirectory:            s.config.LogDirectory,
		BackupDirectory:         s.config.Backup.BackupDirectory,
		RetentionCount:          s.config.Backup.RetentionCount,
		IdleBackupEnabled:       s.config.Backup.IdleBackupEnabled,
		IdleBackupIncludeImages: s.config.Backup.IdleBackupIncludeImages,
		IdleMinutes:             s.config.Backup.IdleMinutes,
	}
}

// UpdateConfig updates the application configuration and writes it to disk.
func (s *ConfigFrontendService) UpdateConfig(ctx context.Context, settings ConfigSettings) error {
	s.config.ImageRootDirectory = settings.ImageRootDirectory
	s.config.ConfigDirectory = settings.ConfigDirectory
	s.config.LogDirectory = settings.LogDirectory
	s.config.Backup.BackupDirectory = settings.BackupDirectory
	s.config.Backup.RetentionCount = settings.RetentionCount
	s.config.Backup.IdleBackupEnabled = settings.IdleBackupEnabled
	s.config.Backup.IdleBackupIncludeImages = settings.IdleBackupIncludeImages
	s.config.Backup.IdleMinutes = settings.IdleMinutes

	if err := config.WriteConfig("", s.config); err != nil {
		return err
	}

	s.logger.Info("config updated and saved")
	return nil
}

// GetDefaultConfig returns the default configuration values.
func (s *ConfigFrontendService) GetDefaultConfig(ctx context.Context) (ConfigSettings, error) {
	defaults, err := config.DefaultConfig()
	if err != nil {
		return ConfigSettings{}, err
	}
	return ConfigSettings{
		ImageRootDirectory:      defaults.ImageRootDirectory,
		ConfigDirectory:         defaults.ConfigDirectory,
		LogDirectory:            defaults.LogDirectory,
		BackupDirectory:         defaults.Backup.BackupDirectory,
		RetentionCount:          defaults.Backup.RetentionCount,
		IdleBackupEnabled:       defaults.Backup.IdleBackupEnabled,
		IdleBackupIncludeImages: defaults.Backup.IdleBackupIncludeImages,
		IdleMinutes:             defaults.Backup.IdleMinutes,
	}, nil
}

// SelectDirectory opens a native directory picker dialog and returns the selected path.
func (s *ConfigFrontendService) SelectDirectory(ctx context.Context) (string, error) {
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
