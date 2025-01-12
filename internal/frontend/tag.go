package frontend

import (
	"context"
	"fmt"

	"github.com/michael-freling/anime-image-viewer/internal/image"
	"github.com/michael-freling/anime-image-viewer/internal/tag"
)

type Tag struct {
	ID       uint   `json:"id"`
	Name     string `json:"name"`
	FullName string `json:"fullName"`
	ParentID uint   `json:"parentId"`
	Children []Tag  `json:"children"`
}

type tagConverter struct {
}

func newTagConverter() tagConverter {
	return tagConverter{}
}

func (converter tagConverter) convert(t tag.Tag) Tag {
	children := make([]Tag, len(t.Children))
	for i, child := range t.Children {
		children[i] = converter.convert(*child)
	}
	if len(children) == 0 {
		children = nil
	}

	return Tag{
		ID:       t.ID,
		Name:     t.Name,
		FullName: t.FullName,
		ParentID: t.ParentID,
		Children: children,
	}
}

type batchTagConverter struct {
	tagTree   []tag.Tag
	converter tagConverter
}

func newBatchTagConverterFromTagTree(tree []tag.Tag) batchTagConverter {
	return batchTagConverter{
		tagTree:   tree,
		converter: newTagConverter(),
	}
}

func (batchConverter batchTagConverter) convert() []Tag {
	result := make([]Tag, 0)
	for _, tag := range batchConverter.tagTree {
		result = append(result, batchConverter.converter.convert(tag))
	}
	return result
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

func (service TagService) GetAll() ([]Tag, error) {
	result, err := service.reader.ReadAllTags()
	if err != nil {
		return nil, fmt.Errorf("ReadAllTags: %w", err)
	}
	if len(result) == 0 {
		return nil, nil
	}

	return newBatchTagConverterFromTagTree(result).convert(), nil
}

type ReadTagsByFileIDsResponse struct {
	// AncestorMap maps tag IDs to their ancestors
	AncestorMap map[uint][]image.File

	// TagCounts maps tag IDs to the number of files that have the tag
	TagCounts map[uint]uint
}

func (service TagService) ReadTagsByFileIDs(
	ctx context.Context,
	fileIDs []uint,
) (ReadTagsByFileIDsResponse, error) {
	batchImageTagChecker, err := service.reader.CreateBatchTagCheckerByFileIDs(ctx, fileIDs)
	if err != nil {
		return ReadTagsByFileIDsResponse{}, fmt.Errorf("service.createBatchTagCheckerByFileIDs: %w", err)
	}
	response := ReadTagsByFileIDsResponse{
		AncestorMap: batchImageTagChecker.GetTagsMapFromAncestors(),
		TagCounts:   batchImageTagChecker.GetTagCounts(),
	}
	return response, nil
}
