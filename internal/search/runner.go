package search

import (
	"errors"
	"fmt"
	"slices"

	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/michael-freling/anime-image-viewer/internal/image"
	"github.com/michael-freling/anime-image-viewer/internal/tag"
)

type SearchImageRunner struct {
	dbClient           *db.Client
	directoryReader    *image.DirectoryReader
	imageReader        *image.Reader
	tagReader          *tag.Reader
	imageFileConverter *image.ImageFileConverter
}

func NewSearchRunner(
	dbClient *db.Client,
	directoryReader *image.DirectoryReader,
	imageReader *image.Reader,
	tagReader *tag.Reader,
	imageFileConverter *image.ImageFileConverter,
) *SearchImageRunner {
	return &SearchImageRunner{
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

func (runner SearchImageRunner) SearchImages(tagID uint, parentDirectoryID uint) (ImageFinder, error) {
	result := ImageFinder{}

	tagTree, err := runner.tagReader.ReadAllTagTree()
	if err != nil {
		return result, fmt.Errorf("reader.ReadAllTagTree: %w", err)
	}

	fileTags, err := runner.tagReader.ReadDBTagRecursively(tagID)
	if err != nil {
		return result, fmt.Errorf("reader.readDBTagRecursively: %w", err)
	}
	if len(fileTags) == 0 {
		return result, nil
	}
	fileIDs := fileTags.ToFileIDs()

	var imageFiles []image.ImageFile
	parentDirectories := make(map[uint]image.Directory, 0)
	directoryDescendants := make(map[uint][]uint, 0)
	if parentDirectoryID == 0 {
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
		for i, dbImageFile := range slices.Concat(dbImageFiles, imageFilesUnderDirectories) {
			parentDirectory := parentDirectories[dbImageFile.ParentID]
			if parentDirectory.ID == 0 {
				return result, fmt.Errorf("%w: %d for an image %d", image.ErrDirectoryNotFound, dbImageFile.ParentID, dbImageFile.ID)
			}
			imageFile, err := runner.imageFileConverter.ConvertImageFile(parentDirectory, dbImageFile)
			if err != nil {
				return result, fmt.Errorf("imageFileConverter.ConvertImageFile: %w", err)
			}
			imageFiles[i] = imageFile
		}
	} else {
		parentDirectory, err := runner.directoryReader.ReadDirectory(parentDirectoryID)
		if err != nil {
			return result, fmt.Errorf("directoryReader.ReadDirectory: %w", err)
		}
		parentDirectories[parentDirectoryID] = parentDirectory

		hasParentDirectoryTag := false
		for _, fileTag := range fileTags {
			if fileTag.FileID == parentDirectoryID {
				hasParentDirectoryTag = true
				continue
			}
		}
		if hasParentDirectoryTag {
			// Do not look up files in sub directories recursively
			imageFiles, err = runner.directoryReader.ReadImageFiles(parentDirectoryID)
			if err != nil {
				return result, fmt.Errorf("directoryReader.ReadImageFiles: %w", err)
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
	}

	tagMap := tagTree.ConvertToFlattenMap()
	fileTagsMap := make(map[uint][]tag.Tag, 0)
	for tagID, fileTagMap := range fileTags.ToTagMap() {
		tag := tagMap[tagID]

		for fileID := range fileTagMap {
			descendants := directoryDescendants[fileID]
			for _, descendantFileID := range descendants {
				fileTagsMap[descendantFileID] = append(fileTagsMap[descendantFileID], tag)
			}

			for _, imageFile := range imageFiles {
				if imageFile.ID == fileID {
					fileTagsMap[fileID] = append(fileTagsMap[fileID], tag)
					break
				}
			}
		}
	}

	// tag id to file id
	resultTags := make(map[uint][]uint, 0)
	resultImages := make(map[uint][]image.ImageFile, 0)
	imageFileErrors := make([]error, 0)
	fileAdded := make(map[uint]struct{})
	images := make(map[uint]image.ImageFile, 0)
	for _, imageFile := range imageFiles {
		if _, ok := fileAdded[imageFile.ID]; ok {
			continue
		}
		fileAdded[imageFile.ID] = struct{}{}

		images[imageFile.ID] = imageFile
		imageFileTags := fileTagsMap[imageFile.ID]
		for _, tag := range imageFileTags {
			if _, ok := resultImages[tag.ID]; ok {
				continue
			}

			resultImages[tag.ID] = make([]image.ImageFile, 0)
			// resultTags = append(resultTags, tag)
			resultTags[tag.ID] = make([]uint, 0)
		}
	OUTER:
		for _, tag := range imageFileTags {
			for _, resultFile := range resultImages[tag.ID] {
				if imageFile.ID == resultFile.ID {
					continue OUTER
				}
			}
			resultTags[tag.ID] = append(resultTags[tag.ID], imageFile.ID)
			resultImages[tag.ID] = append(resultImages[tag.ID], imageFile)
		}
	}
	if len(imageFileErrors) > 0 {
		return result, errors.Join(imageFileErrors...)
	}
	if len(resultTags) == 0 {
		resultTags = nil
	}

	return ImageFinder{
		Images:       images,
		TaggedImages: resultTags,
	}, nil
}
