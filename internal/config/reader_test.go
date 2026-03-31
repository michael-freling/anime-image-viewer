package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

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
	// Create a fake HOME with a valid config file
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
	configFile := filepath.Join(configDir, "default.toml")
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
