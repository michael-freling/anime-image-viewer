package image

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"path/filepath"
	"time"

	sqlite3 "github.com/mattn/go-sqlite3"
	"github.com/michael-freling/anime-image-viewer/internal/config"
	"github.com/michael-freling/anime-image-viewer/internal/db"
)

// FileRestorer is an interface for restoring a single corrupted file from backups.
// This is satisfied by backup.RestoreService.RestoreSingleFile.
type FileRestorer interface {
	RestoreSingleFile(ctx context.Context, relativeFilePath string, imageRootDir string) error
}

// BackgroundScanner scans all DB-tracked images on startup, validates them,
// and attempts to restore corrupted files from backups.
type BackgroundScanner struct {
	logger   *slog.Logger
	dbClient *db.Client
	config   config.Config
	restorer FileRestorer
}

// NewBackgroundScanner creates a new BackgroundScanner.
func NewBackgroundScanner(
	logger *slog.Logger,
	dbClient *db.Client,
	conf config.Config,
	restorer FileRestorer,
) *BackgroundScanner {
	return &BackgroundScanner{
		logger:   logger,
		dbClient: dbClient,
		config:   conf,
		restorer: restorer,
	}
}

// Start launches the background scan goroutine. It returns immediately and does
// not block the caller. The scan respects ctx cancellation (e.g. on app shutdown).
func (s *BackgroundScanner) Start(ctx context.Context) {
	go s.run(ctx)
}

func (s *BackgroundScanner) run(ctx context.Context) {
	s.logger.InfoContext(ctx, "background image scan started")

	// Build a directory tree so we can resolve file paths.
	directoryReader := NewDirectoryReader(s.config, s.dbClient)
	dirTree, err := directoryReader.ReadDirectoryTree()
	if err != nil {
		s.logger.ErrorContext(ctx, "background scan: failed to read directory tree", "error", err)
		return
	}

	// Collect all directories into a map keyed by ID for quick lookup.
	dirMap := buildDirectoryMap(dirTree)

	// Fetch every image file from the database.
	imageFiles, err := s.dbClient.File().FindAllImageFiles()
	if err != nil {
		s.logger.ErrorContext(ctx, "background scan: failed to query image files", "error", err)
		return
	}

	var scanned, corrupted, restored, failed int

	for _, f := range imageFiles {
		select {
		case <-ctx.Done():
			s.logger.WarnContext(ctx, "background scan cancelled",
				"scanned", scanned, "corrupted", corrupted, "restored", restored, "failed", failed,
			)
			return
		default:
		}

		parentDir, ok := dirMap[f.ParentID]
		if !ok {
			s.logger.WarnContext(ctx, "background scan: parent directory not found for image",
				"imageID", f.ID, "parentID", f.ParentID,
			)
			failed++
			scanned++
			continue
		}

		absPath := filepath.Join(parentDir.Path, f.Name)
		relPath, err := filepath.Rel(s.config.ImageRootDirectory, absPath)
		if err != nil {
			s.logger.ErrorContext(ctx, "background scan: failed to compute relative path",
				"imageID", f.ID, "absPath", absPath, "error", err,
			)
			failed++
			scanned++
			continue
		}

		isCorrupted := false

		// If the DB stores a content hash, do a fast hash comparison first.
		if f.ContentHash != "" {
			currentHash, hashErr := ComputeFileHash(absPath)
			if hashErr != nil {
				// File may be missing or unreadable — treat as corrupted.
				s.logger.WarnContext(ctx, "background scan: cannot hash image file",
					"imageID", f.ID, "path", absPath, "error", hashErr,
				)
				isCorrupted = true
			} else if currentHash != f.ContentHash {
				s.logger.WarnContext(ctx, "background scan: hash mismatch detected",
					"imageID", f.ID, "path", absPath,
					"expected", f.ContentHash, "actual", currentHash,
				)
				isCorrupted = true
			}
		} else {
			// No stored hash — perform full image decode validation and backfill
			// the hash if the image is valid.
			if valErr := ValidateImageFile(absPath); valErr != nil {
				s.logger.WarnContext(ctx, "background scan: image validation failed",
					"imageID", f.ID, "path", absPath, "error", valErr,
				)
				isCorrupted = true
			} else {
				// Image is valid; compute and store the hash for future scans.
				hash, hashErr := ComputeFileHash(absPath)
				if hashErr == nil {
					if dbErr := s.updateContentHashWithRetry(ctx, f.ID, hash); dbErr != nil {
						s.logger.WarnContext(ctx, "background scan: failed to store hash",
							"imageID", f.ID, "error", dbErr,
						)
					}
				}
			}
		}

		if isCorrupted {
			corrupted++
			if restoreErr := s.restorer.RestoreSingleFile(ctx, relPath, s.config.ImageRootDirectory); restoreErr != nil {
				s.logger.ErrorContext(ctx, "background scan: restore failed",
					"imageID", f.ID, "path", absPath, "error", restoreErr,
				)
				failed++
			} else {
				s.logger.InfoContext(ctx, "background scan: image restored from backup",
					"imageID", f.ID, "path", absPath,
				)
				restored++
				// Recompute and store the hash after a successful restore.
				hash, hashErr := ComputeFileHash(absPath)
				if hashErr == nil {
					if dbErr := s.updateContentHashWithRetry(ctx, f.ID, hash); dbErr != nil {
						s.logger.WarnContext(ctx, "background scan: failed to store hash after restore",
							"imageID", f.ID, "error", dbErr,
						)
					}
				}
			}
		}

		scanned++

		// Small sleep between images to reduce SQLite write contention with the
		// rest of the application. The scanner runs in the background so
		// throughput is not critical.
		select {
		case <-ctx.Done():
			return
		case <-time.After(50 * time.Millisecond):
		}
	}

	s.logger.InfoContext(ctx, fmt.Sprintf("background scan complete: %d images scanned, %d corrupted, %d restored, %d failed",
		scanned, corrupted, restored, failed),
	)
}

