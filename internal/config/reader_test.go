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
