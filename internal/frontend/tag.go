package frontend

import (
	"context"
	"fmt"

	"github.com/michael-freling/anime-image-viewer/internal/tag"
)

type Tag struct {
	ID   uint   `json:"id"`
	Name string `json:"name"`
}

type tagConverter struct {
}

func newTagConverter() tagConverter {
	return tagConverter{}
}

func (converter tagConverter) convert(t tag.Tag) Tag {
	return Tag{
		ID:   t.ID,
		Name: t.Name,
	}
}

type batchTagConverter struct {
	converter tagConverter
}

func newBatchTagConverter() batchTagConverter {
	return batchTagConverter{
		converter: newTagConverter(),
	}
}

func (batchConverter batchTagConverter) convert(tags []tag.Tag) []Tag {
	result := make([]Tag, 0)
	for _, t := range tags {
		result = append(result, batchConverter.converter.convert(t))
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
	result := make(map[uint]Tag)
	for _, t := range tags {
		result[t.ID] = Tag{
			ID:   t.ID,
			Name: t.Name,
		}
	}
	return result, nil
}

func (service TagService) GetAll() ([]Tag, error) {
	result, err := service.reader.ReadAllTags()
	if err != nil {
		return nil, fmt.Errorf("ReadAllTags: %w", err)
	}
	if len(result) == 0 {
		return nil, nil
	}
	return newBatchTagConverter().convert(result), nil
}

type TagStat struct {
	FileCount              uint `json:"fileCount"`
	IsAddedBySelectedFiles bool `json:"isAddedBySelectedFiles"`
}

type ReadTagsByFileIDsResponse struct {
	// TagStats maps tag IDs to their selectable tag
	TagStats map[uint]TagStat `json:"tagStats"`
}

func (service TagService) ReadTagsByFileIDs(
	ctx context.Context,
	fileIDs []uint,
) (ReadTagsByFileIDsResponse, error) {
	batchImageTagChecker, err := service.reader.CreateBatchTagCheckerByFileIDs(ctx, fileIDs)
	if err != nil {
		return ReadTagsByFileIDsResponse{}, fmt.Errorf("service.createBatchTagCheckerByFileIDs: %w", err)
	}

	tagStats := make(map[uint]TagStat, 0)
	for tagID, tagStat := range batchImageTagChecker.GetStats() {
		tagStats[tagID] = TagStat{
			FileCount:              tagStat.Count,
			IsAddedBySelectedFiles: tagStat.IsAddedBySelectedFiles,
		}
	}
	if len(tagStats) == 0 {
		tagStats = nil
	}

	response := ReadTagsByFileIDsResponse{
		TagStats: tagStats,
	}
	return response, nil
}