// isSQLiteBusyOrLocked reports whether the error is a SQLite BUSY or LOCKED error.
func isSQLiteBusyOrLocked(err error) bool {
	if err == nil {
		return false
	}
	var sqliteErr sqlite3.Error
	if errors.As(err, &sqliteErr) {
		return sqliteErr.Code == sqlite3.ErrBusy || sqliteErr.Code == sqlite3.ErrLocked
	}
	return false
}

// retryBackoffs defines the sleep durations between retries for SQLite busy/locked errors.
var retryBackoffs = []time.Duration{100 * time.Millisecond, 500 * time.Millisecond, 1 * time.Second}

// updateContentHashWithRetry attempts to store a content hash, retrying on SQLite
// busy/locked errors with increasing backoff delays. The scanner runs in the
// background so it can afford to wait.
func (s *BackgroundScanner) updateContentHashWithRetry(ctx context.Context, imageID uint, hash string) error {
	var err error
	for attempt := 0; attempt <= len(retryBackoffs); attempt++ {
		err = s.dbClient.File().UpdateContentHash(imageID, hash)
		if err == nil {
			return nil
		}
		if !isSQLiteBusyOrLocked(err) {
			return err
		}
		if attempt < len(retryBackoffs) {
			s.logger.DebugContext(ctx, "background scan: SQLite busy, retrying",
				"imageID", imageID, "attempt", attempt+1, "backoff", retryBackoffs[attempt],
			)
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(retryBackoffs[attempt]):
			}
		}
	}
	return err
}

// buildDirectoryMap flattens a Directory tree into a map keyed by directory ID.
func buildDirectoryMap(root Directory) map[uint]Directory {
	m := make(map[uint]Directory)
	var walk func(d Directory)
	walk = func(d Directory) {
		m[d.ID] = d
		for _, child := range d.Children {
			walk(*child)
		}
	}
	walk(root)
	return m
}
