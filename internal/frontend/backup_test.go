package frontend

import (
	"context"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/michael-freling/anime-image-viewer/internal/config"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newBackupTestLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func newBackupTestConfig(t *testing.T, idleEnabled bool) config.Config {
	t.Helper()
	configDir := t.TempDir()
	imageDir := t.TempDir()
	backupDir := t.TempDir()

	return config.Config{
		ConfigDirectory:    configDir,
		ImageRootDirectory: imageDir,
		Environment:        "development",
		Backup: config.BackupConfig{
			BackupDirectory:   backupDir,
			RetentionCount:    7,
			IdleBackupEnabled: idleEnabled,
			IdleMinutes:       30,
		},
	}
}

// createFakeDBForFrontend creates a fake SQLite database file at the expected path.
func createFakeDBForFrontend(t *testing.T, conf config.Config) {
	t.Helper()
	dbPath := filepath.Join(conf.ConfigDirectory, string(conf.Environment)+"_v1.sqlite")
	err := os.WriteFile(dbPath, []byte("fake-sqlite-database-content"), 0644)
	require.NoError(t, err)
}

func TestBackupFrontendService_Backup(t *testing.T) {
	conf := newBackupTestConfig(t, false)
	createFakeDBForFrontend(t, conf)
	logger := newBackupTestLogger()

	svc := NewBackupFrontendService(logger, conf)

	backupPath, err := svc.Backup(context.Background(), false)
	require.NoError(t, err)
	assert.NotEmpty(t, backupPath, "backup path should not be empty")
	assert.DirExists(t, backupPath, "backup directory should exist")

	// Verify the database file was copied into the backup
	dbFile := filepath.Join(backupPath, "database.sqlite")
	content, err := os.ReadFile(dbFile)
	require.NoError(t, err)
	assert.Equal(t, "fake-sqlite-database-content", string(content))

	// Verify metadata.json exists
	metadataFile := filepath.Join(backupPath, "metadata.json")
	_, err = os.Stat(metadataFile)
	assert.NoError(t, err, "metadata.json should exist in the backup directory")
}

func TestBackupFrontendService_ListBackups(t *testing.T) {
	conf := newBackupTestConfig(t, false)
	createFakeDBForFrontend(t, conf)
	logger := newBackupTestLogger()

	svc := NewBackupFrontendService(logger, conf)

	// Initially no backups
	backups, err := svc.ListBackups(context.Background())
	require.NoError(t, err)
	assert.Empty(t, backups)

	// Create a backup
	backupPath, err := svc.Backup(context.Background(), false)
	require.NoError(t, err)
	require.NotEmpty(t, backupPath)

	// List backups again
	backups, err = svc.ListBackups(context.Background())
	require.NoError(t, err)
	require.Len(t, backups, 1)

	// Verify CreatedAt is in RFC3339 format
	_, parseErr := time.Parse(time.RFC3339, backups[0].CreatedAt)
	assert.NoError(t, parseErr, "CreatedAt should be a valid RFC3339 timestamp, got: %s", backups[0].CreatedAt)

	// Verify IncludesImages is false since we passed false to Backup
	assert.False(t, backups[0].IncludesImages)

	// Verify Path is set and points to the backup directory
	assert.Equal(t, backupPath, backups[0].Path)
}

func TestBackupFrontendService_GetBackupConfig(t *testing.T) {
	conf := newBackupTestConfig(t, true)
	logger := newBackupTestLogger()

	svc := NewBackupFrontendService(logger, conf)

	got := svc.GetBackupConfig(context.Background())

	assert.Equal(t, conf.Backup.BackupDirectory, got.BackupDirectory)
	assert.Equal(t, conf.Backup.RetentionCount, got.RetentionCount)
	assert.Equal(t, conf.Backup.IdleBackupEnabled, got.IdleBackupEnabled)
	assert.Equal(t, conf.Backup.IdleMinutes, got.IdleMinutes)
}

func TestBackupFrontendService_RunIdleBackup_Disabled(t *testing.T) {
	conf := newBackupTestConfig(t, false)
	createFakeDBForFrontend(t, conf)
	logger := newBackupTestLogger()

	svc := NewBackupFrontendService(logger, conf)

	result, err := svc.RunIdleBackup(context.Background())
	require.NoError(t, err)
	assert.Empty(t, result, "should return empty string when idle backup is disabled")

	// Verify no backup was created
	entries, err := os.ReadDir(conf.Backup.BackupDirectory)
	require.NoError(t, err)
	var backupDirs int
	for _, entry := range entries {
		if entry.IsDir() {
			backupDirs++
		}
	}
	assert.Equal(t, 0, backupDirs, "no backup directories should be created when idle backup is disabled")
}

