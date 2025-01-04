package tag

import (
	"fmt"
	"slices"
	"sort"

	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/michael-freling/anime-image-viewer/internal/image"
	"github.com/michael-freling/anime-image-viewer/internal/xslices"
)

type Tag struct {
	ID       uint   `json:"id"`
	Name     string `json:"name"`
	FullName string `json:"full_name,omitempty"`
	ParentID uint   `json:"parentId,omitempty"`
	parent   *Tag   `json:"-"`
	tagType  db.TagType
	Children []*Tag `json:"children,omitempty"`
}

func (tag Tag) fullName() string {
	if tag.parent == nil {
		return tag.Name
	}
	return fmt.Sprintf("%s > %s", tag.parent.fullName(), tag.Name)
}

func (tag *Tag) AddChild(child *Tag) {
	tag.Children = append(tag.Children, child)
}

func (tag Tag) findChildByID(ID uint) Tag {
	if tag.ID == ID {
		return tag
	}
	for i := range tag.Children {
		if child := tag.Children[i].findChildByID(ID); child.ID != 0 {
			return child
		}
	}
	return Tag{}
}

func (tag Tag) findDescendants() []Tag {
	descendants := make([]Tag, 0)
	for i := range tag.Children {
		descendants = append(descendants, *tag.Children[i])
		descendants = append(descendants, tag.Children[i].findDescendants()...)
	}
	return descendants
}

func (tag Tag) convertToFlattenMap() map[uint]Tag {
	result := make(map[uint]Tag)
	result[tag.ID] = tag
	for _, child := range tag.Children {
		for id, t := range child.convertToFlattenMap() {
			result[id] = t
		}
	}
	return result
}

func (node Tag) FindChildByName(name string) *Tag {
	for _, tag := range node.Children {
		if tag.Name == name {
			return tag
		}
	}
	return nil
}

func (node Tag) ConvertToFlattenMap() map[uint]Tag {
	result := make(map[uint]Tag)
	for _, tag := range node.Children {
		// root is not a correct tag. Will be ignored
		for id, t := range tag.convertToFlattenMap() {
			result[id] = t
		}
	}
	return result
}

func ConvertTagsToMap(tags []Tag) map[uint]Tag {
	result := make(map[uint]Tag)
	for _, tag := range tags {
		result[tag.ID] = tag
		children := ConvertTagsToMap(xslices.Map(tag.Children, func(t *Tag) Tag {
			return *t
		}))
		for id, child := range children {
			result[id] = child
		}
		tag.Children = nil
	}
	return result
}

func GetMaxTagID(tags []Tag) uint {
	maxID := uint(0)
	for _, tag := range tags {
		if tag.ID > maxID {
			maxID = tag.ID
		}

		children := tag.findDescendants()
		if len(children) == 0 {
			continue
		}
		childMaxID := slices.Max(xslices.Map(children, func(tag Tag) uint {
			return tag.ID
		}))
		if childMaxID > maxID {
			maxID = childMaxID
		}
	}
	return maxID
}

func buildTagTree(tagMap map[uint]Tag, childMap map[uint][]Tag, parentID uint, parent *Tag) *Tag {
	t := tagMap[parentID]
	if parent != nil && parent.ID != 0 {
		t.ParentID = parent.ID
		t.parent = parent
	}
	t.FullName = t.fullName()

	if _, ok := childMap[parentID]; !ok {
		return &t
	}

	t.Children = make([]*Tag, len(childMap[parentID]))
	for i, child := range childMap[parentID] {
		t.Children[i] = buildTagTree(tagMap, childMap, child.ID, &t)
	}
	sort.Slice(t.Children, func(i, j int) bool {
		return t.Children[i].Name < t.Children[j].Name
	})
	return &t
}

type ImageTagChecker struct {
	imageFileID uint

	// tag id => bool (true if the image file has the tag)
	imageFileTags map[uint]db.FileTagAddedBy

	// directory id => an ancestor
	ancestors map[uint]image.Directory

	// tag id => an ids of ancestors
	ancestorsTags map[uint][]db.FileTagAddedBy

	allTags map[uint]Tag
}

func (checker ImageTagChecker) hasDecendantTag(tagID uint) bool {
	tag, ok := checker.allTags[tagID]
	if !ok {
		return false
	}
	for _, descendant := range tag.findDescendants() {
		if _, ok := checker.imageFileTags[descendant.ID]; ok {
			return true
		}
		if _, ok := checker.ancestorsTags[descendant.ID]; ok {
			return true
		}
	}
	return false
}

func (checker ImageTagChecker) hasTag(tagID uint) bool {
	if _, ok := checker.imageFileTags[tagID]; ok {
		return true
	}
	if _, ok := checker.ancestorsTags[tagID]; ok {
		return true
	}
	return false
}

func (checker ImageTagChecker) GetTagMap() map[uint]db.FileTagAddedBy {
	tagCounts := make(map[uint]db.FileTagAddedBy)
	for tagID, addedBy := range checker.imageFileTags {
		tagCounts[tagID] = addedBy
	}
	for tagID, addedBys := range checker.ancestorsTags {
		var resultAddedBy db.FileTagAddedBy
		for _, addedBy := range addedBys {
			if addedBy == db.FileTagAddedByUser {
				addedBy = db.FileTagAddedByUser
				break
			}
			resultAddedBy = addedBy
		}
		tagCounts[tagID] = resultAddedBy
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

func (checker BatchImageTagChecker) getTagsMapFromAncestors() map[uint][]image.File {
	ancestorMap := make(map[uint][]image.File)
	for _, imageTagChecker := range checker.imageTagCheckers {
		for tagID := range imageTagChecker.ancestorsTags {
			ancestorMap[tagID] = append(ancestorMap[tagID], image.File{
				ID: imageTagChecker.imageFileID,
			})
		}
	}
	if len(ancestorMap) == 0 {
		return nil
	}

	return ancestorMap
}

func (checker BatchImageTagChecker) getTagCounts() map[uint]uint {
	tagCounts := make(map[uint]uint)
	for _, imageTagChecker := range checker.imageTagCheckers {
		for tagID := range imageTagChecker.GetTagMap() {
			tagCounts[tagID]++
		}
	}
	if len(tagCounts) == 0 {
		return nil
	}

	return tagCounts
}
