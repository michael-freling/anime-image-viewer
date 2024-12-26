package tag

import (
	"context"
	"errors"
	"fmt"
	"sort"

	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/michael-freling/anime-image-viewer/internal/image"
	"github.com/michael-freling/anime-image-viewer/internal/xslices"
	"golang.org/x/sync/errgroup"
)

type Reader struct {
	dbClient           *db.Client
	directoryReader    *image.DirectoryReader
	imageFileConverter *image.ImageFileConverter
}

func NewReader(
	dbClient *db.Client,
	directoryReader *image.DirectoryReader,
	imageFileConverter *image.ImageFileConverter,
) *Reader {
	return &Reader{
		dbClient:           dbClient,
		directoryReader:    directoryReader,
		imageFileConverter: imageFileConverter,
	}
}

func (reader Reader) ReadAllTags() ([]Tag, error) {
	allTags, err := db.GetAll[db.Tag](reader.dbClient)
	if err != nil {
		return nil, fmt.Errorf("ormClient.GetAll: %w", err)
	}
	if len(allTags) == 0 {
		return nil, nil
	}

	childMap := make(map[uint][]Tag)
	for _, t := range allTags {
		if _, ok := childMap[t.ParentID]; ok {
			continue
		}
		childMap[t.ParentID] = make([]Tag, 0)
	}
	tagMap := make(map[uint]Tag)
	for _, t := range allTags {
		tagMap[t.ID] = Tag{
			ID:      t.ID,
			Name:    t.Name,
			tagType: t.Type,
		}

		childMap[t.ParentID] = append(childMap[t.ParentID], tagMap[t.ID])
	}

	return xslices.Map(buildTagTree(tagMap, childMap, 0, nil).Children, func(t *Tag) Tag {
		return *t
	}), nil
}

func (reader Reader) readImageFiles(tagID uint) (ReadImageFilesResponse, error) {
	fileTags, err := reader.readDBTagRecursively(tagID)
	if err != nil {
		return ReadImageFilesResponse{}, fmt.Errorf("reader.readDBTagRecursively: %w", err)
	}
	if len(fileTags) == 0 {
		return ReadImageFilesResponse{}, nil
	}
	fileIDs := fileTags.ToFileIDs()

	// find ancestors of directories
	directories, err := reader.directoryReader.ReadDirectories(fileIDs)
	if err != nil && !errors.Is(err, image.ErrDirectoryNotFound) {
		return ReadImageFilesResponse{}, fmt.Errorf("directoryReader.ReadDirectories: %w", err)
	}
	dbParentIDs := make([]uint, len(directories))
	for _, directory := range directories {
		descendants := directory.GetDescendants()
		for _, descendant := range descendants {
			dbParentIDs = append(dbParentIDs, descendant.ID)
		}
		dbParentIDs = append(dbParentIDs, directory.ID)
	}
	imageFilesUnderDirectories, err := reader.dbClient.File().
		FindImageFilesByParentIDs(dbParentIDs)
	if err != nil && !errors.Is(err, db.ErrRecordNotFound) {
		return ReadImageFilesResponse{}, fmt.Errorf("db.FindImageFilesByParentIDs: %w", err)
	}

	// find files
	dbImageFiles, err := reader.dbClient.File().
		FindImageFilesByIDs(fileIDs)
	if err != nil && !errors.Is(err, db.ErrRecordNotFound) {
		return ReadImageFilesResponse{}, fmt.Errorf("db.FindImageFilesByIDs: %w", err)
	}
	for _, dbImageFile := range dbImageFiles {
		dbParentIDs = append(dbParentIDs, dbImageFile.ParentID)
	}
	parentDirectories, err := reader.directoryReader.ReadDirectories(dbParentIDs)
	if err != nil && !errors.Is(err, image.ErrDirectoryNotFound) {
		return ReadImageFilesResponse{}, fmt.Errorf("directoryReader.ReadDirectories: %w", err)
	}

	// to find a tag and
	allTags, err := reader.ReadAllTags()
	if err != nil {
		return ReadImageFilesResponse{}, fmt.Errorf("reader.ReadAllTags: %w", err)
	}

	directoryDescendants := make(map[uint][]uint)
	for _, directory := range directories {
		for id, fileIDs := range directory.ToFlatIDMap() {
			directoryDescendants[id] = append(directoryDescendants[id], fileIDs...)
		}
	}

	fileTagsMap := make(map[uint][]Tag, 0)
	for tagID, fileTagMap := range fileTags.ToTagMap() {
		tags := make([]Tag, 0)
		for _, t := range allTags {
			tag := t.findChildByID(tagID)
			if tag.ID == tagID {
				tags = append(tags, tag)
				break
			}
		}

		for fileID := range fileTagMap {
			descendants := directoryDescendants[fileID]
			for _, descendantFileID := range descendants {
				fileTagsMap[descendantFileID] = append(fileTagsMap[descendantFileID], tags...)
			}

			for _, imageFile := range dbImageFiles {
				if imageFile.ID == fileID {
					fileTagsMap[fileID] = append(fileTagsMap[fileID], tags...)
					break
				}
			}
		}
	}

	resultTags := make([]Tag, 0)
	result := make(map[uint][]image.ImageFile, 0)
	imageFileErrors := make([]error, 0)
	fileAdded := make(map[uint]struct{})
	for _, dbfs := range [][]db.File{imageFilesUnderDirectories, dbImageFiles} {
		for _, dbImageFile := range dbfs {
			if _, ok := fileAdded[dbImageFile.ID]; ok {
				continue
			}
			fileAdded[dbImageFile.ID] = struct{}{}

			parentDirectory := parentDirectories[dbImageFile.ParentID]
			if parentDirectory.ID == 0 {
				imageFileErrors = append(imageFileErrors, fmt.Errorf("%w: %d for an image %d", image.ErrDirectoryNotFound, dbImageFile.ParentID, dbImageFile.ID))
				continue
			}
			imageFile, err := reader.imageFileConverter.ConvertImageFile(parentDirectory, dbImageFile)
			if err != nil {
				imageFileErrors = append(imageFileErrors, fmt.Errorf("imageFileConverter.ConvertImageFile: %w", err))
				continue
			}

			imageFileTags := fileTagsMap[imageFile.ID]
			for _, tag := range imageFileTags {
				if _, ok := result[tag.ID]; ok {
					continue
				}
				result[tag.ID] = make([]image.ImageFile, 0)
				resultTags = append(resultTags, tag)
			}
		OUTER:
			for _, tag := range imageFileTags {
				for _, resultFile := range result[tag.ID] {
					if imageFile.ID == resultFile.ID {
						continue OUTER
					}
				}
				result[tag.ID] = append(result[tag.ID], imageFile)
			}
		}
	}
	if len(imageFileErrors) > 0 {
		return ReadImageFilesResponse{}, errors.Join(imageFileErrors...)
	}

	sort.Slice(resultTags, func(i, j int) bool {
		return resultTags[i].Name < resultTags[j].Name
	})
	return ReadImageFilesResponse{
		Tags:       resultTags,
		ImageFiles: result,
	}, nil
}

