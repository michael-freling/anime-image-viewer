package image

import (
	"context"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	sqlite3 "github.com/mattn/go-sqlite3"
	"github.com/michael-freling/anime-image-viewer/internal/config"
	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// createScannerTestJPEG creates a minimal valid JPEG at the given path.
func createScannerTestJPEG(t *testing.T, path string) {
	t.Helper()
	require.NoError(t, os.MkdirAll(filepath.Dir(path), 0755))
	img := image.NewRGBA(image.Rect(0, 0, 10, 10))
	for y := 0; y < 10; y++ {
		for x := 0; x < 10; x++ {
			img.Set(x, y, color.RGBA{R: 100, G: 150, B: 200, A: 255})
		}
	}
	f, err := os.Create(path)
	require.NoError(t, err)
	defer f.Close()
	require.NoError(t, jpeg.Encode(f, img, nil))
}

// mockRestorer is a test implementation of the FileRestorer interface.
type mockRestorer struct {
	mu    sync.Mutex
	calls []mockRestorerCall
	// restoreFn is called when RestoreSingleFile is invoked. If nil, an error
	// is returned.
	restoreFn func(ctx context.Context, relPath string, imageRootDir string) error
}

type mockRestorerCall struct {
	RelPath      string
	ImageRootDir string
}

func (m *mockRestorer) RestoreSingleFile(ctx context.Context, relativeFilePath string, imageRootDir string) error {
	m.mu.Lock()
	m.calls = append(m.calls, mockRestorerCall{RelPath: relativeFilePath, ImageRootDir: imageRootDir})
	m.mu.Unlock()
	if m.restoreFn != nil {
		return m.restoreFn(ctx, relativeFilePath, imageRootDir)
	}
	return errors.New("no backup available")
}

func TestBackgroundScanner_ScansValidImagesAndBackfillsHash(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	dbClient := db.NewTestClient(t)
	dbClient.Truncate(t, db.File{})

	imageRootDir := t.TempDir()
	conf := config.Config{
		ImageRootDirectory: imageRootDir,
	}

	dirPath := filepath.Join(imageRootDir, "photos")
	require.NoError(t, os.MkdirAll(dirPath, 0755))
	createScannerTestJPEG(t, filepath.Join(dirPath, "good.jpg"))

	db.LoadTestData(t, dbClient, []db.File{
		{ID: 1, Name: "photos", ParentID: 0, Type: db.FileTypeDirectory},
		{ID: 2, Name: "good.jpg", ParentID: 1, Type: db.FileTypeImage},
	})

	restorer := &mockRestorer{}
	scanner := NewBackgroundScanner(logger, dbClient.Client, conf, restorer)

	ctx := context.Background()
	scanner.run(ctx)

	files, err := dbClient.File().FindAllImageFiles()
	require.NoError(t, err)
	require.Len(t, files, 1)
	assert.NotEmpty(t, files[0].ContentHash, "content hash should be backfilled for valid images")
	assert.Empty(t, restorer.calls)
}

func TestBackgroundScanner_DetectsCorruptedAndRestores(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	dbClient := db.NewTestClient(t)
	dbClient.Truncate(t, db.File{})

	imageRootDir := t.TempDir()
	conf := config.Config{
		ImageRootDirectory: imageRootDir,
	}

	dirPath := filepath.Join(imageRootDir, "photos")
	require.NoError(t, os.MkdirAll(dirPath, 0755))
	corruptedPath := filepath.Join(dirPath, "bad.jpg")
	require.NoError(t, os.WriteFile(corruptedPath, []byte("not an image"), 0644))

	db.LoadTestData(t, dbClient, []db.File{
		{ID: 1, Name: "photos", ParentID: 0, Type: db.FileTypeDirectory},
		{ID: 2, Name: "bad.jpg", ParentID: 1, Type: db.FileTypeImage},
	})

	restorer := &mockRestorer{
		restoreFn: func(ctx context.Context, relPath string, rootDir string) error {
			destPath := filepath.Join(rootDir, relPath)
			createScannerTestJPEG(t, destPath)
			return nil
		},
	}
	scanner := NewBackgroundScanner(logger, dbClient.Client, conf, restorer)

	ctx := context.Background()
	scanner.run(ctx)

	require.Len(t, restorer.calls, 1)
	assert.Equal(t, filepath.Join("photos", "bad.jpg"), restorer.calls[0].RelPath)

	restoredPath := filepath.Join(dirPath, "bad.jpg")
	assert.NoError(t, ValidateImageFile(restoredPath), "image should be restored")

	files, err := dbClient.File().FindAllImageFiles()
	require.NoError(t, err)
	require.Len(t, files, 1)
	assert.NotEmpty(t, files[0].ContentHash, "content hash should be stored after restore")
}

func TestBackgroundScanner_DetectsHashMismatch(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	dbClient := db.NewTestClient(t)
	dbClient.Truncate(t, db.File{})

	imageRootDir := t.TempDir()
	conf := config.Config{
		ImageRootDirectory: imageRootDir,
	}

	dirPath := filepath.Join(imageRootDir, "photos")
	require.NoError(t, os.MkdirAll(dirPath, 0755))
	createScannerTestJPEG(t, filepath.Join(dirPath, "changed.jpg"))

	db.LoadTestData(t, dbClient, []db.File{
		{ID: 1, Name: "photos", ParentID: 0, Type: db.FileTypeDirectory},
		{ID: 2, Name: "changed.jpg", ParentID: 1, Type: db.FileTypeImage, ContentHash: "0000000000000000000000000000000000000000000000000000000000000000"},
	})

	restorer := &mockRestorer{}
	scanner := NewBackgroundScanner(logger, dbClient.Client, conf, restorer)

	ctx := context.Background()
	scanner.run(ctx)

	require.Len(t, restorer.calls, 1)
	assert.Equal(t, filepath.Join("photos", "changed.jpg"), restorer.calls[0].RelPath)
}

func TestBackgroundScanner_HashMatchSkipsRestore(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	dbClient := db.NewTestClient(t)
	dbClient.Truncate(t, db.File{})

	imageRootDir := t.TempDir()
	conf := config.Config{
		ImageRootDirectory: imageRootDir,
	}

	dirPath := filepath.Join(imageRootDir, "photos")
	require.NoError(t, os.MkdirAll(dirPath, 0755))
	imgPath := filepath.Join(dirPath, "ok.jpg")
	createScannerTestJPEG(t, imgPath)

	hash, err := ComputeFileHash(imgPath)
	require.NoError(t, err)

	db.LoadTestData(t, dbClient, []db.File{
		{ID: 1, Name: "photos", ParentID: 0, Type: db.FileTypeDirectory},
		{ID: 2, Name: "ok.jpg", ParentID: 1, Type: db.FileTypeImage, ContentHash: hash},
	})

	restorer := &mockRestorer{}
	scanner := NewBackgroundScanner(logger, dbClient.Client, conf, restorer)

	ctx := context.Background()
	scanner.run(ctx)

	files, err := dbClient.File().FindAllImageFiles()
	require.NoError(t, err)
	require.Len(t, files, 1)
	assert.Equal(t, hash, files[0].ContentHash)
	assert.Empty(t, restorer.calls)
}

func TestBackgroundScanner_RespectsContextCancellation(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	dbClient := db.NewTestClient(t)
	dbClient.Truncate(t, db.File{})

	imageRootDir := t.TempDir()
	conf := config.Config{
		ImageRootDirectory: imageRootDir,
	}

	dirPath := filepath.Join(imageRootDir, "photos")
	require.NoError(t, os.MkdirAll(dirPath, 0755))

	dbFiles := []db.File{
		{ID: 1, Name: "photos", ParentID: 0, Type: db.FileTypeDirectory},
	}
	for i := uint(2); i < 12; i++ {
		name := "img_" + string(rune('a'+i)) + ".jpg"
		createScannerTestJPEG(t, filepath.Join(dirPath, name))
		dbFiles = append(dbFiles, db.File{
			ID: i, Name: name, ParentID: 1, Type: db.FileTypeImage,
		})
	}
	db.LoadTestData(t, dbClient, dbFiles)

	restorer := &mockRestorer{}
	scanner := NewBackgroundScanner(logger, dbClient.Client, conf, restorer)

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	scanner.Start(ctx)
	time.Sleep(50 * time.Millisecond)
	// No assertion needed beyond "no panic/deadlock".
}

func TestBackgroundScanner_RestoreFailsStillContinues(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	dbClient := db.NewTestClient(t)
	dbClient.Truncate(t, db.File{})

	imageRootDir := t.TempDir()
	conf := config.Config{
		ImageRootDirectory: imageRootDir,
	}

	// Create a corrupted image AND a valid image
	dirPath := filepath.Join(imageRootDir, "photos")
	require.NoError(t, os.MkdirAll(dirPath, 0755))
	require.NoError(t, os.WriteFile(filepath.Join(dirPath, "bad.jpg"), []byte("not an image"), 0644))
	createScannerTestJPEG(t, filepath.Join(dirPath, "good.jpg"))

	db.LoadTestData(t, dbClient, []db.File{
		{ID: 1, Name: "photos", ParentID: 0, Type: db.FileTypeDirectory},
		{ID: 2, Name: "bad.jpg", ParentID: 1, Type: db.FileTypeImage},
		{ID: 3, Name: "good.jpg", ParentID: 1, Type: db.FileTypeImage},
	})

	// Restorer always fails
	restorer := &mockRestorer{}
	scanner := NewBackgroundScanner(logger, dbClient.Client, conf, restorer)

	ctx := context.Background()
	scanner.run(ctx)

	// Should have attempted restore for the corrupted file
	require.Len(t, restorer.calls, 1)

	// The valid image should still get its hash backfilled
	files, err := dbClient.File().FindAllImageFiles()
	require.NoError(t, err)
	hashFilled := 0
	for _, f := range files {
		if f.ContentHash != "" {
			hashFilled++
		}
	}
	assert.Equal(t, 1, hashFilled, "valid image should still have hash backfilled even when another image fails restore")
}

func TestBackgroundScanner_EmptyDB(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	dbClient := db.NewTestClient(t)
	dbClient.Truncate(t, db.File{})

	imageRootDir := t.TempDir()
	conf := config.Config{
		ImageRootDirectory: imageRootDir,
	}

	restorer := &mockRestorer{}
	scanner := NewBackgroundScanner(logger, dbClient.Client, conf, restorer)

	ctx := context.Background()
	// Should complete without errors when there are no images
	scanner.run(ctx)
	assert.Empty(t, restorer.calls)
}

func TestBackgroundScanner_MissingFileWithStoredHash(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	dbClient := db.NewTestClient(t)
	dbClient.Truncate(t, db.File{})

	imageRootDir := t.TempDir()
	conf := config.Config{
		ImageRootDirectory: imageRootDir,
	}

	// Create directory on disk but NOT the image file
	dirPath := filepath.Join(imageRootDir, "photos")
	require.NoError(t, os.MkdirAll(dirPath, 0755))

	// DB says the file has a hash, but the file doesn't exist on disk
	db.LoadTestData(t, dbClient, []db.File{
		{ID: 1, Name: "photos", ParentID: 0, Type: db.FileTypeDirectory},
		{ID: 2, Name: "missing.jpg", ParentID: 1, Type: db.FileTypeImage, ContentHash: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"},
	})

	restorer := &mockRestorer{}
	scanner := NewBackgroundScanner(logger, dbClient.Client, conf, restorer)

	ctx := context.Background()
	scanner.run(ctx)

	// Should have attempted restore because the file cannot be hashed
	require.Len(t, restorer.calls, 1)
	assert.Equal(t, filepath.Join("photos", "missing.jpg"), restorer.calls[0].RelPath)
}

func TestBackgroundScanner_MissingFileWithoutHash(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	dbClient := db.NewTestClient(t)
	dbClient.Truncate(t, db.File{})

	imageRootDir := t.TempDir()
	conf := config.Config{
		ImageRootDirectory: imageRootDir,
	}

	// Create directory on disk but NOT the image file
	dirPath := filepath.Join(imageRootDir, "photos")
	require.NoError(t, os.MkdirAll(dirPath, 0755))

	// DB has no hash and file doesn't exist on disk — triggers validation error
	db.LoadTestData(t, dbClient, []db.File{
		{ID: 1, Name: "photos", ParentID: 0, Type: db.FileTypeDirectory},
		{ID: 2, Name: "gone.jpg", ParentID: 1, Type: db.FileTypeImage},
	})

	restorer := &mockRestorer{}
	scanner := NewBackgroundScanner(logger, dbClient.Client, conf, restorer)

	ctx := context.Background()
	scanner.run(ctx)

	// Should have attempted restore because ValidateImageFile fails on missing file
	require.Len(t, restorer.calls, 1)
	assert.Equal(t, filepath.Join("photos", "gone.jpg"), restorer.calls[0].RelPath)
}

func TestBackgroundScanner_HandlesMissingParentDirectory(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	dbClient := db.NewTestClient(t)
	dbClient.Truncate(t, db.File{})

	imageRootDir := t.TempDir()
	conf := config.Config{
		ImageRootDirectory: imageRootDir,
	}

	db.LoadTestData(t, dbClient, []db.File{
		{ID: 1, Name: "orphan.jpg", ParentID: 999, Type: db.FileTypeImage},
	})

	restorer := &mockRestorer{}
	scanner := NewBackgroundScanner(logger, dbClient.Client, conf, restorer)

	ctx := context.Background()
	scanner.run(ctx)
	assert.Empty(t, restorer.calls)
}

func TestIsSQLiteBusyOrLocked(t *testing.T) {
	tests := []struct {
		name     string
		err      error
		expected bool
	}{
		{
			name:     "nil error",
			err:      nil,
			expected: false,
		},
		{
			name:     "non-sqlite error",
			err:      fmt.Errorf("some other error"),
			expected: false,
		},
		{
			name: "sqlite busy error",
			err: sqlite3.Error{
				Code: sqlite3.ErrBusy,
			},
			expected: true,
		},
		{
			name: "sqlite locked error",
			err: sqlite3.Error{
				Code: sqlite3.ErrLocked,
			},
			expected: true,
		},
		{
			name: "wrapped sqlite busy error",
			err: fmt.Errorf("db operation failed: %w", sqlite3.Error{
				Code: sqlite3.ErrBusy,
			}),
			expected: true,
		},
		{
			name: "wrapped sqlite locked error",
			err: fmt.Errorf("db operation failed: %w", sqlite3.Error{
				Code: sqlite3.ErrLocked,
			}),
			expected: true,
		},
		{
			name: "other sqlite error code",
			err: sqlite3.Error{
				Code: sqlite3.ErrConstraint,
			},
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.expected, isSQLiteBusyOrLocked(tt.err))
		})
	}
}

