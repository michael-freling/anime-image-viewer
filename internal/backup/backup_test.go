package backup

import (
	"context"
	"encoding/json"
	"fmt"
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

func newTestLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func newTestConfig(t *testing.T) config.Config {
	t.Helper()
	tempConfigDir := t.TempDir()
	tempImageDir := t.TempDir()
	tempBackupDir := t.TempDir()

	return config.Config{
		ConfigDirectory:    tempConfigDir,
		ImageRootDirectory: tempImageDir,
		Environment:        "development",
		Backup: config.BackupConfig{
			BackupDirectory: tempBackupDir,
			RetentionCount:  7,
		},
	}
}

// createFakeDB creates a fake SQLite database file at the expected path for the config.
func createFakeDB(t *testing.T, conf config.Config) string {
	t.Helper()
	dbPath := filepath.Join(conf.ConfigDirectory, string(conf.Environment)+"_v1.sqlite")
	err := os.WriteFile(dbPath, []byte("fake-sqlite-database-content"), 0644)
	require.NoError(t, err)
	return dbPath
}

// createFakeImages creates fake image files in the image root directory and returns the relative paths.
func createFakeImages(t *testing.T, imageRootDir string) []string {
	t.Helper()
	structure := map[string][]string{
		"photos":         {"img1.jpg", "img2.png"},
		"photos/vacation": {"beach.jpg"},
	}

	var relativePaths []string
	for dir, files := range structure {
		dirPath := filepath.Join(imageRootDir, dir)
		require.NoError(t, os.MkdirAll(dirPath, 0755))
		for _, file := range files {
			filePath := filepath.Join(dirPath, file)
			require.NoError(t, os.WriteFile(filePath, []byte("fake-image-data-"+file), 0644))
			relPath, err := filepath.Rel(imageRootDir, filePath)
			require.NoError(t, err)
			relativePaths = append(relativePaths, relPath)
		}
	}
	return relativePaths
}

func readTestMetadata(t *testing.T, backupDir string) BackupMetadata {
	t.Helper()
	metadataPath := filepath.Join(backupDir, metadataFileName)
	data, err := os.ReadFile(metadataPath)
	require.NoError(t, err)

	var metadata BackupMetadata
	require.NoError(t, json.Unmarshal(data, &metadata))
	return metadata
}

func TestBackup_DatabaseOnly(t *testing.T) {
	conf := newTestConfig(t)
	createFakeDB(t, conf)
	logger := newTestLogger()
	svc := NewBackupService(logger, conf)

	backupDir, err := svc.Backup(context.Background(), "", false)
	require.NoError(t, err)

	// Verify backup directory was created with the expected timestamp pattern
	dirName := filepath.Base(backupDir)
	assert.Regexp(t, `^backup_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$`, dirName)

	// Verify metadata.json exists and has correct fields
	metadata := readTestMetadata(t, backupDir)
	assert.Equal(t, currentVersion, metadata.Version)
	assert.False(t, metadata.IncludesImages)
	assert.Equal(t, databaseFileName, metadata.DatabaseFileName)
	assert.Equal(t, conf.ImageRootDirectory, metadata.ImageRootDir)
	assert.WithinDuration(t, time.Now(), metadata.CreatedAt, 5*time.Second)

	// Verify database.sqlite was copied
	dbDest := filepath.Join(backupDir, databaseFileName)
	dbContent, err := os.ReadFile(dbDest)
	require.NoError(t, err)
	assert.Equal(t, "fake-sqlite-database-content", string(dbContent))

	// Verify no images directory was created
	imagesDir := filepath.Join(backupDir, imagesDirName)
	_, err = os.Stat(imagesDir)
	assert.True(t, os.IsNotExist(err), "images directory should not exist for database-only backup")
}

func TestBackup_WithImages(t *testing.T) {
	conf := newTestConfig(t)
	createFakeDB(t, conf)
	logger := newTestLogger()
	svc := NewBackupService(logger, conf)

	relativePaths := createFakeImages(t, conf.ImageRootDirectory)

	backupDir, err := svc.Backup(context.Background(), "", true)
	require.NoError(t, err)

	// Verify metadata shows IncludesImages=true
	metadata := readTestMetadata(t, backupDir)
	assert.True(t, metadata.IncludesImages)

	// Verify images were copied preserving directory structure
	for _, relPath := range relativePaths {
		copiedPath := filepath.Join(backupDir, imagesDirName, relPath)
		_, err := os.Stat(copiedPath)
		assert.NoError(t, err, "image file should exist at %s", copiedPath)

		// Verify content matches
		originalContent, err := os.ReadFile(filepath.Join(conf.ImageRootDirectory, relPath))
		require.NoError(t, err)
		copiedContent, err := os.ReadFile(copiedPath)
		require.NoError(t, err)
		assert.Equal(t, originalContent, copiedContent)
	}
}

func TestBackup_Retention(t *testing.T) {
	conf := newTestConfig(t)
	conf.Backup.RetentionCount = 2
	createFakeDB(t, conf)
	logger := newTestLogger()
	svc := NewBackupService(logger, conf)

	// Create more backups than the retention count allows.
	// We use a custom destDir to keep all backups in one place.
	backupParentDir := conf.Backup.BackupDirectory

	// Manually create old backup directories to simulate pre-existing backups
	for i := 0; i < 3; i++ {
		dirName := fmt.Sprintf("backup_2020-01-0%dT00-00-00", i+1)
		dirPath := filepath.Join(backupParentDir, dirName)
		require.NoError(t, os.MkdirAll(dirPath, 0755))
		metadata := BackupMetadata{
			Version:          currentVersion,
			CreatedAt:        time.Date(2020, 1, i+1, 0, 0, 0, 0, time.UTC),
			IncludesImages:   false,
			DatabaseFileName: databaseFileName,
		}
		require.NoError(t, writeMetadata(filepath.Join(dirPath, metadataFileName), metadata))
		require.NoError(t, os.WriteFile(filepath.Join(dirPath, databaseFileName), []byte("old-db"), 0644))
	}

	// Create a new backup, which should trigger retention enforcement
	backupDir, err := svc.Backup(context.Background(), "", false)
	require.NoError(t, err)
	assert.NotEmpty(t, backupDir)

	// After the new backup, we have 4 total (3 old + 1 new).
	// With retention=2, the 2 oldest should be removed.
	entries, err := os.ReadDir(backupParentDir)
	require.NoError(t, err)

	var backupDirs []string
	for _, entry := range entries {
		if entry.IsDir() {
			backupDirs = append(backupDirs, entry.Name())
		}
	}

	assert.Len(t, backupDirs, 2, "should have exactly retention count backups remaining")

	// The oldest two (2020-01-01, 2020-01-02) should be removed
	for _, dir := range backupDirs {
		assert.NotEqual(t, "backup_2020-01-01T00-00-00", dir)
		assert.NotEqual(t, "backup_2020-01-02T00-00-00", dir)
	}
}

func TestRestore_DatabaseOnly(t *testing.T) {
	conf := newTestConfig(t)
	createFakeDB(t, conf)
	logger := newTestLogger()
	backupSvc := NewBackupService(logger, conf)
	restoreSvc := NewRestoreService(logger, conf)

	// Create a backup
	backupDir, err := backupSvc.Backup(context.Background(), "", false)
	require.NoError(t, err)

	// Modify the DB file to simulate changes since the backup
	dbPath := filepath.Join(conf.ConfigDirectory, string(conf.Environment)+"_v1.sqlite")
	require.NoError(t, os.WriteFile(dbPath, []byte("modified-database-content"), 0644))

	// Verify it was modified
	content, err := os.ReadFile(dbPath)
	require.NoError(t, err)
	assert.Equal(t, "modified-database-content", string(content))

	// Restore from backup
	err = restoreSvc.Restore(context.Background(), backupDir, false)
	require.NoError(t, err)

	// Verify the DB was restored to original content
	content, err = os.ReadFile(dbPath)
	require.NoError(t, err)
	assert.Equal(t, "fake-sqlite-database-content", string(content))
}

func TestRestore_WithImages(t *testing.T) {
	conf := newTestConfig(t)
	createFakeDB(t, conf)
	logger := newTestLogger()
	backupSvc := NewBackupService(logger, conf)
	restoreSvc := NewRestoreService(logger, conf)

	// Create images and back them up
	relativePaths := createFakeImages(t, conf.ImageRootDirectory)
	backupDir, err := backupSvc.Backup(context.Background(), "", true)
	require.NoError(t, err)

	// Clear the images directory to simulate data loss
	require.NoError(t, os.RemoveAll(conf.ImageRootDirectory))
	_, err = os.Stat(conf.ImageRootDirectory)
	assert.True(t, os.IsNotExist(err), "images directory should be removed")

	// Restore from backup with images
	err = restoreSvc.Restore(context.Background(), backupDir, true)
	require.NoError(t, err)

	// Verify all images were restored
	for _, relPath := range relativePaths {
		restoredPath := filepath.Join(conf.ImageRootDirectory, relPath)
		content, err := os.ReadFile(restoredPath)
		require.NoError(t, err, "restored image should exist at %s", restoredPath)
		assert.Equal(t, "fake-image-data-"+filepath.Base(relPath), string(content))
	}
}

func TestHasRecentBackup(t *testing.T) {
	conf := newTestConfig(t)
	createFakeDB(t, conf)
	logger := newTestLogger()
	svc := NewBackupService(logger, conf)

	// No backups yet
	hasRecent, err := svc.HasRecentBackup(24 * time.Hour)
	require.NoError(t, err)
	assert.False(t, hasRecent, "should return false when no backups exist")

	// Create a backup
	_, err = svc.Backup(context.Background(), "", false)
	require.NoError(t, err)

	// Should find a recent backup within 24 hours
	hasRecent, err = svc.HasRecentBackup(24 * time.Hour)
	require.NoError(t, err)
	assert.True(t, hasRecent, "should return true after creating a backup")

	// Should not find a recent backup within 0 duration (already in the past)
	hasRecent, err = svc.HasRecentBackup(0)
	require.NoError(t, err)
	assert.False(t, hasRecent, "should return false when duration is zero")
}

func TestListBackups(t *testing.T) {
	conf := newTestConfig(t)
	createFakeDB(t, conf)
	logger := newTestLogger()
	svc := NewBackupService(logger, conf)

	// List when no backups exist
	backups, err := svc.ListBackups()
	require.NoError(t, err)
	assert.Empty(t, backups)

	// Create multiple backups with different timestamps by manually creating them
	backupParentDir := conf.Backup.BackupDirectory
	timestamps := []time.Time{
		time.Date(2024, 1, 1, 10, 0, 0, 0, time.UTC),
		time.Date(2024, 6, 15, 12, 30, 0, 0, time.UTC),
		time.Date(2024, 12, 31, 23, 59, 0, 0, time.UTC),
	}

	for _, ts := range timestamps {
		dirName := fmt.Sprintf("backup_%s", ts.Format("2006-01-02T15-04-05"))
		dirPath := filepath.Join(backupParentDir, dirName)
		require.NoError(t, os.MkdirAll(dirPath, 0755))

		metadata := BackupMetadata{
			Version:          currentVersion,
			CreatedAt:        ts,
			IncludesImages:   false,
			DatabaseFileName: databaseFileName,
			ImageRootDir:     conf.ImageRootDirectory,
		}
		require.NoError(t, writeMetadata(filepath.Join(dirPath, metadataFileName), metadata))
	}

	// List backups
	backups, err = svc.ListBackups()
	require.NoError(t, err)
	require.Len(t, backups, 3)

	// Verify sorted newest first
	assert.True(t, backups[0].CreatedAt.After(backups[1].CreatedAt),
		"first backup should be newer than second")
	assert.True(t, backups[1].CreatedAt.After(backups[2].CreatedAt),
		"second backup should be newer than third")

	// Verify the newest is the last timestamp we created
	assert.Equal(t, timestamps[2], backups[0].CreatedAt)
	assert.Equal(t, timestamps[1], backups[1].CreatedAt)
	assert.Equal(t, timestamps[0], backups[2].CreatedAt)

	// Verify Path is populated
	for _, b := range backups {
		assert.NotEmpty(t, b.Path, "each backup should have a Path set")
		assert.DirExists(t, b.Path, "backup Path should point to an existing directory")
	}
}
