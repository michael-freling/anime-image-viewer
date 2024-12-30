package tag

import (
	"context"
	"fmt"

	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/michael-freling/anime-image-viewer/internal/image"
	"github.com/michael-freling/anime-image-viewer/internal/xslices"
	"golang.org/x/sync/errgroup"
)

type Reader struct {
	dbClient        *db.Client
	directoryReader *image.DirectoryReader
}

func NewReader(
	dbClient *db.Client,
	directoryReader *image.DirectoryReader,
) *Reader {
	return &Reader{
		dbClient:        dbClient,
		directoryReader: directoryReader,
	}
}

func (reader Reader) ReadAllTagTree() (Tree, error) {
	allTags, err := db.GetAll[db.Tag](reader.dbClient)
	if err != nil {
		return Tree{}, fmt.Errorf("db.GetAll: %w", err)
	}
	if len(allTags) == 0 {
		return Tree{}, nil
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

	root := buildTagTree(tagMap, childMap, 0, nil)
	return newTree(*root), nil
}

// depercated. Use ReadAllTagTree
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

func (reader Reader) ReadDBTagRecursively(tagID uint) (db.FileTagList, error) {
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
		allTagMap = ConvertTagsToMap(allTags)
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

		hasImageFileTag := make(map[uint]db.FileTagAddedBy, 0)
		for _, fileTag := range fileTags {
			if fileID != fileTag.FileID {
				continue
			}
			hasImageFileTag[fileTag.TagID] = fileTag.AddedBy
		}
		imageTagChecker.imageFileTags = hasImageFileTag

		tagsForAncestors := make(map[uint][]db.FileTagAddedBy, 0)
		for _, fileTag := range fileTags {
			for _, ancestor := range ancestors {
				if ancestor.ID != fileTag.FileID {
					continue
				}
				tagID := fileTag.TagID
				tagsForAncestors[tagID] = append(tagsForAncestors[tagID], fileTag.AddedBy)
			}
		}
		imageTagChecker.ancestorsTags = tagsForAncestors
		imageTagCheckers = append(imageTagCheckers, imageTagChecker)
	}

	return BatchImageTagChecker{
		imageTagCheckers: imageTagCheckers,
	}, nil
}
