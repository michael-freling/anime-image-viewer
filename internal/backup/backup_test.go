package backup

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
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
	for i := range 3 {
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
	err = restoreSvc.Restore(context.Background(), backupDir, RestoreOptions{})
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
	err = restoreSvc.Restore(context.Background(), backupDir, RestoreOptions{RestoreImages: true})
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

func TestBackup_DatabaseNotFound(t *testing.T) {
	conf := newTestConfig(t)
	// Do NOT call createFakeDB so the database file does not exist
	logger := newTestLogger()
	svc := NewBackupService(logger, conf)

	_, err := svc.Backup(context.Background(), "", false)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "copy database")
}

func TestBackup_CustomDestDir(t *testing.T) {
	conf := newTestConfig(t)
	createFakeDB(t, conf)
	logger := newTestLogger()
	svc := NewBackupService(logger, conf)

	customDir := t.TempDir()

	backupDir, err := svc.Backup(context.Background(), customDir, false)
	require.NoError(t, err)

	// Verify the backup was created inside the custom directory, not the configured one
	assert.True(t, strings.HasPrefix(backupDir, customDir),
		"backup should be created under customDir %s, got %s", customDir, backupDir)
	assert.False(t, strings.HasPrefix(backupDir, conf.Backup.BackupDirectory),
		"backup should NOT be under the configured backup directory")

	// Verify the backup is valid
	metadata := readTestMetadata(t, backupDir)
	assert.Equal(t, currentVersion, metadata.Version)

	dbDest := filepath.Join(backupDir, databaseFileName)
	_, err = os.Stat(dbDest)
	assert.NoError(t, err, "database file should exist in custom dest backup")
}

func TestBackup_ContextCancellation(t *testing.T) {
	conf := newTestConfig(t)
	createFakeDB(t, conf)
	logger := newTestLogger()
	svc := NewBackupService(logger, conf)

	// Create a directory with enough files so that context cancellation
	// can be caught during the filepath.Walk in copyDirectory
	imageDir := conf.ImageRootDirectory
	for i := range 100 {
		subDir := filepath.Join(imageDir, fmt.Sprintf("dir_%d", i))
		require.NoError(t, os.MkdirAll(subDir, 0755))
		for j := range 10 {
			filePath := filepath.Join(subDir, fmt.Sprintf("img_%d.jpg", j))
			require.NoError(t, os.WriteFile(filePath, []byte("fake-image-data"), 0644))
		}
	}

	ctx, cancel := context.WithCancel(context.Background())
	// Cancel immediately so the copy loop picks it up on the first iteration
	cancel()

	_, err := svc.Backup(ctx, "", true)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "copy images")
}

func TestRestore_VersionMismatch(t *testing.T) {
	conf := newTestConfig(t)
	createFakeDB(t, conf)
	logger := newTestLogger()
	backupSvc := NewBackupService(logger, conf)
	restoreSvc := NewRestoreService(logger, conf)

	backupDir, err := backupSvc.Backup(context.Background(), "", false)
	require.NoError(t, err)

	// Manually edit metadata.json to set version to 999
	metadataPath := filepath.Join(backupDir, metadataFileName)
	metadata := readTestMetadata(t, backupDir)
	metadata.Version = 999
	data, err := json.MarshalIndent(metadata, "", "  ")
	require.NoError(t, err)
	require.NoError(t, os.WriteFile(metadataPath, data, 0644))

	err = restoreSvc.Restore(context.Background(), backupDir, RestoreOptions{})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "newer than supported version")
}

func TestRestore_MissingMetadata(t *testing.T) {
	conf := newTestConfig(t)
	logger := newTestLogger()
	restoreSvc := NewRestoreService(logger, conf)

	// Create a directory with no metadata.json
	emptyBackupDir := t.TempDir()

	err := restoreSvc.Restore(context.Background(), emptyBackupDir, RestoreOptions{})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "read backup metadata")
}

func TestRestore_MissingDatabaseFile(t *testing.T) {
	conf := newTestConfig(t)
	createFakeDB(t, conf)
	logger := newTestLogger()
	backupSvc := NewBackupService(logger, conf)
	restoreSvc := NewRestoreService(logger, conf)

	backupDir, err := backupSvc.Backup(context.Background(), "", false)
	require.NoError(t, err)

	// Delete the database.sqlite from the backup
	dbPath := filepath.Join(backupDir, databaseFileName)
	require.NoError(t, os.Remove(dbPath))

	err = restoreSvc.Restore(context.Background(), backupDir, RestoreOptions{})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "restore database")
}

