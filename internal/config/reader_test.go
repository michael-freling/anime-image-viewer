package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestWriteConfig_RoundTrip(t *testing.T) {
	tmpFile := filepath.Join(t.TempDir(), "write-test.toml")

	original := Config{
		ImageRootDirectory: "/tmp/images",
		ConfigDirectory:    "/tmp/config",
		LogDirectory:       "/tmp/logs",
		Backup: BackupConfig{
			BackupDirectory:   "/tmp/backups",
			RetentionCount:    5,
			IdleBackupEnabled: true,
			IdleMinutes:       45,
		},
		Environment: "development",
	}

	err := WriteConfig(tmpFile, original)
	require.NoError(t, err)

	got, err := ReadConfig(tmpFile)
	require.NoError(t, err)

	assert.Equal(t, original.ImageRootDirectory, got.ImageRootDirectory)
	assert.Equal(t, original.ConfigDirectory, got.ConfigDirectory)
	assert.Equal(t, original.LogDirectory, got.LogDirectory)
	assert.Equal(t, original.Backup.BackupDirectory, got.Backup.BackupDirectory)
	assert.Equal(t, original.Backup.RetentionCount, got.Backup.RetentionCount)
	assert.Equal(t, original.Backup.IdleBackupEnabled, got.Backup.IdleBackupEnabled)
	assert.Equal(t, original.Backup.IdleMinutes, got.Backup.IdleMinutes)
}

func TestWriteConfig_ExcludesEnvironment(t *testing.T) {
	tmpFile := filepath.Join(t.TempDir(), "env-test.toml")

	conf := Config{
		ImageRootDirectory: "/tmp/images",
		ConfigDirectory:    "/tmp/config",
		LogDirectory:       "/tmp/logs",
		Backup: BackupConfig{
			BackupDirectory: "/tmp/backups",
			RetentionCount:  7,
			IdleMinutes:     30,
		},
		Environment: "development",
	}

	err := WriteConfig(tmpFile, conf)
	require.NoError(t, err)

	// Read the raw file content and verify Environment is not written
	content, err := os.ReadFile(tmpFile)
	require.NoError(t, err)
	assert.NotContains(t, string(content), "environment")
	assert.NotContains(t, string(content), "development")
}

func TestWriteConfig_DefaultPath(t *testing.T) {
	tempHome := t.TempDir()
	t.Setenv("HOME", tempHome)

	conf := Config{
		ImageRootDirectory: "/tmp/images",
		ConfigDirectory:    "/tmp/config",
		LogDirectory:       "/tmp/logs",
		Backup: BackupConfig{
			BackupDirectory: "/tmp/backups",
			RetentionCount:  7,
			IdleMinutes:     30,
		},
	}

	err := WriteConfig("", conf)
	require.NoError(t, err)

	expectedFile := filepath.Join(tempHome, ".config", "anime-image-viewer", "config.toml")
	_, statErr := os.Stat(expectedFile)
	assert.NoError(t, statErr, "config file should exist at default path")

	// Read it back to verify
	got, err := ReadConfig(expectedFile)
	require.NoError(t, err)
	assert.Equal(t, "/tmp/images", got.ImageRootDirectory)
}

func TestWriteConfig_CreatesParentDirectory(t *testing.T) {
	tmpDir := filepath.Join(t.TempDir(), "nested", "dir")
	tmpFile := filepath.Join(tmpDir, "config.toml")

	conf := Config{
		ImageRootDirectory: "/tmp/images",
	}

	// The file is inside a non-existent directory, so Create will fail.
	// WriteConfig with an explicit path does NOT create parent dirs.
	err := WriteConfig(tmpFile, conf)
	assert.Error(t, err, "WriteConfig should fail when parent directory does not exist for explicit path")
}

func TestWriteConfig_OverwritesExisting(t *testing.T) {
	tmpFile := filepath.Join(t.TempDir(), "overwrite.toml")

	first := Config{
		ImageRootDirectory: "/first",
		Backup: BackupConfig{
			RetentionCount: 3,
			IdleMinutes:    10,
		},
	}
	err := WriteConfig(tmpFile, first)
	require.NoError(t, err)

	second := Config{
		ImageRootDirectory: "/second",
		Backup: BackupConfig{
			RetentionCount: 9,
			IdleMinutes:    60,
		},
	}
	err = WriteConfig(tmpFile, second)
	require.NoError(t, err)

	got, err := ReadConfig(tmpFile)
	require.NoError(t, err)
	assert.Equal(t, "/second", got.ImageRootDirectory)
	assert.Equal(t, 9, got.Backup.RetentionCount)
	assert.Equal(t, 60, got.Backup.IdleMinutes)
}