func (reader Reader) readDBTagRecursively(tagID uint) (db.FileTagList, error) {
	allTags, err := reader.ReadAllTags()
	if err != nil {
		return nil, fmt.Errorf("reader.ReadAllTags: %w", err)
	}
	if len(allTags) == 0 {
		return nil, nil
	}

	// find child tag
	searchTagIDs := make([]uint, 0)
	for _, tagTree := range allTags {
		tag := tagTree.findChildByID(tagID)
		if tag.ID == 0 {
			continue
		}
		searchTagIDs = append(searchTagIDs, tag.ID)

		descendantTags := tag.findDescendants()
		for _, descendantTag := range descendantTags {
			searchTagIDs = append(searchTagIDs, descendantTag.ID)
		}
	}

	fileTags, err := reader.dbClient.FileTag().
		FindAllByTagIDs(searchTagIDs)
	if err != nil {
		return nil, fmt.Errorf("db.FindAllByTagIDs: %w", err)
	}
	return fileTags, nil
}

func (reader Reader) CreateBatchTagCheckerByFileIDs(
	ctx context.Context,
	fileIDs []uint,
) (BatchImageTagChecker, error) {
	allTagMap := make(map[uint]Tag, 0)

	eg, _ := errgroup.WithContext(ctx)
	eg.Go(func() error {
		allTags, err := reader.ReadAllTags()
		if err != nil {
			return fmt.Errorf("reader.ReadAllTags: %w", err)
		}
		allTagMap = convertTagsToMap(allTags)
		return nil
	})

	var fileTags []db.FileTag
	var fileIDToAncestors map[uint][]image.Directory
	eg.Go(func() error {
		var err error
		fileIDToAncestors, err = reader.directoryReader.ReadAncestors(fileIDs)
		if err != nil {
			return fmt.Errorf("directoryReader.ReadAncestors: %w", err)
		}
		allFileIDs := make([]uint, 0)
		for _, fileID := range fileIDs {
			ancestors, ok := fileIDToAncestors[fileID]
			if ok {
				for _, ancestor := range ancestors {
					allFileIDs = append(allFileIDs, ancestor.ID)
				}
			}
			allFileIDs = append(allFileIDs, fileID)
		}

		fileTags, err = reader.dbClient.FileTag().
			FindAllByFileID(allFileIDs)
		if err != nil {
			return fmt.Errorf("db.FindAllByValue: %w", err)
		}
		return nil
	})
	if err := eg.Wait(); err != nil {
		return BatchImageTagChecker{}, fmt.Errorf("eg.Wait: %w", err)
	}
	if len(fileTags) == 0 {
		return BatchImageTagChecker{}, nil
	}

	imageTagCheckers := make([]ImageTagChecker, 0)
	for _, fileID := range fileIDs {
		ancestors := fileIDToAncestors[fileID]

		ancestorMap := make(map[uint]image.Directory)
		for _, ancestor := range ancestors {
			ancestorMap[ancestor.ID] = ancestor
		}
		imageTagChecker := ImageTagChecker{
			imageFileID: fileID,
			ancestors:   ancestorMap,
			allTags:     allTagMap,
		}

		hasImageFileTag := make(map[uint]bool, 0)
		for _, fileTag := range fileTags {
			if fileID != fileTag.FileID {
				continue
			}
			hasImageFileTag[fileTag.TagID] = true
		}
		imageTagChecker.imageFileTags = hasImageFileTag

		tagsForAncestors := make(map[uint][]uint, 0)
		for _, fileTag := range fileTags {
			for _, ancestor := range ancestors {
				if ancestor.ID != fileTag.FileID {
					continue
				}
				tagID := fileTag.TagID
				tagsForAncestors[tagID] = append(tagsForAncestors[tagID], ancestor.ID)
			}
		}
		imageTagChecker.ancestorsTags = tagsForAncestors
		imageTagCheckers = append(imageTagCheckers, imageTagChecker)
	}

	return BatchImageTagChecker{
		imageTagCheckers: imageTagCheckers,
	}, nil
}