func TestRestore_ImagesNotIncluded(t *testing.T) {
	conf := newTestConfig(t)
	createFakeDB(t, conf)
	logger := newTestLogger()
	backupSvc := NewBackupService(logger, conf)
	restoreSvc := NewRestoreService(logger, conf)

	// Create a backup WITHOUT images
	backupDir, err := backupSvc.Backup(context.Background(), "", false)
	require.NoError(t, err)

	// Verify the backup does not include images
	metadata := readTestMetadata(t, backupDir)
	assert.False(t, metadata.IncludesImages)

	// Modify the DB to verify restore works
	dbPath := filepath.Join(conf.ConfigDirectory, string(conf.Environment)+"_v1.sqlite")
	require.NoError(t, os.WriteFile(dbPath, []byte("modified-content"), 0644))

	// Restore with restoreImages=true, even though the backup has no images
	err = restoreSvc.Restore(context.Background(), backupDir, RestoreOptions{RestoreImages: true})
	require.NoError(t, err)

	// Database should still be restored
	content, err := os.ReadFile(dbPath)
	require.NoError(t, err)
	assert.Equal(t, "fake-sqlite-database-content", string(content))

	// No images directory should exist in the backup, and the restore should not fail
	imagesDir := filepath.Join(backupDir, imagesDirName)
	_, err = os.Stat(imagesDir)
	assert.True(t, os.IsNotExist(err), "images directory should not exist in backup")
}

func TestListBackups_Empty(t *testing.T) {
	conf := newTestConfig(t)
	logger := newTestLogger()

	// Point to a non-existent directory
	conf.Backup.BackupDirectory = filepath.Join(t.TempDir(), "nonexistent")

	svc := NewBackupService(logger, conf)

	backups, err := svc.ListBackups()
	require.NoError(t, err)
	assert.Nil(t, backups, "should return nil when backup directory does not exist")
}

func TestListBackups_CorruptedMetadata(t *testing.T) {
	conf := newTestConfig(t)
	logger := newTestLogger()
	svc := NewBackupService(logger, conf)

	backupParentDir := conf.Backup.BackupDirectory

	// Create a valid backup directory
	validDirName := "backup_2024-06-01T10-00-00"
	validDirPath := filepath.Join(backupParentDir, validDirName)
	require.NoError(t, os.MkdirAll(validDirPath, 0755))
	validMetadata := BackupMetadata{
		Version:          currentVersion,
		CreatedAt:        time.Date(2024, 6, 1, 10, 0, 0, 0, time.UTC),
		IncludesImages:   false,
		DatabaseFileName: databaseFileName,
		ImageRootDir:     conf.ImageRootDirectory,
	}
	require.NoError(t, writeMetadata(filepath.Join(validDirPath, metadataFileName), validMetadata))

	// Create a backup directory with corrupted metadata.json
	corruptedDirName := "backup_2024-07-01T10-00-00"
	corruptedDirPath := filepath.Join(backupParentDir, corruptedDirName)
	require.NoError(t, os.MkdirAll(corruptedDirPath, 0755))
	require.NoError(t, os.WriteFile(
		filepath.Join(corruptedDirPath, metadataFileName),
		[]byte("this is not valid json{{{"),
		0644,
	))

	backups, err := svc.ListBackups()
	require.NoError(t, err)
	require.Len(t, backups, 1, "should return only the valid backup")
	assert.Equal(t, validMetadata.CreatedAt, backups[0].CreatedAt)
}

