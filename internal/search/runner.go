package search

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"slices"

	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/michael-freling/anime-image-viewer/internal/image"
	"github.com/michael-freling/anime-image-viewer/internal/tag"
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

type ImageFinder struct {
	Images map[uint]image.ImageFile

	TaggedImages map[uint][]uint
}

func (runner SearchImageRunner) SearchImages(
	ctx context.Context,
	tagID uint,
	isInvertedTagSearch bool,
	parentDirectoryID uint,
) (ImageFinder, error) {
	result := ImageFinder{}

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

		imageFiles = make([]image.ImageFile, len(dbImageFiles)+len(imageFilesUnderDirectories))
		imageFileErrors := make([]error, 0)
		for i, dbImageFile := range slices.Concat(dbImageFiles, imageFilesUnderDirectories) {
			parentDirectory := parentDirectories[dbImageFile.ParentID]
			if parentDirectory.ID == 0 {
				imageFileErrors = append(imageFileErrors, fmt.Errorf("%w: %d for an image %d", image.ErrDirectoryNotFound, dbImageFile.ParentID, dbImageFile.ID))
				continue
			}
			imageFile, err := runner.imageFileConverter.ConvertImageFile(parentDirectory, dbImageFile)
			if err != nil {
				imageFileErrors = append(imageFileErrors, fmt.Errorf("imageFileConverter.ConvertImageFile: %w", err))
				continue
			}
			imageFiles[i] = imageFile
		}
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
			imageFilesMap, err := runner.imageReader.ReadImagesByIDs(fileIDs)
			if err != nil {
				return result, fmt.Errorf("fileReader.ReadImagesByIDs: %w", err)
			}
			imageFiles = make([]image.ImageFile, 0)
			for _, fileID := range fileIDs {
				imageFile, ok := imageFilesMap[fileID]
				if !ok {
					continue
				}
				imageFiles = append(imageFiles, imageFile)
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

	images := make(map[uint]image.ImageFile, 0)
	for _, imageFile := range imageFiles {
		images[imageFile.ID] = imageFile
	}

	// tag id to file id
	var resultTags map[uint][]uint
	if tagID != 0 {
		resultTags = make(map[uint][]uint, 0)

		// Create a map of tag IDs to file IDs
		// descendants variable may contain a directory or image files which
		// is not a target for a search by a tag ID
		fileTagsMap := make(map[uint][]uint, 0)
		for tagID, fileTagMap := range fileTags.ToTagMap() {
			for fileID := range fileTagMap {
				descendants := directoryDescendants[fileID]
				for _, descendantFileID := range descendants {
					fileTagsMap[descendantFileID] = append(fileTagsMap[descendantFileID], tagID)
				}

				for _, imageFile := range imageFiles {
					if imageFile.ID == fileID {
						fileTagsMap[fileID] = append(fileTagsMap[fileID], tagID)
						break
					}
				}
			}
		}
		runner.logger.DebugContext(ctx, "SearchImageRunner.SearchImages",
			"fileTags", fileTags,
			"fileTagsMap", fileTagsMap,
			"imageFiles", imageFiles,
		)

		// tag id to file id
		tagIsAdded := make(map[uint]map[uint]bool, 0)
		for _, imageFile := range imageFiles {
			imageFileTags := fileTagsMap[imageFile.ID]

			for _, tagID := range imageFileTags {
				if _, ok := resultTags[tagID]; ok {
					continue
				}
				resultTags[tagID] = make([]uint, 0)
				tagIsAdded[tagID] = make(map[uint]bool)
			}
			for _, tagID := range imageFileTags {
				if _, ok := tagIsAdded[tagID][imageFile.ID]; ok {
					continue
				}

				resultTags[tagID] = append(resultTags[tagID], imageFile.ID)
				tagIsAdded[tagID][imageFile.ID] = true
			}
		}
		if len(resultTags) == 0 {
			resultTags = nil
		}
	}

	return ImageFinder{
		Images:       images,
		TaggedImages: resultTags,
	}, nil
}