func TestReadConfig_BackupDefaults(t *testing.T) {
	// Use a temp directory as HOME so ReadConfig creates its default config path
	// there instead of touching the real home directory.
	tempHome := t.TempDir()
	t.Setenv("HOME", tempHome)

	conf, err := ReadConfig("")
	require.NoError(t, err)

	assert.Equal(t, 7, conf.Backup.RetentionCount)
	assert.Equal(t, 30, conf.Backup.IdleMinutes)

	expectedConfigDir := filepath.Join(tempHome, ".config", "anime-image-viewer")
	assert.True(t, strings.Contains(conf.Backup.BackupDirectory, expectedConfigDir),
		"BackupDirectory %q should contain config directory %q", conf.Backup.BackupDirectory, expectedConfigDir)
	assert.True(t, strings.HasSuffix(conf.Backup.BackupDirectory, "/backups"),
		"BackupDirectory %q should end with /backups", conf.Backup.BackupDirectory)
}

func TestReadConfig_BackupFromTOML(t *testing.T) {
	tomlContent := `
image_root_directory = "/tmp/test-images"
config_directory = "/tmp/test-config"

[backup]
backup_directory = "/tmp/custom-backups"
retention_count = 3
idle_backup_enabled = true
idle_minutes = 15
`
	tmpFile := filepath.Join(t.TempDir(), "test.toml")
	err := os.WriteFile(tmpFile, []byte(tomlContent), 0644)
	require.NoError(t, err)

	conf, err := ReadConfig(tmpFile)
	require.NoError(t, err)

	assert.Equal(t, "/tmp/test-images", conf.ImageRootDirectory)
	assert.Equal(t, "/tmp/test-config", conf.ConfigDirectory)
	assert.Equal(t, "/tmp/custom-backups", conf.Backup.BackupDirectory)
	assert.Equal(t, 3, conf.Backup.RetentionCount)
	assert.True(t, conf.Backup.IdleBackupEnabled)
	assert.Equal(t, 15, conf.Backup.IdleMinutes)
}

func TestReadConfig_BackupPartialTOML(t *testing.T) {
	tomlContent := `
image_root_directory = "/tmp/test-images"
config_directory = "/tmp/test-config"

[backup]
retention_count = 5
`
	tmpFile := filepath.Join(t.TempDir(), "test.toml")
	err := os.WriteFile(tmpFile, []byte(tomlContent), 0644)
	require.NoError(t, err)

	conf, err := ReadConfig(tmpFile)
	require.NoError(t, err)

	// retention_count comes from TOML
	assert.Equal(t, 5, conf.Backup.RetentionCount)

	// idle_minutes should fall back to default
	assert.Equal(t, 30, conf.Backup.IdleMinutes)

	// backup_directory should be derived from config_directory + "/backups"
	expectedBackupDir := filepath.Join("/tmp/test-config", "backups")
	assert.Equal(t, expectedBackupDir, conf.Backup.BackupDirectory)
}

func TestReadConfig_FileNotFound(t *testing.T) {
	_, err := ReadConfig("/nonexistent/path/to/config.toml")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "does not exist")
}

func TestReadConfig_InvalidTOML(t *testing.T) {
	tmpFile := filepath.Join(t.TempDir(), "bad.toml")
	err := os.WriteFile(tmpFile, []byte("this is not valid toml [[["), 0644)
	require.NoError(t, err)

	_, err = ReadConfig(tmpFile)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "toml.Decode")
}

func TestReadConfig_EmptyTOML(t *testing.T) {
	tmpFile := filepath.Join(t.TempDir(), "empty.toml")
	err := os.WriteFile(tmpFile, []byte(""), 0644)
	require.NoError(t, err)

	conf, err := ReadConfig(tmpFile)
	require.NoError(t, err)

	// All backup defaults should be applied
	assert.Equal(t, 7, conf.Backup.RetentionCount)
	assert.Equal(t, 30, conf.Backup.IdleMinutes)
}

func TestReadConfig_ApplyBackupDefaultsAllZero(t *testing.T) {
	// A TOML file that sets config_directory but no backup fields at all
	tomlContent := `
config_directory = "/tmp/my-config"
`
	tmpFile := filepath.Join(t.TempDir(), "test.toml")
	err := os.WriteFile(tmpFile, []byte(tomlContent), 0644)
	require.NoError(t, err)

	conf, err := ReadConfig(tmpFile)
	require.NoError(t, err)

	// All backup defaults should be applied
	assert.Equal(t, filepath.Join("/tmp/my-config", "backups"), conf.Backup.BackupDirectory)
	assert.Equal(t, 7, conf.Backup.RetentionCount)
	assert.Equal(t, 30, conf.Backup.IdleMinutes)
}