func TestBackup_RetentionDoesNotDeleteNonBackupDirs(t *testing.T) {
	conf := newTestConfig(t)
	conf.Backup.RetentionCount = 1
	createFakeDB(t, conf)
	logger := newTestLogger()
	svc := NewBackupService(logger, conf)

	backupParentDir := conf.Backup.BackupDirectory

	// Create a non-backup directory (no "backup_" prefix)
	nonBackupDir := filepath.Join(backupParentDir, "my_custom_data")
	require.NoError(t, os.MkdirAll(nonBackupDir, 0755))
	require.NoError(t, os.WriteFile(filepath.Join(nonBackupDir, "important.txt"), []byte("keep me"), 0644))

	// Create an old backup directory that should be removed by retention
	oldBackupDirName := "backup_2020-01-01T00-00-00"
	oldBackupDirPath := filepath.Join(backupParentDir, oldBackupDirName)
	require.NoError(t, os.MkdirAll(oldBackupDirPath, 0755))
	oldMetadata := BackupMetadata{
		Version:          currentVersion,
		CreatedAt:        time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC),
		IncludesImages:   false,
		DatabaseFileName: databaseFileName,
	}
	require.NoError(t, writeMetadata(filepath.Join(oldBackupDirPath, metadataFileName), oldMetadata))
	require.NoError(t, os.WriteFile(filepath.Join(oldBackupDirPath, databaseFileName), []byte("old-db"), 0644))

	// Create a new backup; with retention=1, the old backup should be removed
	_, err := svc.Backup(context.Background(), "", false)
	require.NoError(t, err)

	// The non-backup directory should still exist
	_, err = os.Stat(nonBackupDir)
	assert.NoError(t, err, "non-backup directory should not be deleted by retention")

	content, err := os.ReadFile(filepath.Join(nonBackupDir, "important.txt"))
	require.NoError(t, err)
	assert.Equal(t, "keep me", string(content))

	// The old backup should be removed
	_, err = os.Stat(oldBackupDirPath)
	assert.True(t, os.IsNotExist(err), "old backup should have been removed by retention")

	// Should have exactly 1 backup dir remaining (the new one)
	entries, err := os.ReadDir(backupParentDir)
	require.NoError(t, err)
	var backupDirCount int
	for _, entry := range entries {
		if entry.IsDir() && strings.HasPrefix(entry.Name(), "backup_") {
			backupDirCount++
		}
	}
	assert.Equal(t, 1, backupDirCount, "should have exactly retention count backup dirs")
}

func TestCopyFile_SourceNotFound(t *testing.T) {
	dst := filepath.Join(t.TempDir(), "dest.txt")
	err := copyFile("/nonexistent/path/to/file", dst)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "open source")
}

func TestCopyFile_DestinationNotWritable(t *testing.T) {
	// Create a valid source file
	srcDir := t.TempDir()
	srcPath := filepath.Join(srcDir, "source.txt")
	require.NoError(t, os.WriteFile(srcPath, []byte("data"), 0644))

	// Use a non-existent directory so os.Create fails
	dstPath := filepath.Join(t.TempDir(), "nonexistent-subdir", "dest.txt")
	err := copyFile(srcPath, dstPath)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "create destination")
}

func TestWriteMetadata_InvalidPath(t *testing.T) {
	metadata := BackupMetadata{
		Version:   currentVersion,
		CreatedAt: time.Now(),
	}
	// Write to a path where the parent directory does not exist
	err := writeMetadata("/nonexistent/dir/metadata.json", metadata)
	require.Error(t, err)
}

func TestReadMetadata_InvalidJSON(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "metadata.json")
	require.NoError(t, os.WriteFile(path, []byte("not-json{{{"), 0644))

	_, err := readMetadata(path)
	require.Error(t, err)
}

func TestReadMetadata_FileNotFound(t *testing.T) {
	_, err := readMetadata("/nonexistent/metadata.json")
	require.Error(t, err)
}

func TestHasRecentBackup_ReadDirError(t *testing.T) {
	conf := newTestConfig(t)
	logger := newTestLogger()

	// Point to a file instead of a directory to cause ReadDir to fail
	// with an error that is NOT os.IsNotExist
	fakePath := filepath.Join(t.TempDir(), "a-file")
	require.NoError(t, os.WriteFile(fakePath, []byte("x"), 0644))
	conf.Backup.BackupDirectory = fakePath

	svc := NewBackupService(logger, conf)
	_, err := svc.HasRecentBackup(24 * time.Hour)
	require.Error(t, err)
}

func TestHasRecentBackup_SkipsNonDirEntries(t *testing.T) {
	conf := newTestConfig(t)
	logger := newTestLogger()
	svc := NewBackupService(logger, conf)

	backupDir := conf.Backup.BackupDirectory

	// Create a regular file with backup_ prefix (not a directory)
	require.NoError(t, os.WriteFile(filepath.Join(backupDir, "backup_file.txt"), []byte("x"), 0644))

	// Create a directory without backup_ prefix
	require.NoError(t, os.MkdirAll(filepath.Join(backupDir, "other_dir"), 0755))

	hasRecent, err := svc.HasRecentBackup(24 * time.Hour)
	require.NoError(t, err)
	assert.False(t, hasRecent, "should skip non-backup entries")
}

