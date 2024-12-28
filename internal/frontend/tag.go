package frontend

import (
	"fmt"

	"github.com/michael-freling/anime-image-viewer/internal/tag"
)

type Tag struct {
	ID       uint   `json:"id"`
	Name     string `json:"name"`
	FullName string `json:"fullName"`
	ParentID uint   `json:"parentId"`
}

type batchTagConverter struct {
	tagTree []tag.Tag
}

func newBatchTagConverterFromTagTree(tree []tag.Tag) batchTagConverter {
	return batchTagConverter{
		tagTree: tree,
	}
}

func (converter batchTagConverter) convertToFlattenMap() map[uint]Tag {
	result := make(map[uint]Tag)
	for _, tag := range tag.ConvertTagsToMap(converter.tagTree) {
		result[tag.ID] = Tag{
			ID:       tag.ID,
			Name:     tag.Name,
			FullName: tag.FullName,
			ParentID: tag.ParentID,
		}
	}
	return result
}

type TagService struct {
	reader *tag.Reader
}

func NewTagService(reader *tag.Reader) *TagService {
	return &TagService{
		reader: reader,
	}
}

func (service TagService) ReadAllMap() (map[uint]Tag, error) {
	tags, err := service.reader.ReadAllTags()
	if err != nil {
		return nil, fmt.Errorf("ReadAllTags: %w", err)
	}
	return newBatchTagConverterFromTagTree(tags).convertToFlattenMap(), nil
}
