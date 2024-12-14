package image

import (
	"context"
	"fmt"
	"sort"

	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/wailsapp/wails/v3/pkg/application"
)

type TagService struct {
	ctx              context.Context
	dbClient         *db.Client
	directoryService *DirectoryService
}

func NewTagService(dbClient *db.Client, directoryService *DirectoryService) *TagService {
	return &TagService{
		dbClient:         dbClient,
		directoryService: directoryService,
	}
}

func (service *TagService) OnStartup(ctx context.Context, options application.ServiceOptions) error {
	service.ctx = ctx
	return nil
}

func (service *TagService) CreateTopTag(name string) (Tag, error) {
	tag := db.Tag{
		Name: name,
	}
	err := db.Create(service.dbClient, &tag)
	if err != nil {
		return Tag{}, fmt.Errorf("db.Create: %w", err)
	}

	return Tag{
		ID:   tag.ID,
		Name: tag.Name,
	}, nil
}

type TagInput struct {
	Name     string
	ParentID uint
}

func (service *TagService) Create(input TagInput) (Tag, error) {
	tag := db.Tag{
		Name:     input.Name,
		ParentID: input.ParentID,
	}
	err := db.NewTransaction(service.dbClient, func(ormClient *db.ORMClient[db.Tag]) error {
		_, err := ormClient.FindByValue(&db.Tag{
			ID: input.ParentID,
		})
		if err != nil {
			return fmt.Errorf("ormClient.FindByValue: %w", err)
		}

		if err := ormClient.Create(&tag); err != nil {
			return fmt.Errorf("ormClient.Create: %w", err)
		}
		return nil
	})
	if err != nil {
		return Tag{}, err
	}

	return Tag{
		ID:   tag.ID,
		Name: tag.Name,
	}, nil
}

func (service *TagService) UpdateName(id uint, name string) (Tag, error) {
	var newTag db.Tag
	err := db.NewTransaction(service.dbClient, func(ormClient *db.ORMClient[db.Tag]) error {
		var err error
		newTag, err = ormClient.FindByValue(&db.Tag{
			ID: id,
		})
		if err != nil {
			return fmt.Errorf("ormClient.FindByValue: %w", err)
		}

		newTag.Name = name
		if err := ormClient.Update(&newTag); err != nil {
			return fmt.Errorf("ormClient.Update: %w", err)
		}
		return nil
	})
	if err != nil {
		return Tag{}, err
	}

	return Tag{
		ID:   newTag.ID,
		Name: newTag.Name,
	}, nil
}

type Tag struct {
	ID       uint
	Name     string
	Children []Tag
}

func (service *TagService) GetAll() ([]Tag, error) {
	allTags, err := db.GetAll[db.Tag](service.dbClient)
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
			ID:   t.ID,
			Name: t.Name,
		}

		childMap[t.ParentID] = append(childMap[t.ParentID], tagMap[t.ID])
	}

	return buildTagTree(tagMap, childMap, 0).Children, nil
}

func buildTagTree(tagMap map[uint]Tag, childMap map[uint][]Tag, parentID uint) Tag {
	t := tagMap[parentID]
	if _, ok := childMap[parentID]; !ok {
		return t
	}

	t.Children = make([]Tag, len(childMap[parentID]))
	for i, child := range childMap[parentID] {
		t.Children[i] = buildTagTree(tagMap, childMap, child.ID)
	}
	sort.Slice(t.Children, func(i, j int) bool {
		return t.Children[i].Name < t.Children[j].Name
	})
	return t
}

type File struct {
	ID       uint
	Name     string
	ParentID uint
}

type ReadTagsByFileIDsResponse struct {
	// FilesMap maps tag IDs to the files that have the tag
	FilesMap map[uint][]File

	// TagCounts maps tag IDs to the number of files that have the tag
	TagCounts map[uint]uint
}

func (service *TagService) ReadTagsByFileIDs(fileIDs []uint) (ReadTagsByFileIDsResponse, error) {
	fileIDToAncestors, err := service.directoryService.readAncestors(fileIDs)
	if err != nil {
		return ReadTagsByFileIDsResponse{}, fmt.Errorf("directoryService.readAncestors: %w", err)
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

	fileTags, err := db.NewFileTagClient(service.dbClient).
		FindAllByFileID(allFileIDs)
	if err != nil {
		return ReadTagsByFileIDsResponse{}, fmt.Errorf("db.FindAllByValue: %w", err)
	}
	if len(fileTags) == 0 {
		return ReadTagsByFileIDsResponse{}, nil
	}

	tagsPerFiles := make(map[uint][]File)
	for _, fileTag := range fileTags {
		for _, fileID := range fileIDs {
			if fileID == fileTag.FileID {
				tagsPerFiles[fileTag.TagID] = append(tagsPerFiles[fileTag.TagID], File{
					ID: fileID,
				})
				continue
			}

			// if a tag is applied to an ancestor, apply it to the file
			ancestors := fileIDToAncestors[fileID]
			for _, ancestor := range ancestors {
				if ancestor.ID == fileTag.FileID {
					tagsPerFiles[fileTag.TagID] = append(tagsPerFiles[fileTag.TagID], File{
						ID: fileID,
					})
					break
				}
			}
		}
	}
	response := ReadTagsByFileIDsResponse{
		FilesMap:  tagsPerFiles,
		TagCounts: make(map[uint]uint),
	}
	for tagID, files := range tagsPerFiles {
		response.TagCounts[tagID] = uint(len(files))
	}
	return response, nil
}

func (service *TagService) BatchUpdateTagsForFiles(fileIDs []uint, addedTagIDs []uint, deletedTagIDs []uint) error {
	fileTagClient := service.dbClient.FileTagClient()
	fileTags, err := fileTagClient.FindAllByFileID(fileIDs)
	if err != nil {
		return fmt.Errorf("fileTagClient.FindAllByFileID: %w", err)
	}

	createdFileTags := make([]db.FileTag, 0)
	for _, tagID := range addedTagIDs {
		filesForTag := fileTags.ToMap()[tagID]
		for _, fileID := range fileIDs {
			if _, ok := filesForTag[fileID]; ok {
				continue
			}

			createdFileTags = append(createdFileTags, db.FileTag{
				TagID:  tagID,
				FileID: fileID,
			})
		}
	}
	if len(deletedTagIDs) == 0 && len(createdFileTags) == 0 {
		return nil
	}

	err = fileTagClient.WithTransaction(func(ormClient *db.FileTagClient) error {
		if len(deletedTagIDs) > 0 {
			if err := ormClient.BatchDelete(deletedTagIDs, fileIDs); err != nil {
				return fmt.Errorf("ormClient.DeleteByFileIDs: %w", err)
			}
		}
		if len(createdFileTags) > 0 {
			if err := ormClient.BatchCreate(createdFileTags); err != nil {
				return fmt.Errorf("ormClient.BatchCreate: %w", err)
			}
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("db.NewTransaction: %w", err)
	}
	return nil
}
