package image

import (
	"context"
	"fmt"
	"sort"

	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/wailsapp/wails/v3/pkg/application"
)

type TagService struct {
	ctx      context.Context
	dbClient *db.Client
}

func NewTagService(dbClient *db.Client) *TagService {
	return &TagService{
		dbClient: dbClient,
	}
}

func (service *TagService) OnStartup(ctx context.Context, options application.ServiceOptions) error {
	service.ctx = ctx
	return nil
}

func (service *TagService) Create(tag string, parentID uint) error {
	err := db.NewTransaction(service.dbClient, func(ormClient *db.ORMClient[db.Tag]) error {
		_, err := ormClient.FindByValue(&db.Tag{
			ID: parentID,
		})
		if err != nil {
			return fmt.Errorf("ormClient.FindByValue: %w", err)
		}

		tag := db.Tag{
			Name:     tag,
			ParentID: parentID,
		}
		if err := ormClient.Create(&tag); err != nil {
			return fmt.Errorf("ormClient.Create: %w", err)
		}
		return nil
	})
	if err != nil {
		return err
	}

	return nil
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