func TestReadConfig_ExistingConfigFileDefaultPath(t *testing.T) {
	// Create a fake HOME with a valid config file using the new name
	tempHome := t.TempDir()
	t.Setenv("HOME", tempHome)

	configDir := filepath.Join(tempHome, ".config", "anime-image-viewer")
	require.NoError(t, os.MkdirAll(configDir, 0755))

	tomlContent := `
image_root_directory = "/tmp/images"
config_directory = "/tmp/cfg"

[backup]
retention_count = 10
`
	configFile := filepath.Join(configDir, "config.toml")
	require.NoError(t, os.WriteFile(configFile, []byte(tomlContent), 0644))

	conf, err := ReadConfig("")
	require.NoError(t, err)

	assert.Equal(t, "/tmp/images", conf.ImageRootDirectory)
	assert.Equal(t, "/tmp/cfg", conf.ConfigDirectory)
	assert.Equal(t, 10, conf.Backup.RetentionCount)
	// Defaults should be applied for unset fields
	assert.Equal(t, 30, conf.Backup.IdleMinutes)
	assert.Equal(t, filepath.Join("/tmp/cfg", "backups"), conf.Backup.BackupDirectory)
}

func TestReadConfig_LegacyDefaultTomlFallback(t *testing.T) {
	// When config.toml does not exist but default.toml does, it should be
	// used as the base config for backward compatibility.
	tempHome := t.TempDir()
	t.Setenv("HOME", tempHome)

	configDir := filepath.Join(tempHome, ".config", "anime-image-viewer")
	require.NoError(t, os.MkdirAll(configDir, 0755))

	tomlContent := `
image_root_directory = "/tmp/legacy-images"
config_directory = "/tmp/legacy-cfg"

[backup]
retention_count = 12
`
	legacyFile := filepath.Join(configDir, "default.toml")
	require.NoError(t, os.WriteFile(legacyFile, []byte(tomlContent), 0644))

	conf, err := ReadConfig("")
	require.NoError(t, err)

	assert.Equal(t, "/tmp/legacy-images", conf.ImageRootDirectory)
	assert.Equal(t, "/tmp/legacy-cfg", conf.ConfigDirectory)
	assert.Equal(t, 12, conf.Backup.RetentionCount)
	assert.Equal(t, 30, conf.Backup.IdleMinutes)
}

func TestReadConfig_ConfigTomlTakesPrecedenceOverDefaultToml(t *testing.T) {
	// When both config.toml and default.toml exist, only config.toml is used
	// as the base (default.toml is the legacy fallback).
	tempHome := t.TempDir()
	t.Setenv("HOME", tempHome)

	configDir := filepath.Join(tempHome, ".config", "anime-image-viewer")
	require.NoError(t, os.MkdirAll(configDir, 0755))

	legacyContent := `image_root_directory = "/tmp/legacy"`
	require.NoError(t, os.WriteFile(filepath.Join(configDir, "default.toml"), []byte(legacyContent), 0644))

	newContent := `image_root_directory = "/tmp/new"`
	require.NoError(t, os.WriteFile(filepath.Join(configDir, "config.toml"), []byte(newContent), 0644))

	conf, err := ReadConfig("")
	require.NoError(t, err)
	assert.Equal(t, "/tmp/new", conf.ImageRootDirectory)
}

func TestReadConfig_OverlayOverridesBase(t *testing.T) {
	tempHome := t.TempDir()
	t.Setenv("HOME", tempHome)

	configDir := filepath.Join(tempHome, ".config", "anime-image-viewer")
	require.NoError(t, os.MkdirAll(configDir, 0755))

	baseContent := `
image_root_directory = "/base/images"
config_directory = "/base/cfg"
log_directory = "/base/logs"

[backup]
backup_directory = "/base/backups"
retention_count = 5
idle_minutes = 20
`
	require.NoError(t, os.WriteFile(filepath.Join(configDir, "config.toml"), []byte(baseContent), 0644))

	// The overlay only overrides image_root_directory and backup.retention_count.
	overlayContent := `
image_root_directory = "/dev/images"

[backup]
retention_count = 99
`
	overlayFile := filepath.Join(configDir, fmt.Sprintf("config.%s.toml", runtimeEnv))
	require.NoError(t, os.WriteFile(overlayFile, []byte(overlayContent), 0644))

	conf, err := ReadConfig("")
	require.NoError(t, err)

	// Overridden by overlay
	assert.Equal(t, "/dev/images", conf.ImageRootDirectory)
	assert.Equal(t, 99, conf.Backup.RetentionCount)

	// Preserved from base
	assert.Equal(t, "/base/cfg", conf.ConfigDirectory)
	assert.Equal(t, "/base/logs", conf.LogDirectory)
	assert.Equal(t, "/base/backups", conf.Backup.BackupDirectory)
	assert.Equal(t, 20, conf.Backup.IdleMinutes)
}