func TestHasRecentBackup_SkipsCorruptedMetadata(t *testing.T) {
	conf := newTestConfig(t)
	logger := newTestLogger()
	svc := NewBackupService(logger, conf)

	backupDir := conf.Backup.BackupDirectory

	// Create a backup directory with corrupted metadata
	corruptDir := filepath.Join(backupDir, "backup_2024-01-01T00-00-00")
	require.NoError(t, os.MkdirAll(corruptDir, 0755))
	require.NoError(t, os.WriteFile(filepath.Join(corruptDir, metadataFileName), []byte("invalid"), 0644))

	hasRecent, err := svc.HasRecentBackup(24 * time.Hour)
	require.NoError(t, err)
	assert.False(t, hasRecent, "should skip backups with corrupted metadata")
}

func TestListBackups_ReadDirError(t *testing.T) {
	conf := newTestConfig(t)
	logger := newTestLogger()

	// Point to a file instead of a directory
	fakePath := filepath.Join(t.TempDir(), "a-file")
	require.NoError(t, os.WriteFile(fakePath, []byte("x"), 0644))
	conf.Backup.BackupDirectory = fakePath

	svc := NewBackupService(logger, conf)
	_, err := svc.ListBackups()
	require.Error(t, err)
}

func TestListBackups_SkipsNonBackupEntries(t *testing.T) {
	conf := newTestConfig(t)
	logger := newTestLogger()
	svc := NewBackupService(logger, conf)

	backupDir := conf.Backup.BackupDirectory

	// Create a regular file with backup_ prefix (not a directory)
	require.NoError(t, os.WriteFile(filepath.Join(backupDir, "backup_file.txt"), []byte("x"), 0644))

	// Create a directory without backup_ prefix
	nonBackupDir := filepath.Join(backupDir, "other_dir")
	require.NoError(t, os.MkdirAll(nonBackupDir, 0755))
	metadata := BackupMetadata{
		Version:          currentVersion,
		CreatedAt:        time.Now(),
		DatabaseFileName: databaseFileName,
	}
	require.NoError(t, writeMetadata(filepath.Join(nonBackupDir, metadataFileName), metadata))

	// Create one valid backup directory
	validDir := filepath.Join(backupDir, "backup_2024-01-01T00-00-00")
	require.NoError(t, os.MkdirAll(validDir, 0755))
	validMetadata := BackupMetadata{
		Version:          currentVersion,
		CreatedAt:        time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC),
		DatabaseFileName: databaseFileName,
	}
	require.NoError(t, writeMetadata(filepath.Join(validDir, metadataFileName), validMetadata))

	backups, err := svc.ListBackups()
	require.NoError(t, err)
	assert.Len(t, backups, 1, "should only include valid backup directories")
}

func TestCopyDirectory_ContextCancellation(t *testing.T) {
	srcDir := t.TempDir()
	dstDir := filepath.Join(t.TempDir(), "dest")

	// Create some files in source
	require.NoError(t, os.MkdirAll(filepath.Join(srcDir, "sub"), 0755))
	require.NoError(t, os.WriteFile(filepath.Join(srcDir, "sub", "file.txt"), []byte("data"), 0644))

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // cancel immediately

	err := copyDirectory(ctx, srcDir, dstDir)
	require.Error(t, err)
	assert.ErrorIs(t, err, context.Canceled)
}

func TestBackup_MkdirAllFailsForDestDir(t *testing.T) {
	conf := newTestConfig(t)
	createFakeDB(t, conf)
	logger := newTestLogger()
	svc := NewBackupService(logger, conf)

	// Use a path where a file exists in place of a directory
	blocker := filepath.Join(t.TempDir(), "blocker")
	require.NoError(t, os.WriteFile(blocker, []byte("x"), 0644))
	invalidDest := filepath.Join(blocker, "subdir")

	_, err := svc.Backup(context.Background(), invalidDest, false)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "create backup directory")
}

