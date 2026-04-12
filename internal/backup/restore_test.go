package backup

import (
	"context"
	"errors"
	"image"
	"image/color"
	"image/jpeg"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// createValidJPEG creates a valid JPEG file at the given path.
func createValidJPEG(t *testing.T, path string) {
	t.Helper()
	require.NoError(t, os.MkdirAll(filepath.Dir(path), 0755))
	img := image.NewRGBA(image.Rect(0, 0, 10, 10))
	for y := 0; y < 10; y++ {
		for x := 0; x < 10; x++ {
			img.Set(x, y, color.RGBA{R: 100, G: 150, B: 200, A: 255})
		}
	}
	file, err := os.Create(path)
	require.NoError(t, err)
	defer file.Close()
	require.NoError(t, jpeg.Encode(file, img, nil))
}

// createBackupWithImage sets up a backup directory with metadata and optionally
// an image file at the given relative path.
func createBackupWithImage(t *testing.T, backupParentDir string, name string, createdAt time.Time, includesImages bool, relativeImagePath string, validImage bool) string {
	t.Helper()
	backupDir := filepath.Join(backupParentDir, name)
	require.NoError(t, os.MkdirAll(backupDir, 0755))

	metadata := BackupMetadata{
		Version:          currentVersion,
		CreatedAt:        createdAt,
		IncludesImages:   includesImages,
		DatabaseFileName: databaseFileName,
	}
	require.NoError(t, writeMetadata(filepath.Join(backupDir, metadataFileName), metadata))

	if relativeImagePath != "" && includesImages {
		imagePath := filepath.Join(backupDir, imagesDirName, relativeImagePath)
		if validImage {
			createValidJPEG(t, imagePath)
		} else {
			// Create a corrupted image file
			require.NoError(t, os.MkdirAll(filepath.Dir(imagePath), 0755))
			require.NoError(t, os.WriteFile(imagePath, []byte("corrupted data"), 0644))
		}
	}

	return backupDir
}

func TestRestoreSingleFile(t *testing.T) {
	ctx := context.Background()

	t.Run("restore from newest backup", func(t *testing.T) {
		conf := newTestConfig(t)
		logger := newTestLogger()
		service := NewRestoreService(logger, conf)

		relPath := "photos/image.jpg"

		// Create two backups: older with valid image, newer with valid image
		createBackupWithImage(t, conf.Backup.BackupDirectory, "backup_2024-01-01T10-00-00",
			time.Date(2024, 1, 1, 10, 0, 0, 0, time.UTC), true, relPath, true)
		createBackupWithImage(t, conf.Backup.BackupDirectory, "backup_2024-02-01T10-00-00",
			time.Date(2024, 2, 1, 10, 0, 0, 0, time.UTC), true, relPath, true)

		err := service.RestoreSingleFile(ctx, relPath, conf.ImageRootDirectory)

		require.NoError(t, err)
		// Verify file was restored
		restoredPath := filepath.Join(conf.ImageRootDirectory, relPath)
		_, err = os.Stat(restoredPath)
		assert.NoError(t, err)
	})

	t.Run("fallback to older backup when newest is corrupted", func(t *testing.T) {
		conf := newTestConfig(t)
		logger := newTestLogger()
		service := NewRestoreService(logger, conf)

		relPath := "photos/image.jpg"

		// Older backup has valid image
		createBackupWithImage(t, conf.Backup.BackupDirectory, "backup_2024-01-01T10-00-00",
			time.Date(2024, 1, 1, 10, 0, 0, 0, time.UTC), true, relPath, true)
		// Newer backup has corrupted image
		createBackupWithImage(t, conf.Backup.BackupDirectory, "backup_2024-02-01T10-00-00",
			time.Date(2024, 2, 1, 10, 0, 0, 0, time.UTC), true, relPath, false)

		err := service.RestoreSingleFile(ctx, relPath, conf.ImageRootDirectory)

		require.NoError(t, err)
		// Verify file was restored from the older backup
		restoredPath := filepath.Join(conf.ImageRootDirectory, relPath)
		_, err = os.Stat(restoredPath)
		assert.NoError(t, err)
	})

	t.Run("skip backup without images", func(t *testing.T) {
		conf := newTestConfig(t)
		logger := newTestLogger()
		service := NewRestoreService(logger, conf)

		relPath := "photos/image.jpg"

		// First backup does not include images
		createBackupWithImage(t, conf.Backup.BackupDirectory, "backup_2024-02-01T10-00-00",
			time.Date(2024, 2, 1, 10, 0, 0, 0, time.UTC), false, "", false)
		// Second backup includes images with a valid copy
		createBackupWithImage(t, conf.Backup.BackupDirectory, "backup_2024-01-01T10-00-00",
			time.Date(2024, 1, 1, 10, 0, 0, 0, time.UTC), true, relPath, true)

		err := service.RestoreSingleFile(ctx, relPath, conf.ImageRootDirectory)

		require.NoError(t, err)
		restoredPath := filepath.Join(conf.ImageRootDirectory, relPath)
		_, err = os.Stat(restoredPath)
		assert.NoError(t, err)
	})

	t.Run("file not found in any backup", func(t *testing.T) {
		conf := newTestConfig(t)
		logger := newTestLogger()
		service := NewRestoreService(logger, conf)

		relPath := "photos/missing.jpg"

		// Create a backup with images but not containing the requested file
		createBackupWithImage(t, conf.Backup.BackupDirectory, "backup_2024-01-01T10-00-00",
			time.Date(2024, 1, 1, 10, 0, 0, 0, time.UTC), true, "photos/other.jpg", true)

		err := service.RestoreSingleFile(ctx, relPath, conf.ImageRootDirectory)

		assert.Error(t, err)
		assert.True(t, errors.Is(err, ErrNoValidBackup), "expected ErrNoValidBackup, got: %v", err)
	})

	t.Run("corrupted in all backups", func(t *testing.T) {
		conf := newTestConfig(t)
		logger := newTestLogger()
		service := NewRestoreService(logger, conf)

		relPath := "photos/image.jpg"

		// Both backups have corrupted copies
		createBackupWithImage(t, conf.Backup.BackupDirectory, "backup_2024-01-01T10-00-00",
			time.Date(2024, 1, 1, 10, 0, 0, 0, time.UTC), true, relPath, false)
		createBackupWithImage(t, conf.Backup.BackupDirectory, "backup_2024-02-01T10-00-00",
			time.Date(2024, 2, 1, 10, 0, 0, 0, time.UTC), true, relPath, false)

		err := service.RestoreSingleFile(ctx, relPath, conf.ImageRootDirectory)

		assert.Error(t, err)
		assert.True(t, errors.Is(err, ErrNoValidBackup), "expected ErrNoValidBackup, got: %v", err)
	})

	t.Run("no backups exist", func(t *testing.T) {
		conf := newTestConfig(t)
		logger := newTestLogger()
		service := NewRestoreService(logger, conf)

		err := service.RestoreSingleFile(ctx, "photos/image.jpg", conf.ImageRootDirectory)

		assert.Error(t, err)
		assert.True(t, errors.Is(err, ErrNoValidBackup), "expected ErrNoValidBackup, got: %v", err)
	})

	t.Run("ListBackups error returns error", func(t *testing.T) {
		conf := newTestConfig(t)
		logger := newTestLogger()
		// Replace the backup directory with a regular file so that
		// ListBackups (which uses os.ReadDir) fails.
		require.NoError(t, os.RemoveAll(conf.Backup.BackupDirectory))
		require.NoError(t, os.WriteFile(conf.Backup.BackupDirectory, []byte("not a directory"), 0644))

		service := NewRestoreService(logger, conf)

		err := service.RestoreSingleFile(ctx, "photos/image.jpg", conf.ImageRootDirectory)

		assert.Error(t, err)
		assert.Contains(t, err.Error(), "list backups")
	})

	t.Run("creates parent directories when restoring", func(t *testing.T) {
		conf := newTestConfig(t)
		logger := newTestLogger()
		service := NewRestoreService(logger, conf)

		relPath := "deep/nested/dir/image.jpg"

		createBackupWithImage(t, conf.Backup.BackupDirectory, "backup_2024-01-01T10-00-00",
			time.Date(2024, 1, 1, 10, 0, 0, 0, time.UTC), true, relPath, true)

		err := service.RestoreSingleFile(ctx, relPath, conf.ImageRootDirectory)

		require.NoError(t, err)
		restoredPath := filepath.Join(conf.ImageRootDirectory, relPath)
		_, err = os.Stat(restoredPath)
		assert.NoError(t, err)
	})

	t.Run("MkdirAll error when destination parent is a file", func(t *testing.T) {
		conf := newTestConfig(t)
		logger := newTestLogger()
		service := NewRestoreService(logger, conf)

		relPath := "photos/subdir/image.jpg"

		createBackupWithImage(t, conf.Backup.BackupDirectory, "backup_2024-01-01T10-00-00",
			time.Date(2024, 1, 1, 10, 0, 0, 0, time.UTC), true, relPath, true)

		// Create a regular file at the parent directory path to make MkdirAll fail
		photosPath := filepath.Join(conf.ImageRootDirectory, "photos", "subdir")
		require.NoError(t, os.MkdirAll(filepath.Join(conf.ImageRootDirectory, "photos"), 0755))
		require.NoError(t, os.WriteFile(photosPath, []byte("blocking file"), 0644))

		err := service.RestoreSingleFile(ctx, relPath, conf.ImageRootDirectory)

		assert.Error(t, err)
		assert.Contains(t, err.Error(), "create parent directory")
	})

	t.Run("copyFile error when destination is read-only", func(t *testing.T) {
		conf := newTestConfig(t)
		logger := newTestLogger()
		service := NewRestoreService(logger, conf)

		relPath := "photos/image.jpg"

		createBackupWithImage(t, conf.Backup.BackupDirectory, "backup_2024-01-01T10-00-00",
			time.Date(2024, 1, 1, 10, 0, 0, 0, time.UTC), true, relPath, true)

		// Create the parent directory as read-only so the file cannot be created
		destDir := filepath.Join(conf.ImageRootDirectory, "photos")
		require.NoError(t, os.MkdirAll(destDir, 0755))
		require.NoError(t, os.Chmod(destDir, 0555))
		t.Cleanup(func() {
			os.Chmod(destDir, 0755)
		})

		err := service.RestoreSingleFile(ctx, relPath, conf.ImageRootDirectory)

		assert.Error(t, err)
		assert.Contains(t, err.Error(), "copy restored file")
	})
}