func TestRetryOnSQLiteBusy_SucceedsFirstTry(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	calls := 0
	err := retryOnSQLiteBusy(context.Background(), logger, "test", retryBackoffs, func() error {
		calls++
		return nil
	})
	require.NoError(t, err)
	assert.Equal(t, 1, calls)
}

func TestRetryOnSQLiteBusy_NonRetryableError(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	calls := 0
	permanentErr := fmt.Errorf("constraint violation")
	err := retryOnSQLiteBusy(context.Background(), logger, "test", retryBackoffs, func() error {
		calls++
		return permanentErr
	})
	require.ErrorIs(t, err, permanentErr)
	assert.Equal(t, 1, calls, "should not retry on non-SQLite-busy errors")
}

func TestRetryOnSQLiteBusy_RetriesOnBusyThenSucceeds(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	calls := 0
	busyErr := sqlite3.Error{Code: sqlite3.ErrBusy}
	// Use very short backoffs for the test.
	shortBackoffs := []time.Duration{1 * time.Millisecond, 1 * time.Millisecond, 1 * time.Millisecond}
	err := retryOnSQLiteBusy(context.Background(), logger, "test", shortBackoffs, func() error {
		calls++
		if calls < 3 {
			return busyErr
		}
		return nil
	})
	require.NoError(t, err)
	assert.Equal(t, 3, calls, "should succeed on third attempt")
}

