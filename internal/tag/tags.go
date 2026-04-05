package tag

import (
	"github.com/michael-freling/anime-image-viewer/internal/db"
)

type Tag struct {
	ID   uint   `json:"id"`
	Name string `json:"name"`
}

func ConvertTagsToMap(tags []Tag) map[uint]Tag {
	result := make(map[uint]Tag)
	for _, tag := range tags {
		result[tag.ID] = tag
	}
	return result
}

func GetMaxTagID(tags []Tag) uint {
	maxID := uint(0)
	for _, tag := range tags {
		if tag.ID > maxID {
			maxID = tag.ID
		}
	}
	return maxID
}

type ImageTagChecker struct {
	imageFileID uint
	// tag id => bool (true if the image file has the tag)
	imageFileTags map[uint]db.FileTagAddedBy
}

func (checker ImageTagChecker) HasDirectTag() bool {
	return len(checker.imageFileTags) > 0
}

func (checker ImageTagChecker) GetDirectTags() []uint {
	tagIDs := make([]uint, 0)
	for tagID := range checker.imageFileTags {
		tagIDs = append(tagIDs, tagID)
	}
	return tagIDs
}

func (checker ImageTagChecker) HasAnyTag() bool {
	return len(checker.imageFileTags) > 0
}

func (checker ImageTagChecker) HasTag(tagID uint) bool {
	_, ok := checker.imageFileTags[tagID]
	return ok
}

func (checker ImageTagChecker) GetTagMap() map[uint]db.FileTagAddedBy {
	tagCounts := make(map[uint]db.FileTagAddedBy)
	for tagID, addedBy := range checker.imageFileTags {
		tagCounts[tagID] = addedBy
	}
	return tagCounts
}

type BatchImageTagChecker struct {
	imageTagCheckers []ImageTagChecker
}

func (checker BatchImageTagChecker) GetTagCheckerForImageFileID(imageFileID uint) ImageTagChecker {
	for _, imageTagChecker := range checker.imageTagCheckers {
		if imageTagChecker.imageFileID == imageFileID {
			return imageTagChecker
		}
	}
	return ImageTagChecker{}
}

type TagStatsForFiles struct {
	Count                  uint
	IsAddedBySelectedFiles bool
}

func (checker BatchImageTagChecker) GetStats() map[uint]TagStatsForFiles {
	result := make(map[uint]TagStatsForFiles, 0)
	for _, imageTagChecker := range checker.imageTagCheckers {
		for tagID := range imageTagChecker.GetTagMap() {
			if _, ok := result[tagID]; !ok {
				result[tagID] = TagStatsForFiles{}
			}

			newStat := result[tagID]
			newStat.Count = result[tagID].Count + 1
			if _, ok := imageTagChecker.imageFileTags[tagID]; ok {
				newStat.IsAddedBySelectedFiles = true
			}
			result[tagID] = newStat
		}
	}
	if len(result) == 0 {
		return nil
	}

	return result
}
