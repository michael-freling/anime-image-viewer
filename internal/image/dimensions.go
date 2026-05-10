package image

import (
	"bufio"
	"fmt"
	goimage "image"
	// Decoders are registered via blank imports in validator.go (image/jpeg, image/png).
	// No additional blank imports needed here.
	"log/slog"
	"os"
	"path/filepath"

	"github.com/michael-freling/anime-image-viewer/internal/config"
	"github.com/michael-freling/anime-image-viewer/internal/db"
)

// DecodeImageDimensions reads only the image header at filePath and returns
// the pixel width and height without decoding the full image data.
func DecodeImageDimensions(filePath string) (width, height uint, err error) {
	f, err := os.Open(filePath)
	if err != nil {
		return 0, 0, err
	}
	defer f.Close()
	cfg, _, err := goimage.DecodeConfig(bufio.NewReader(f))
	if err != nil {
		return 0, 0, err
	}
	return uint(cfg.Width), uint(cfg.Height), nil
}

// dimensionBatchSize is the number of dimension updates to accumulate before
// flushing them to the database in a single transaction.
const dimensionBatchSize = 100

// BackfillImageDimensions populates image_width and image_height for all
// image files that currently have NULL dimensions. It resolves file paths
// using the directory tree (same approach as BackgroundScanner) and reads
// only the image header via image.DecodeConfig.
//
// Skip rules:
//   - File does not exist on disk: skip, leave NULL, log warning.
//   - File has a non-empty ContentHash that does not match current file:
//     skip (already corrupted).
//   - Any other error (decode, permission, etc.): abort and return error.
func BackfillImageDimensions(logger *slog.Logger, dbClient *db.Client, conf config.Config) error {
	// Query all image files where image_width IS NULL.
	files, err := dbClient.File().FindImageFilesWithNullDimensions()
	if err != nil {
		return fmt.Errorf("query images with NULL dimensions: %w", err)
	}

	if len(files) == 0 {
		logger.Info("backfill image dimensions: nothing to do, all images already have dimensions")
		return nil
	}

	logger.Info("backfill image dimensions: starting", "total", len(files))

	// Build directory tree to resolve absolute paths.
	directoryReader := NewDirectoryReader(conf, dbClient)
	dirTree, err := directoryReader.ReadDirectoryTree()
	if err != nil {
		return fmt.Errorf("read directory tree: %w", err)
	}
	dirMap := buildDirectoryMap(dirTree)

	var skipped, updated int
	pending := make(map[uint]db.ImageDimensions)

	for _, f := range files {
		parentDir, ok := dirMap[f.ParentID]
		if !ok {
			logger.Warn("backfill image dimensions: parent directory not found, skipping",
				"imageID", f.ID, "parentID", f.ParentID, "name", f.Name,
			)
			skipped++
			continue
		}

		absPath := filepath.Join(parentDir.Path, f.Name)

		// Check if the file exists on disk.
		if _, statErr := os.Stat(absPath); statErr != nil {
			if os.IsNotExist(statErr) {
				logger.Warn("backfill image dimensions: file not found on disk, skipping",
					"imageID", f.ID, "path", absPath,
				)
				skipped++
				continue
			}
			return fmt.Errorf("stat file %s (id=%d): %w", absPath, f.ID, statErr)
		}

		// If the file has a stored content hash, verify it still matches.
		if f.ContentHash != "" {
			currentHash, hashErr := ComputeFileHash(absPath)
			if hashErr != nil {
				logger.Warn("backfill image dimensions: cannot hash file, skipping",
					"imageID", f.ID, "path", absPath, "error", hashErr,
				)
				skipped++
				continue
			}
			if currentHash != f.ContentHash {
				logger.Warn("backfill image dimensions: hash mismatch (corrupted), skipping",
					"imageID", f.ID, "path", absPath,
					"expected", f.ContentHash, "actual", currentHash,
				)
				skipped++
				continue
			}
		}

		// Decode only the image header to get dimensions.
		w, h, decErr := DecodeImageDimensions(absPath)
		if decErr != nil {
			return fmt.Errorf("decode dimensions for %s (id=%d): %w", absPath, f.ID, decErr)
		}

		pending[f.ID] = db.ImageDimensions{Width: w, Height: h}

		// Flush batch when it reaches the threshold.
		if len(pending) >= dimensionBatchSize {
			if err := dbClient.File().BatchUpdateImageDimensions(pending); err != nil {
				return fmt.Errorf("batch update dimensions: %w", err)
			}
			updated += len(pending)
			pending = make(map[uint]db.ImageDimensions)
		}
	}

	// Flush remaining.
	if len(pending) > 0 {
		if err := dbClient.File().BatchUpdateImageDimensions(pending); err != nil {
			return fmt.Errorf("batch update dimensions (final): %w", err)
		}
		updated += len(pending)
	}

	logger.Info("backfill image dimensions: complete",
		"total", len(files), "updated", updated, "skipped", skipped,
	)
	return nil
}