func TestRestore_ContextCancellationDuringImageRestore(t *testing.T) {
	conf := newTestConfig(t)
	createFakeDB(t, conf)
	logger := newTestLogger()
	backupSvc := NewBackupService(logger, conf)
	restoreSvc := NewRestoreService(logger, conf)

	// Create images and back them up
	createFakeImages(t, conf.ImageRootDirectory)
	backupDir, err := backupSvc.Backup(context.Background(), "", true)
	require.NoError(t, err)

	// Remove existing images so restore actually does work
	require.NoError(t, os.RemoveAll(conf.ImageRootDirectory))

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // cancel immediately

	err = restoreSvc.Restore(ctx, backupDir, RestoreOptions{RestoreImages: true})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "restore images")
}

func TestEnforceRetention_ReadDirError(t *testing.T) {
	conf := newTestConfig(t)
	logger := newTestLogger()
	svc := NewBackupService(logger, conf)

	err := svc.enforceRetention("/nonexistent/path")
	require.Error(t, err)
}

func TestEnforceRetention_UnderRetentionCount(t *testing.T) {
	conf := newTestConfig(t)
	conf.Backup.RetentionCount = 10
	logger := newTestLogger()
	svc := NewBackupService(logger, conf)

	backupDir := t.TempDir()
	// Create just 1 backup dir, well under the retention count of 10
	dirPath := filepath.Join(backupDir, "backup_2024-01-01T00-00-00")
	require.NoError(t, os.MkdirAll(dirPath, 0755))

	err := svc.enforceRetention(backupDir)
	require.NoError(t, err)

	// The directory should still exist
	_, err = os.Stat(dirPath)
	assert.NoError(t, err)
}

func TestDeleteBackup_Success(t *testing.T) {
	conf := newTestConfig(t)
	createFakeDB(t, conf)
	logger := newTestLogger()
	svc := NewBackupService(logger, conf)

	// Create a backup
	backupDir, err := svc.Backup(context.Background(), "", false)
	require.NoError(t, err)
	assert.DirExists(t, backupDir)

	// Delete the backup
	err = svc.DeleteBackup(backupDir)
	require.NoError(t, err)

	// Verify the backup directory was removed
	_, err = os.Stat(backupDir)
	assert.True(t, os.IsNotExist(err), "backup directory should be deleted")
}

func TestDeleteBackup_RejectsPathOutsideBackupDirectory(t *testing.T) {
	conf := newTestConfig(t)
	logger := newTestLogger()
	svc := NewBackupService(logger, conf)

	// Try to delete a path outside the configured backup directory
	outsidePath := t.TempDir()
	err := svc.DeleteBackup(outsidePath)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "not inside the configured backup directory")
}

func TestDeleteBackup_RejectsParentTraversal(t *testing.T) {
	conf := newTestConfig(t)
	logger := newTestLogger()
	svc := NewBackupService(logger, conf)

	// Try to use ".." to escape the backup directory
	traversalPath := filepath.Join(conf.Backup.BackupDirectory, "..", "something")
	err := svc.DeleteBackup(traversalPath)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "not inside the configured backup directory")
}

func TestDeleteBackup_RejectsBackupDirItself(t *testing.T) {
	conf := newTestConfig(t)
	logger := newTestLogger()
	svc := NewBackupService(logger, conf)

	// Try to delete the backup directory itself (rel would be ".")
	err := svc.DeleteBackup(conf.Backup.BackupDirectory)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "not inside the configured backup directory")
}

func TestDeleteBackup_NonexistentPath(t *testing.T) {
	conf := newTestConfig(t)
	logger := newTestLogger()
	svc := NewBackupService(logger, conf)

	// Deleting a non-existent path inside the backup directory should succeed
	// (os.RemoveAll does not error on non-existent paths)
	nonexistentPath := filepath.Join(conf.Backup.BackupDirectory, "backup_nonexistent")
	err := svc.DeleteBackup(nonexistentPath)
	require.NoError(t, err)
}

