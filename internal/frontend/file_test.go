package frontend

import (
	"encoding/json"
	"image/color"
	goimage "image"
	"image/jpeg"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/michael-freling/anime-image-viewer/internal/backup"
	"github.com/michael-freling/anime-image-viewer/internal/config"
	"github.com/michael-freling/anime-image-viewer/internal/image"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func (tester tester) getStaticFileService() *StaticFileService {
	return NewStaticFileService(
		tester.logger,
		tester.config,
		nil, // no restore service in basic tests
	)
}

func TestStaticFileService_ServeHTTP(t *testing.T) {
	tester := newTester(t)
	tester.logger = slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{
		Level: slog.LevelDebug,
	}))

	tester.newFileCreator(t).
		CreateDirectory(image.Directory{ID: 1, Name: "dir"}).
		CreateImage(image.ImageFile{ID: 2, Name: "image.jpg", ParentID: 1}, image.TestImageFileJpeg).
		CreateImage(image.ImageFile{ID: 2, Name: "image.png", ParentID: 1}, image.TestImageFilePng).
		CreateImage(image.ImageFile{ID: 2, Name: "image.txt", ParentID: 1}, image.TestImageFileNonImage)

	testCases := []struct {
		name         string
		fileFullPath string
		wantCode     int
		wantErr      bool
	}{
		// test without any raw query string
		// {
		// 	name:         "wails url test",
		// 	fileFullPath: "wails://localhost:9245/files/image.jpg?width=1",
		// 	wantCode:     http.StatusOK,
		// },

		{
			name:         "a jpeg file",
			fileFullPath: "dir/image.jpg?width=1",
			wantCode:     http.StatusOK,
		},
		{
			name:         "a png file",
			fileFullPath: "dir/image.png?width=1",
			wantCode:     http.StatusOK,
		},
		{
			name:         "unsupported image file. It shouldn't be stored in the first place",
			fileFullPath: "dir/image.txt?width=1",
			wantCode:     http.StatusInternalServerError,
			wantErr:      true,
		},
		{
			name:         "invalid width parameter",
			fileFullPath: "dir/image.jpg?width=auto",
			wantCode:     http.StatusBadRequest,
			wantErr:      true,
		},
		{
			name:         "no width parameter",
			fileFullPath: "dir/image.jpg",
			wantCode:     http.StatusOK,
		},
		{
			name:         "width exceeds maximum",
			fileFullPath: "dir/image.jpg?width=5000",
			wantCode:     http.StatusBadRequest,
			wantErr:      true,
		},
		{
			name:         "file not found",
			fileFullPath: "dir/nonexistent.jpg?width=1",
			wantCode:     http.StatusBadRequest,
			wantErr:      true,
		},
		{
			name:         "file path is not under the image directory",
			fileFullPath: "../../image.jpg?width=1",
			wantCode:     http.StatusBadRequest,
			wantErr:      true,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			service := tester.getStaticFileService()

			w := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodGet, "/"+tc.fileFullPath, nil)
			service.ServeHTTP(
				w,
				req,
			)
			assert.Equal(t, tc.wantCode, w.Code, w.Body.String())
		})
	}
}