func TestRetryOnSQLiteBusy_RetriesOnLockedThenSucceeds(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	calls := 0
	lockedErr := sqlite3.Error{Code: sqlite3.ErrLocked}
	shortBackoffs := []time.Duration{1 * time.Millisecond, 1 * time.Millisecond, 1 * time.Millisecond}
	err := retryOnSQLiteBusy(context.Background(), logger, "test", shortBackoffs, func() error {
		calls++
		if calls < 2 {
			return lockedErr
		}
		return nil
	})
	require.NoError(t, err)
	assert.Equal(t, 2, calls, "should succeed on second attempt")
}

func TestRetryOnSQLiteBusy_ExhaustsRetries(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	calls := 0
	busyErr := sqlite3.Error{Code: sqlite3.ErrBusy}
	shortBackoffs := []time.Duration{1 * time.Millisecond, 1 * time.Millisecond, 1 * time.Millisecond}
	err := retryOnSQLiteBusy(context.Background(), logger, "test", shortBackoffs, func() error {
		calls++
		return busyErr
	})
	require.Error(t, err)
	// Initial attempt + 3 retries = 4 total calls
	assert.Equal(t, 4, calls, "should attempt 1 initial + 3 retries")
}

func TestRetryOnSQLiteBusy_RespectsContextCancellation(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	calls := 0
	busyErr := sqlite3.Error{Code: sqlite3.ErrBusy}
	ctx, cancel := context.WithCancel(context.Background())

	// Use longer backoffs so the cancel has time to take effect.
	longBackoffs := []time.Duration{1 * time.Second, 1 * time.Second, 1 * time.Second}
	go func() {
		// Give the first attempt time to execute, then cancel.
		time.Sleep(10 * time.Millisecond)
		cancel()
	}()
	err := retryOnSQLiteBusy(ctx, logger, "test", longBackoffs, func() error {
		calls++
		return busyErr
	})
	require.ErrorIs(t, err, context.Canceled)
	assert.Equal(t, 1, calls, "should stop retrying after context cancellation")
}