func TestBackup_ValidatesImagesBeforeCopying(t *testing.T) {
	t.Run("restores corrupted image before backup", func(t *testing.T) {
		conf := newTestConfig(t)
		createFakeDB(t, conf)
		logger := newTestLogger()

		// Put a corrupted image in the image root directory
		photosDir := filepath.Join(conf.ImageRootDirectory, "photos")
		require.NoError(t, os.MkdirAll(photosDir, 0755))
		corruptedPath := filepath.Join(photosDir, "bad.jpg")
		require.NoError(t, os.WriteFile(corruptedPath, []byte("corrupted data"), 0644))

		// Create a pre-existing backup with a valid copy of the same file
		existingBackupDir := filepath.Join(conf.Backup.BackupDirectory, "backup_2024-01-01T10-00-00")
		require.NoError(t, os.MkdirAll(existingBackupDir, 0755))
		backupImagePath := filepath.Join(existingBackupDir, imagesDirName, "photos", "bad.jpg")
		createValidJPEG(t, backupImagePath)
		metadata := BackupMetadata{
			Version:          currentVersion,
			CreatedAt:        time.Date(2024, 1, 1, 10, 0, 0, 0, time.UTC),
			IncludesImages:   true,
			DatabaseFileName: databaseFileName,
		}
		require.NoError(t, writeMetadata(filepath.Join(existingBackupDir, metadataFileName), metadata))

		restoreSvc := NewRestoreService(logger, conf)
		backupSvc := NewBackupService(logger, conf)
		backupSvc.SetRestoreService(restoreSvc)

		backupDir, err := backupSvc.Backup(context.Background(), "", true)
		require.NoError(t, err)

		// The corrupted image should have been restored in the image root
		// and the backup should contain the valid copy.
		backedUpPath := filepath.Join(backupDir, imagesDirName, "photos", "bad.jpg")
		_, err = os.Stat(backedUpPath)
		assert.NoError(t, err, "backed-up image should exist")

		// Also verify the original was restored
		content, err := os.ReadFile(corruptedPath)
		require.NoError(t, err)
		assert.NotEqual(t, "corrupted data", string(content), "original image should have been restored")
	})

	t.Run("logs warning when restore fails", func(t *testing.T) {
		conf := newTestConfig(t)
		createFakeDB(t, conf)
		logger := newTestLogger()

		// Put a corrupted image in the image root directory
		photosDir := filepath.Join(conf.ImageRootDirectory, "photos")
		require.NoError(t, os.MkdirAll(photosDir, 0755))
		corruptedPath := filepath.Join(photosDir, "bad.jpg")
		require.NoError(t, os.WriteFile(corruptedPath, []byte("corrupted data"), 0644))

		// No backup exists, so restore will fail. The backup should still complete.
		restoreSvc := NewRestoreService(logger, conf)
		backupSvc := NewBackupService(logger, conf)
		backupSvc.SetRestoreService(restoreSvc)

		backupDir, err := backupSvc.Backup(context.Background(), "", true)
		require.NoError(t, err)

		// The backup directory should still exist
		assert.DirExists(t, backupDir)
	})

	t.Run("backup without restore service skips validation", func(t *testing.T) {
		conf := newTestConfig(t)
		createFakeDB(t, conf)
		logger := newTestLogger()

		// Put a corrupted image
		photosDir := filepath.Join(conf.ImageRootDirectory, "photos")
		require.NoError(t, os.MkdirAll(photosDir, 0755))
		require.NoError(t, os.WriteFile(filepath.Join(photosDir, "bad.jpg"), []byte("corrupted data"), 0644))

		backupSvc := NewBackupService(logger, conf)
		// No SetRestoreService call — validation should be skipped

		backupDir, err := backupSvc.Backup(context.Background(), "", true)
		require.NoError(t, err)
		assert.DirExists(t, backupDir)
	})
}

func TestRestore_ConfigDirectoryCreation(t *testing.T) {
	conf := newTestConfig(t)
	createFakeDB(t, conf)
	logger := newTestLogger()
	backupSvc := NewBackupService(logger, conf)

	// Create a backup first
	backupDir, err := backupSvc.Backup(context.Background(), "", false)
	require.NoError(t, err)

	// Now point config directory to a non-existent location
	newConfigDir := filepath.Join(t.TempDir(), "new-nested", "config")
	conf.ConfigDirectory = newConfigDir
	restoreSvc := NewRestoreService(logger, conf)

	err = restoreSvc.Restore(context.Background(), backupDir, RestoreOptions{})
	require.NoError(t, err)

	// Verify the config directory was created
	_, err = os.Stat(newConfigDir)
	assert.NoError(t, err, "config directory should be created during restore")

	// Verify the DB was restored
	dbPath := filepath.Join(newConfigDir, string(conf.Environment)+"_v1.sqlite")
	content, err := os.ReadFile(dbPath)
	require.NoError(t, err)
	assert.Equal(t, "fake-sqlite-database-content", string(content))
}