// createTestJPEG creates a valid JPEG image file at the given path.
func createTestJPEG(t *testing.T, path string) {
	t.Helper()
	require.NoError(t, os.MkdirAll(filepath.Dir(path), 0755))
	img := goimage.NewRGBA(goimage.Rect(0, 0, 10, 10))
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

// backupMetadata mirrors backup.BackupMetadata for creating test backup
// directories from outside the backup package.
type backupMetadata struct {
	Version          int       `json:"version"`
	CreatedAt        time.Time `json:"created_at"`
	IncludesImages   bool      `json:"includes_images"`
	ImageRootDir     string    `json:"image_root_directory"`
	DatabaseFileName string    `json:"database_file_name"`
}

// createTestBackup creates a backup directory with metadata and optionally a
// valid or corrupted image file at the given relative path. It returns the
// backup directory path.
func createTestBackup(
	t *testing.T,
	backupParentDir string,
	name string,
	createdAt time.Time,
	includesImages bool,
	relativeImagePath string,
	validImage bool,
) string {
	t.Helper()
	backupDir := filepath.Join(backupParentDir, name)
	require.NoError(t, os.MkdirAll(backupDir, 0755))

	meta := backupMetadata{
		Version:          1,
		CreatedAt:        createdAt,
		IncludesImages:   includesImages,
		ImageRootDir:     "",
		DatabaseFileName: "database.sqlite",
	}
	data, err := json.MarshalIndent(meta, "", "  ")
	require.NoError(t, err)
	require.NoError(t, os.WriteFile(filepath.Join(backupDir, "metadata.json"), data, 0644))

	if relativeImagePath != "" && includesImages {
		imagePath := filepath.Join(backupDir, "images", relativeImagePath)
		if validImage {
			createTestJPEG(t, imagePath)
		} else {
			require.NoError(t, os.MkdirAll(filepath.Dir(imagePath), 0755))
			require.NoError(t, os.WriteFile(imagePath, []byte("corrupted data"), 0644))
		}
	}

	return backupDir
}

func TestStaticFileService_ServeHTTP_Restore(t *testing.T) {
	t.Run("serve valid image without restore", func(t *testing.T) {
		imageDir := t.TempDir()
		backupDir := t.TempDir()
		logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{
			Level: slog.LevelDebug,
		}))

		// Create a valid image in the image directory
		createTestJPEG(t, filepath.Join(imageDir, "photos", "good.jpg"))

		conf := config.Config{
			ImageRootDirectory: imageDir,
			ConfigDirectory:    t.TempDir(),
			Environment:        "development",
			Backup: config.BackupConfig{
				BackupDirectory: backupDir,
				RetentionCount:  7,
			},
		}

		restoreService := backup.NewRestoreService(logger, conf)
		service := NewStaticFileService(logger, conf, restoreService)

		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/photos/good.jpg", nil)
		service.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("serve corrupted full-size image restored from backup", func(t *testing.T) {
		imageDir := t.TempDir()
		backupDir := t.TempDir()
		logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{
			Level: slog.LevelDebug,
		}))

		relPath := "photos/corrupted.jpg"

		// Create a corrupted image in the image directory
		corruptedPath := filepath.Join(imageDir, relPath)
		require.NoError(t, os.MkdirAll(filepath.Dir(corruptedPath), 0755))
		require.NoError(t, os.WriteFile(corruptedPath, []byte("not a real image"), 0644))

		// Create a backup with a valid copy
		createTestBackup(t, backupDir, "backup_2024-01-01T10-00-00",
			time.Date(2024, 1, 1, 10, 0, 0, 0, time.UTC), true, relPath, true)

		conf := config.Config{
			ImageRootDirectory: imageDir,
			ConfigDirectory:    t.TempDir(),
			Environment:        "development",
			Backup: config.BackupConfig{
				BackupDirectory: backupDir,
				RetentionCount:  7,
			},
		}

		restoreService := backup.NewRestoreService(logger, conf)
		service := NewStaticFileService(logger, conf, restoreService)

		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/"+relPath, nil)
		service.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("serve missing image restored from backup", func(t *testing.T) {
		imageDir := t.TempDir()
		backupDir := t.TempDir()
		logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{
			Level: slog.LevelDebug,
		}))

		relPath := "photos/missing.jpg"

		// Do NOT create the image in the image directory (it is missing)

		// Create a backup with a valid copy
		createTestBackup(t, backupDir, "backup_2024-01-01T10-00-00",
			time.Date(2024, 1, 1, 10, 0, 0, 0, time.UTC), true, relPath, true)

		conf := config.Config{
			ImageRootDirectory: imageDir,
			ConfigDirectory:    t.TempDir(),
			Environment:        "development",
			Backup: config.BackupConfig{
				BackupDirectory: backupDir,
				RetentionCount:  7,
			},
		}

		restoreService := backup.NewRestoreService(logger, conf)
		service := NewStaticFileService(logger, conf, restoreService)

		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/"+relPath, nil)
		service.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		// Verify the file was actually restored to disk
		_, err := os.Stat(filepath.Join(imageDir, relPath))
		assert.NoError(t, err, "restored file should exist on disk")
	})

	t.Run("corrupted image with no valid backup returns error", func(t *testing.T) {
		imageDir := t.TempDir()
		backupDir := t.TempDir()
		logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{
			Level: slog.LevelDebug,
		}))

		relPath := "photos/bad.jpg"

		// Create a corrupted image in the image directory
		corruptedPath := filepath.Join(imageDir, relPath)
		require.NoError(t, os.MkdirAll(filepath.Dir(corruptedPath), 0755))
		require.NoError(t, os.WriteFile(corruptedPath, []byte("not a real image"), 0644))

		// Create a backup that also has a corrupted copy
		createTestBackup(t, backupDir, "backup_2024-01-01T10-00-00",
			time.Date(2024, 1, 1, 10, 0, 0, 0, time.UTC), true, relPath, false)

		conf := config.Config{
			ImageRootDirectory: imageDir,
			ConfigDirectory:    t.TempDir(),
			Environment:        "development",
			Backup: config.BackupConfig{
				BackupDirectory: backupDir,
				RetentionCount:  7,
			},
		}

		restoreService := backup.NewRestoreService(logger, conf)
		service := NewStaticFileService(logger, conf, restoreService)

		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/"+relPath, nil)
		service.ServeHTTP(w, req)

		assert.Equal(t, http.StatusInternalServerError, w.Code)
		assert.Contains(t, w.Body.String(), "image corrupted and restore failed")
	})

	t.Run("corrupted resized image restored from backup", func(t *testing.T) {
		imageDir := t.TempDir()
		backupDir := t.TempDir()
		logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{
			Level: slog.LevelDebug,
		}))

		relPath := "photos/resize_corrupt.jpg"

		// Create a corrupted image in the image directory.
		// When width is specified, ResizeImage is called. If the image is
		// corrupted, the decode inside ResizeImage will fail and the service
		// will attempt a restore.
		corruptedPath := filepath.Join(imageDir, relPath)
		require.NoError(t, os.MkdirAll(filepath.Dir(corruptedPath), 0755))
		require.NoError(t, os.WriteFile(corruptedPath, []byte("not a real image"), 0644))

		// Create a backup with a valid copy
		createTestBackup(t, backupDir, "backup_2024-01-01T10-00-00",
			time.Date(2024, 1, 1, 10, 0, 0, 0, time.UTC), true, relPath, true)

		conf := config.Config{
			ImageRootDirectory: imageDir,
			ConfigDirectory:    t.TempDir(),
			Environment:        "development",
			Backup: config.BackupConfig{
				BackupDirectory: backupDir,
				RetentionCount:  7,
			},
		}

		restoreService := backup.NewRestoreService(logger, conf)
		service := NewStaticFileService(logger, conf, restoreService)

		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/"+relPath+"?width=100", nil)
		service.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("restore called with correct relative path", func(t *testing.T) {
		imageDir := t.TempDir()
		backupDir := t.TempDir()
		logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{
			Level: slog.LevelDebug,
		}))

		relPath := "deep/nested/dir/image.jpg"

		// Create a corrupted image at a deeply nested path
		corruptedPath := filepath.Join(imageDir, relPath)
		require.NoError(t, os.MkdirAll(filepath.Dir(corruptedPath), 0755))
		require.NoError(t, os.WriteFile(corruptedPath, []byte("corrupted"), 0644))

		// Create a backup with a valid copy at the same relative path
		createTestBackup(t, backupDir, "backup_2024-01-01T10-00-00",
			time.Date(2024, 1, 1, 10, 0, 0, 0, time.UTC), true, relPath, true)

		conf := config.Config{
			ImageRootDirectory: imageDir,
			ConfigDirectory:    t.TempDir(),
			Environment:        "development",
			Backup: config.BackupConfig{
				BackupDirectory: backupDir,
				RetentionCount:  7,
			},
		}

		restoreService := backup.NewRestoreService(logger, conf)
		service := NewStaticFileService(logger, conf, restoreService)

		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/"+relPath, nil)
		service.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		// Verify the restored file is a valid image at the correct path
		restoredPath := filepath.Join(imageDir, relPath)
		err := image.ValidateImageFile(restoredPath)
		assert.NoError(t, err, "restored file should be a valid image")
	})

	t.Run("missing image with no backups returns error", func(t *testing.T) {
		imageDir := t.TempDir()
		backupDir := t.TempDir()
		logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{
			Level: slog.LevelDebug,
		}))

		relPath := "photos/gone.jpg"

		// No image on disk, no backups
		conf := config.Config{
			ImageRootDirectory: imageDir,
			ConfigDirectory:    t.TempDir(),
			Environment:        "development",
			Backup: config.BackupConfig{
				BackupDirectory: backupDir,
				RetentionCount:  7,
			},
		}

		restoreService := backup.NewRestoreService(logger, conf)
		service := NewStaticFileService(logger, conf, restoreService)

		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/"+relPath, nil)
		service.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("nil restore service falls back to error on missing file", func(t *testing.T) {
		imageDir := t.TempDir()
		logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{
			Level: slog.LevelDebug,
		}))

		conf := config.Config{
			ImageRootDirectory: imageDir,
		}

		// No restore service
		service := NewStaticFileService(logger, conf, nil)

		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/photos/missing.jpg", nil)
		service.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("nil restore service returns error for corrupted full-size image", func(t *testing.T) {
		imageDir := t.TempDir()
		logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{
			Level: slog.LevelDebug,
		}))

		relPath := "photos/corrupt_no_restore.jpg"

		// Create a corrupted image on disk
		corruptedPath := filepath.Join(imageDir, relPath)
		require.NoError(t, os.MkdirAll(filepath.Dir(corruptedPath), 0755))
		require.NoError(t, os.WriteFile(corruptedPath, []byte("not a real image"), 0644))

		conf := config.Config{
			ImageRootDirectory: imageDir,
		}

		// No restore service -- tryRestoreAndValidate will return "no restore service configured"
		service := NewStaticFileService(logger, conf, nil)

		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/"+relPath, nil)
		service.ServeHTTP(w, req)

		assert.Equal(t, http.StatusInternalServerError, w.Code)
		assert.Contains(t, w.Body.String(), "image corrupted and restore failed")
	})

	t.Run("corrupted resized image with no valid backup returns error", func(t *testing.T) {
		imageDir := t.TempDir()
		backupDir := t.TempDir()
		logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{
			Level: slog.LevelDebug,
		}))

		relPath := "photos/resize_no_backup.jpg"

		// Create a corrupted image on disk
		corruptedPath := filepath.Join(imageDir, relPath)
		require.NoError(t, os.MkdirAll(filepath.Dir(corruptedPath), 0755))
		require.NoError(t, os.WriteFile(corruptedPath, []byte("not a real image"), 0644))

		// Create a backup with a corrupted copy (no valid backup available)
		createTestBackup(t, backupDir, "backup_2024-01-01T10-00-00",
			time.Date(2024, 1, 1, 10, 0, 0, 0, time.UTC), true, relPath, false)

		conf := config.Config{
			ImageRootDirectory: imageDir,
			ConfigDirectory:    t.TempDir(),
			Environment:        "development",
			Backup: config.BackupConfig{
				BackupDirectory: backupDir,
				RetentionCount:  7,
			},
		}

		restoreService := backup.NewRestoreService(logger, conf)
		service := NewStaticFileService(logger, conf, restoreService)

		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/"+relPath+"?width=100", nil)
		service.ServeHTTP(w, req)

		assert.Equal(t, http.StatusInternalServerError, w.Code)
		assert.Contains(t, w.Body.String(), "image corrupted and restore failed")
	})
}