func TestFlushHashBatchWithRetry_SucceedsWithRealDB(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	dbClient := db.NewTestClient(t)
	dbClient.Truncate(t, db.File{})

	db.LoadTestData(t, dbClient, []db.File{
		{ID: 1, Name: "photos", ParentID: 0, Type: db.FileTypeDirectory},
		{ID: 2, Name: "test1.jpg", ParentID: 1, Type: db.FileTypeImage},
		{ID: 3, Name: "test2.jpg", ParentID: 1, Type: db.FileTypeImage},
	})

	scanner := NewBackgroundScanner(logger, dbClient.Client, config.Config{}, &mockRestorer{})
	ctx := context.Background()

	batch := map[uint]string{
		2: "abcdef1234567890",
		3: "1234567890abcdef",
	}
	err := scanner.flushHashBatchWithRetry(ctx, batch)
	require.NoError(t, err)

	files, err := dbClient.File().FindAllImageFiles()
	require.NoError(t, err)
	require.Len(t, files, 2)
	hashByID := make(map[uint]string)
	for _, f := range files {
		hashByID[f.ID] = f.ContentHash
	}
	assert.Equal(t, "abcdef1234567890", hashByID[2])
	assert.Equal(t, "1234567890abcdef", hashByID[3])
}

func TestRetryBackoffs_HasExpectedValues(t *testing.T) {
	require.Len(t, retryBackoffs, 3)
	assert.Equal(t, 100*time.Millisecond, retryBackoffs[0])
	assert.Equal(t, 500*time.Millisecond, retryBackoffs[1])
	assert.Equal(t, 1*time.Second, retryBackoffs[2])
}
