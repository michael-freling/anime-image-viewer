package search

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"slices"

	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/michael-freling/anime-image-viewer/internal/image"
	"github.com/michael-freling/anime-image-viewer/internal/tag"
	"github.com/michael-freling/anime-image-viewer/internal/xslices"
)

type SearchImageRunner struct {
	logger             *slog.Logger
	dbClient           *db.Client
	directoryReader    *image.DirectoryReader
	imageReader        *image.Reader
	tagReader          *tag.Reader
	imageFileConverter *image.ImageFileConverter
}

func NewSearchRunner(
	logger *slog.Logger,
	dbClient *db.Client,
	directoryReader *image.DirectoryReader,
	imageReader *image.Reader,
	tagReader *tag.Reader,
	imageFileConverter *image.ImageFileConverter,
) *SearchImageRunner {
	return &SearchImageRunner{
		logger:             logger,
		dbClient:           dbClient,
		directoryReader:    directoryReader,
		imageReader:        imageReader,
		tagReader:          tagReader,
		imageFileConverter: imageFileConverter,
	}
}

func (runner SearchImageRunner) SearchImages(
	ctx context.Context,
	tagID uint,
	isInvertedTagSearch bool,
	parentDirectoryID uint,
) (image.ImageFileList, error) {
	var result image.ImageFileList

	var fileTags db.FileTagList
	if tagID != 0 {
		var err error
		fileTags, err = runner.tagReader.ReadDBTagRecursively(tagID)
		if err != nil {
			return result, fmt.Errorf("reader.readDBTagRecursively: %w", err)
		}
		if !isInvertedTagSearch && len(fileTags) == 0 {
			return result, nil
		}
	}

	var imageFiles []image.ImageFile
	parentDirectories := make(map[uint]image.Directory, 0)
	directoryDescendants := make(map[uint][]uint, 0)
	if parentDirectoryID == 0 {
		fileIDs := fileTags.ToFileIDs()

		// find ancestors of directories
		directories, err := runner.directoryReader.ReadDirectories(fileIDs)
		if err != nil && !errors.Is(err, image.ErrDirectoryNotFound) {
			return result, fmt.Errorf("directoryReader.ReadDirectories: %w", err)
		}
		for _, directory := range directories {
			for id, fileIDs := range directory.ToFlatIDMap() {
				directoryDescendants[id] = append(directoryDescendants[id], fileIDs...)
			}
		}

		dbParentIDs := make([]uint, len(directories))
		for _, directory := range directories {
			descendants := directory.GetDescendants()
			for _, descendant := range descendants {
				dbParentIDs = append(dbParentIDs, descendant.ID)
			}
			dbParentIDs = append(dbParentIDs, directory.ID)
		}
		imageFilesUnderDirectories, err := runner.dbClient.File().
			FindImageFilesByParentIDs(dbParentIDs)
		if err != nil && !errors.Is(err, db.ErrRecordNotFound) {
			return result, fmt.Errorf("db.FindImageFilesByParentIDs: %w", err)
		}

		// find files
		dbImageFiles, err := runner.dbClient.File().
			FindImageFilesByIDs(fileIDs)
		if err != nil && !errors.Is(err, db.ErrRecordNotFound) {
			return result, fmt.Errorf("db.FindImageFilesByIDs: %w", err)
		}
		for _, dbImageFile := range dbImageFiles {
			dbParentIDs = append(dbParentIDs, dbImageFile.ParentID)
		}
		parentDirectories, err = runner.directoryReader.ReadDirectories(dbParentIDs)
		if err != nil && !errors.Is(err, image.ErrDirectoryNotFound) {
			return result, fmt.Errorf("directoryReader.ReadDirectories: %w", err)
		}

		allDBImageFiles := slices.Concat(dbImageFiles, imageFilesUnderDirectories)
		imageFiles = make([]image.ImageFile, 0, len(allDBImageFiles))
		imageFileErrors := make([]error, 0)
		staleCandidates := make([]image.MissingFileCandidate, 0)
		for _, dbImageFile := range allDBImageFiles {
			parentDirectory := parentDirectories[dbImageFile.ParentID]
			if parentDirectory.ID == 0 {
				// Stale record: parent directory no longer in DB. Skip it
				// rather than failing the whole search.
				runner.logger.Warn("skipping image file with missing parent directory",
					"id", dbImageFile.ID,
					"parentID", dbImageFile.ParentID,
				)
				continue
			}
			imageFile, err := runner.imageFileConverter.ConvertImageFile(parentDirectory, dbImageFile)
			if err != nil {
				// Stale record: the file was removed or moved outside the app.
				// Skip it instead of failing the whole search.
				if errors.Is(err, os.ErrNotExist) {
					runner.logger.Warn("image file missing from disk",
						"id", dbImageFile.ID,
						"name", dbImageFile.Name,
						"error", err,
					)
					staleCandidates = append(staleCandidates, image.MissingFileCandidate{
						ID:         dbImageFile.ID,
						ParentPath: parentDirectory.Path,
					})
					continue
				}
				imageFileErrors = append(imageFileErrors, fmt.Errorf("imageFileConverter.ConvertImageFile: %w", err))
				continue
			}
			imageFiles = append(imageFiles, imageFile)
		}
		image.DeleteImageRecordsForDeletedFiles(runner.dbClient, staleCandidates)
		if len(imageFileErrors) > 0 {
			return result, errors.Join(imageFileErrors...)
		}
	} else {
		parentDirectory, err := runner.directoryReader.ReadDirectory(parentDirectoryID)
		if err != nil {
			return result, fmt.Errorf("directoryReader.ReadDirectory: %w", err)
		}
		parentDirectories[parentDirectoryID] = parentDirectory

		hasParentDirectoryTag := fileTags.ContainsFileID(parentDirectoryID)
		if isInvertedTagSearch && hasParentDirectoryTag {
			return result, nil
			// return result, fmt.Errorf("%w: a directory %s already has a tag",
			// 	xerrors.ErrInvalidArgument,
			// 	parentDirectory.Name,
			// )
		}
		if hasParentDirectoryTag || isInvertedTagSearch {
			// Do not look up files in sub directories recursively
			imageFiles, err = runner.directoryReader.ReadImageFiles(parentDirectoryID)
			if err != nil {
				return result, fmt.Errorf("directoryReader.ReadImageFiles: %w", err)
			}
			for _, imageFile := range imageFiles {
				directoryDescendants[parentDirectoryID] = append(directoryDescendants[parentDirectoryID], imageFile.ID)
			}
		} else {
			fileIDs := fileTags.ToFileIDs()
			imageFiles, err = runner.imageReader.ReadImagesByIDs(fileIDs)
			if err != nil {
				return result, fmt.Errorf("fileReader.ReadImagesByIDs: %w", err)
			}
		}

		if isInvertedTagSearch {
			filteredImageFiles := make([]image.ImageFile, 0)
			for _, image := range imageFiles {
				if fileTags.ContainsFileID(image.ID) {
					continue
				}
				filteredImageFiles = append(filteredImageFiles, image)
			}
			imageFiles = filteredImageFiles
		}
	}

	// in order to sort images, re-read them from the database
	imageFileIDs := xslices.Map(imageFiles, func(imageFile image.ImageFile) uint {
		return imageFile.ID
	})
	images, err := runner.imageReader.ReadImagesByIDs(imageFileIDs)
	if err != nil {
		return result, fmt.Errorf("directoryReader.ReadImageFiles: %w", err)
	}

	return images, nil
}