func TestReadConfig_OverlayOnlyNoBase(t *testing.T) {
	tempHome := t.TempDir()
	t.Setenv("HOME", tempHome)

	configDir := filepath.Join(tempHome, ".config", "anime-image-viewer")
	require.NoError(t, os.MkdirAll(configDir, 0755))

	// No config.toml and no default.toml — only the overlay exists.
	overlayContent := `
image_root_directory = "/overlay-only/images"
`
	overlayFile := filepath.Join(configDir, fmt.Sprintf("config.%s.toml", runtimeEnv))
	require.NoError(t, os.WriteFile(overlayFile, []byte(overlayContent), 0644))

	conf, err := ReadConfig("")
	require.NoError(t, err)

	// Overlay value
	assert.Equal(t, "/overlay-only/images", conf.ImageRootDirectory)

	// Defaults still apply for everything else
	assert.Equal(t, configDir, conf.ConfigDirectory)
	assert.Equal(t, 7, conf.Backup.RetentionCount)
	assert.Equal(t, 30, conf.Backup.IdleMinutes)
}

func TestReadConfig_NeitherBaseNorOverlay(t *testing.T) {
	tempHome := t.TempDir()
	t.Setenv("HOME", tempHome)

	conf, err := ReadConfig("")
	require.NoError(t, err)

	// All defaults should be present
	configDir := filepath.Join(tempHome, ".config", "anime-image-viewer")
	assert.Equal(t, configDir, conf.ConfigDirectory)
	assert.Equal(t, 7, conf.Backup.RetentionCount)
	assert.Equal(t, 30, conf.Backup.IdleMinutes)
	assert.NotEmpty(t, conf.ImageRootDirectory)
	assert.NotEmpty(t, conf.Environment)
}

func TestReadConfig_UnreadableFile(t *testing.T) {
	tmpFile := filepath.Join(t.TempDir(), "unreadable.toml")
	require.NoError(t, os.WriteFile(tmpFile, []byte("key = \"value\""), 0644))

	// Remove read permissions
	require.NoError(t, os.Chmod(tmpFile, 0000))
	t.Cleanup(func() {
		os.Chmod(tmpFile, 0644) // restore for cleanup
	})

	_, err := ReadConfig(tmpFile)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "os.OpenFile")
}

func TestDefaultConfig(t *testing.T) {
	conf, err := DefaultConfig()
	require.NoError(t, err)

	homeDir, err := os.UserHomeDir()
	require.NoError(t, err)

	// Verify ImageRootDirectory contains the home directory
	assert.Contains(t, conf.ImageRootDirectory, homeDir)
	assert.Contains(t, conf.ImageRootDirectory, "anime-image-viewer")

	// Verify ConfigDirectory
	expectedConfigDir := filepath.Join(homeDir, ".config", "anime-image-viewer")
	assert.Equal(t, expectedConfigDir, conf.ConfigDirectory)

	// Verify LogDirectory contains temp dir
	assert.Contains(t, conf.LogDirectory, "anime-image-viewer")
	assert.Contains(t, conf.LogDirectory, "logs")

	// Verify Backup defaults
	assert.Equal(t, filepath.Join(expectedConfigDir, "backups"), conf.Backup.BackupDirectory)
	assert.Equal(t, 7, conf.Backup.RetentionCount)
	assert.Equal(t, 30, conf.Backup.IdleMinutes)
	assert.True(t, conf.Backup.IdleBackupIncludeImages)

	// Verify Environment is set
	assert.NotEmpty(t, conf.Environment)
}

func TestDefaultImageRootDirectory(t *testing.T) {
	homeDir := "/fake/home"
	got := defaultImageRootDirectory(homeDir)
	assert.Contains(t, got, homeDir)
	assert.Contains(t, got, "anime-image-viewer")
	// In development mode (the default for tests), it should contain the environment suffix
	if runtimeEnv == EnvironmentDevelopment {
		assert.Contains(t, got, string(EnvironmentDevelopment))
	}
}

func TestReadConfig_BackupAllFieldsExplicit(t *testing.T) {
	tomlContent := `
image_root_directory = "/tmp/images"
config_directory = "/tmp/cfg"

[backup]
backup_directory = "/tmp/backups"
retention_count = 14
idle_backup_enabled = false
idle_minutes = 60
`
	tmpFile := filepath.Join(t.TempDir(), "full.toml")
	require.NoError(t, os.WriteFile(tmpFile, []byte(tomlContent), 0644))

	conf, err := ReadConfig(tmpFile)
	require.NoError(t, err)

	assert.Equal(t, "/tmp/backups", conf.Backup.BackupDirectory)
	assert.Equal(t, 14, conf.Backup.RetentionCount)
	assert.False(t, conf.Backup.IdleBackupEnabled)
	assert.Equal(t, 60, conf.Backup.IdleMinutes)
}
