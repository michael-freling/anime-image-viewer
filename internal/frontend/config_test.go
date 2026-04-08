package frontend

import (
	"context"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"testing"

	"github.com/michael-freling/anime-image-viewer/internal/config"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newConfigTestLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func TestConfigFrontendService_GetConfig(t *testing.T) {
	conf := config.Config{
		ImageRootDirectory: "/tmp/images",
		ConfigDirectory:    "/tmp/config",
		LogDirectory:       "/tmp/logs",
		Backup: config.BackupConfig{
			BackupDirectory:   "/tmp/backups",
			RetentionCount:    5,
			IdleBackupEnabled: true,
			IdleMinutes:       20,
		},
	}

	svc := NewConfigFrontendService(newConfigTestLogger(), conf)
	got := svc.GetConfig(context.Background())

	assert.Equal(t, "/tmp/images", got.ImageRootDirectory)
	assert.Equal(t, "/tmp/config", got.ConfigDirectory)
	assert.Equal(t, "/tmp/logs", got.LogDirectory)
	assert.Equal(t, "/tmp/backups", got.BackupDirectory)
	assert.Equal(t, 5, got.RetentionCount)
	assert.True(t, got.IdleBackupEnabled)
	assert.Equal(t, 20, got.IdleMinutes)
}

func TestConfigFrontendService_UpdateConfig(t *testing.T) {
	tempHome := t.TempDir()
	t.Setenv("HOME", tempHome)

	conf := config.Config{
		ImageRootDirectory: "/old/images",
		ConfigDirectory:    "/old/config",
		LogDirectory:       "/old/logs",
		Backup: config.BackupConfig{
			BackupDirectory:   "/old/backups",
			RetentionCount:    3,
			IdleBackupEnabled: false,
			IdleMinutes:       10,
		},
	}

	svc := NewConfigFrontendService(newConfigTestLogger(), conf)

	newSettings := ConfigSettings{
		ImageRootDirectory: "/new/images",
		ConfigDirectory:    "/new/config",
		LogDirectory:       "/new/logs",
		BackupDirectory:    "/new/backups",
		RetentionCount:     10,
		IdleBackupEnabled:  true,
		IdleMinutes:        60,
	}

	err := svc.UpdateConfig(context.Background(), newSettings)
	require.NoError(t, err)

	// Verify in-memory state was updated
	got := svc.GetConfig(context.Background())
	assert.Equal(t, "/new/images", got.ImageRootDirectory)
	assert.Equal(t, "/new/config", got.ConfigDirectory)
	assert.Equal(t, "/new/logs", got.LogDirectory)
	assert.Equal(t, "/new/backups", got.BackupDirectory)
	assert.Equal(t, 10, got.RetentionCount)
	assert.True(t, got.IdleBackupEnabled)
	assert.Equal(t, 60, got.IdleMinutes)

	// Verify the file was written to disk
	expectedFile := filepath.Join(tempHome, ".config", "anime-image-viewer", "default.toml")
	_, statErr := os.Stat(expectedFile)
	assert.NoError(t, statErr, "config file should exist at default path")

	// Read back from disk and verify
	diskConf, err := config.ReadConfig(expectedFile)
	require.NoError(t, err)
	assert.Equal(t, "/new/images", diskConf.ImageRootDirectory)
	assert.Equal(t, "/new/config", diskConf.ConfigDirectory)
	assert.Equal(t, "/new/logs", diskConf.LogDirectory)
	assert.Equal(t, "/new/backups", diskConf.Backup.BackupDirectory)
	assert.Equal(t, 10, diskConf.Backup.RetentionCount)
	assert.True(t, diskConf.Backup.IdleBackupEnabled)
	assert.Equal(t, 60, diskConf.Backup.IdleMinutes)
}

func TestConfigFrontendService_GetDefaultConfig(t *testing.T) {
	conf := config.Config{}
	svc := NewConfigFrontendService(newConfigTestLogger(), conf)

	got, err := svc.GetDefaultConfig(context.Background())
	require.NoError(t, err)

	// Verify defaults are populated
	assert.NotEmpty(t, got.ImageRootDirectory)
	assert.NotEmpty(t, got.ConfigDirectory)
	assert.NotEmpty(t, got.LogDirectory)
	assert.NotEmpty(t, got.BackupDirectory)
	assert.Equal(t, 7, got.RetentionCount)
	assert.Equal(t, 30, got.IdleMinutes)
	assert.True(t, got.IdleBackupIncludeImages)
}

func TestConfigFrontendService_UpdateConfig_WriteError(t *testing.T) {
	// Set HOME to an unwritable path so WriteConfig("", ...) fails
	t.Setenv("HOME", "/nonexistent/path/that/does/not/exist")

	conf := config.Config{
		ImageRootDirectory: "/old/images",
		ConfigDirectory:    "/old/config",
	}

	svc := NewConfigFrontendService(newConfigTestLogger(), conf)

	newSettings := ConfigSettings{
		ImageRootDirectory: "/new/images",
		ConfigDirectory:    "/new/config",
	}

	err := svc.UpdateConfig(context.Background(), newSettings)
	assert.Error(t, err, "UpdateConfig should fail when config file cannot be written")
}

func TestConfigFrontendService_RoundTrip(t *testing.T) {
	tempHome := t.TempDir()
	t.Setenv("HOME", tempHome)

	conf := config.Config{
		ImageRootDirectory: "/start/images",
		ConfigDirectory:    "/start/config",
		LogDirectory:       "/start/logs",
		Backup: config.BackupConfig{
			BackupDirectory:   "/start/backups",
			RetentionCount:    7,
			IdleBackupEnabled: true,
			IdleMinutes:       30,
		},
	}

	svc := NewConfigFrontendService(newConfigTestLogger(), conf)

	// Get config, modify it, update, and verify round-trip
	original := svc.GetConfig(context.Background())
	original.RetentionCount = 14
	original.IdleMinutes = 45
	original.IdleBackupEnabled = false

	err := svc.UpdateConfig(context.Background(), original)
	require.NoError(t, err)

	updated := svc.GetConfig(context.Background())
	assert.Equal(t, 14, updated.RetentionCount)
	assert.Equal(t, 45, updated.IdleMinutes)
	assert.False(t, updated.IdleBackupEnabled)
	// Unchanged fields should remain the same
	assert.Equal(t, "/start/images", updated.ImageRootDirectory)
	assert.Equal(t, "/start/config", updated.ConfigDirectory)
	assert.Equal(t, "/start/logs", updated.LogDirectory)
	assert.Equal(t, "/start/backups", updated.BackupDirectory)
}