func TestBackupFrontendService_RunIdleBackup_RecentBackupExists(t *testing.T) {
	conf := newBackupTestConfig(t, true)
	createFakeDBForFrontend(t, conf)
	logger := newBackupTestLogger()

	svc := NewBackupFrontendService(logger, conf)

	// Create a backup first so a recent one exists
	backupPath, err := svc.Backup(context.Background(), false)
	require.NoError(t, err)
	require.NotEmpty(t, backupPath)

	// RunIdleBackup should skip because a recent backup exists (within 24 hours)
	result, err := svc.RunIdleBackup(context.Background())
	require.NoError(t, err)
	assert.Empty(t, result, "should return empty string when a recent backup already exists")
}

func TestBackupFrontendService_RunIdleBackup_CreatesBackup(t *testing.T) {
	conf := newBackupTestConfig(t, true)
	createFakeDBForFrontend(t, conf)
	logger := newBackupTestLogger()

	svc := NewBackupFrontendService(logger, conf)

	// No existing backups, idle enabled => should create a backup
	result, err := svc.RunIdleBackup(context.Background())
	require.NoError(t, err)
	assert.NotEmpty(t, result, "should return backup path when idle backup creates a new backup")
	assert.DirExists(t, result, "backup directory should exist")

	// Verify the backup was actually created by listing
	backups, err := svc.ListBackups(context.Background())
	require.NoError(t, err)
	assert.Len(t, backups, 1, "exactly one backup should exist after RunIdleBackup")
}

func TestBackupFrontendService_ListBackups_Error(t *testing.T) {
	logger := newBackupTestLogger()

	// Create a backup directory then make it unreadable
	backupDir := t.TempDir()
	require.NoError(t, os.Chmod(backupDir, 0000))
	t.Cleanup(func() {
		os.Chmod(backupDir, 0755) // restore for cleanup
	})

	conf := config.Config{
		ConfigDirectory:    t.TempDir(),
		ImageRootDirectory: t.TempDir(),
		Environment:        "development",
		Backup: config.BackupConfig{
			BackupDirectory: backupDir,
			RetentionCount:  7,
		},
	}
	svc := NewBackupFrontendService(logger, conf)

	backups, err := svc.ListBackups(context.Background())
	assert.Error(t, err, "ListBackups should fail when backup directory is unreadable")
	assert.Nil(t, backups)
}

func TestBackupFrontendService_RunIdleBackup_HasRecentBackupError(t *testing.T) {
	logger := newBackupTestLogger()

	// Create a backup directory then make it unreadable,
	// which will cause HasRecentBackup to return a permission error
	backupDir := t.TempDir()
	require.NoError(t, os.Chmod(backupDir, 0000))
	t.Cleanup(func() {
		os.Chmod(backupDir, 0755) // restore for cleanup
	})

	conf := config.Config{
		ConfigDirectory:    t.TempDir(),
		ImageRootDirectory: t.TempDir(),
		Environment:        "development",
		Backup: config.BackupConfig{
			BackupDirectory:   backupDir,
			RetentionCount:    7,
			IdleBackupEnabled: true,
			IdleMinutes:       30,
		},
	}
	svc := NewBackupFrontendService(logger, conf)

	result, err := svc.RunIdleBackup(context.Background())
	assert.Error(t, err, "RunIdleBackup should fail when HasRecentBackup returns an error")
	assert.Empty(t, result)
}

func TestBackupFrontendService_Restore(t *testing.T) {
	conf := newBackupTestConfig(t, false)
	createFakeDBForFrontend(t, conf)
	logger := newBackupTestLogger()

	svc := NewBackupFrontendService(logger, conf)

	// Create a backup
	backupPath, err := svc.Backup(context.Background(), false)
	require.NoError(t, err)
	require.NotEmpty(t, backupPath)

	// Modify the database to simulate changes since the backup
	dbPath := filepath.Join(conf.ConfigDirectory, string(conf.Environment)+"_v1.sqlite")
	err = os.WriteFile(dbPath, []byte("modified-database-content"), 0644)
	require.NoError(t, err)

	// Verify the DB was modified
	content, err := os.ReadFile(dbPath)
	require.NoError(t, err)
	assert.Equal(t, "modified-database-content", string(content))

	// Restore from backup
	err = svc.Restore(context.Background(), backupPath, false)
	require.NoError(t, err)

	// Verify the database was restored to the original content
	content, err = os.ReadFile(dbPath)
	require.NoError(t, err)
	assert.Equal(t, "fake-sqlite-database-content", string(content))
}
