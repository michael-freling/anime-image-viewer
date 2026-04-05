package image

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestDirectory_UpdateName(t *testing.T) {
	t.Run("update name of root-level directory", func(t *testing.T) {
		dir := &Directory{
			ID:           1,
			Name:         "oldName",
			Path:         "/root/oldName",
			RelativePath: "oldName",
			ParentID:     0,
		}

		result := dir.UpdateName("newName")

		assert.Equal(t, "newName", result.Name)
		assert.Equal(t, "/root/newName", result.Path)
		assert.Equal(t, "newName", result.RelativePath)
		// Verify it modifies the same pointer
		assert.Same(t, dir, result)
	})

	t.Run("update name of sub directory", func(t *testing.T) {
		dir := &Directory{
			ID:           2,
			Name:         "oldSub",
			Path:         "/root/parent/oldSub",
			RelativePath: "parent/oldSub",
			ParentID:     1,
		}

		result := dir.UpdateName("newSub")

		assert.Equal(t, "newSub", result.Name)
		assert.Equal(t, "/root/parent/newSub", result.Path)
		assert.Equal(t, "parent/newSub", result.RelativePath)
	})

	t.Run("update name of deeply nested directory", func(t *testing.T) {
		dir := &Directory{
			ID:           3,
			Name:         "deep",
			Path:         "/root/a/b/deep",
			RelativePath: "a/b/deep",
			ParentID:     2,
		}

		result := dir.UpdateName("renamed")

		assert.Equal(t, "renamed", result.Name)
		assert.Equal(t, "/root/a/b/renamed", result.Path)
		assert.Equal(t, "a/b/renamed", result.RelativePath)
	})
}

func TestDirectory_ToFlatIDMap(t *testing.T) {
	t.Run("leaf directory with no children", func(t *testing.T) {
		dir := Directory{
			ID: 1,
		}

		result := dir.ToFlatIDMap()

		assert.Equal(t, map[uint][]uint{
			1: {1},
		}, result)
	})

	t.Run("directory with child directories", func(t *testing.T) {
		dir := Directory{
			ID: 1,
			Children: []*Directory{
				{
					ID: 2,
				},
				{
					ID: 3,
				},
			},
		}

		result := dir.ToFlatIDMap()

		assert.Contains(t, result, uint(1))
		assert.Contains(t, result, uint(2))
		assert.Contains(t, result, uint(3))
		assert.ElementsMatch(t, []uint{2, 3, 1}, result[1])
		assert.Equal(t, []uint{uint(2)}, result[2])
		assert.Equal(t, []uint{uint(3)}, result[3])
	})

	t.Run("directory with child image files", func(t *testing.T) {
		dir := Directory{
			ID: 1,
			ChildImageFiles: []*ImageFile{
				{ID: 10},
				{ID: 11},
			},
		}

		result := dir.ToFlatIDMap()

		assert.Equal(t, map[uint][]uint{
			1: {10, 11, 1},
		}, result)
	})

	t.Run("nested tree with both directories and images", func(t *testing.T) {
		dir := Directory{
			ID: 1,
			Children: []*Directory{
				{
					ID: 2,
					ChildImageFiles: []*ImageFile{
						{ID: 20},
					},
					Children: []*Directory{
						{
							ID: 3,
							ChildImageFiles: []*ImageFile{
								{ID: 30},
							},
						},
					},
				},
			},
			ChildImageFiles: []*ImageFile{
				{ID: 10},
			},
		}

		result := dir.ToFlatIDMap()

		assert.Contains(t, result, uint(1))
		assert.Contains(t, result, uint(2))
		assert.Contains(t, result, uint(3))
		assert.Equal(t, []uint{uint(30), uint(3)}, result[3])
		// Directory 2 collects childIDs from child 3's flat map: [30, 3], then appends image 20 and self 2
		assert.Equal(t, []uint{uint(30), uint(3), uint(20), uint(2)}, result[2])
		// Directory 1 collects all childIDs from child 2's map entries (order depends on map iteration),
		// then appends image 10 and self 1. The last two elements are always [10, 1].
		dir1IDs := result[1]
		assert.Len(t, dir1IDs, 8)
		// Last two are always image 10 and self 1
		assert.Equal(t, []uint{uint(10), uint(1)}, dir1IDs[len(dir1IDs)-2:])
		// First 6 are from child map entries (order may vary), but contain these values
		assert.ElementsMatch(t, []uint{30, 3, 30, 3, 20, 2}, dir1IDs[:6])
	})
}

func TestDirectory_GetDescendants(t *testing.T) {
	t.Run("no children", func(t *testing.T) {
		dir := Directory{
			ID:   1,
			Name: "root",
		}

		result := dir.GetDescendants()

		assert.Empty(t, result)
	})

	t.Run("single level children", func(t *testing.T) {
		dir := Directory{
			ID:   1,
			Name: "root",
			Children: []*Directory{
				{ID: 2, Name: "child1"},
				{ID: 3, Name: "child2"},
			},
		}

		result := dir.GetDescendants()

		assert.Len(t, result, 2)
		assert.Equal(t, uint(2), result[0].ID)
		assert.Equal(t, uint(3), result[1].ID)
	})

	t.Run("nested children", func(t *testing.T) {
		dir := Directory{
			ID:   1,
			Name: "root",
			Children: []*Directory{
				{
					ID:   2,
					Name: "child1",
					Children: []*Directory{
						{ID: 4, Name: "grandchild1"},
						{ID: 5, Name: "grandchild2"},
					},
				},
				{ID: 3, Name: "child2"},
			},
		}

		result := dir.GetDescendants()

		assert.Len(t, result, 4)
		ids := make([]uint, len(result))
		for i, d := range result {
			ids[i] = d.ID
		}
		assert.Equal(t, []uint{2, 4, 5, 3}, ids)
	})
}

func TestDirectory_findAncestors(t *testing.T) {
	t.Run("file not found", func(t *testing.T) {
		dir := Directory{
			ID:   1,
			Name: "root",
		}

		result := dir.findAncestors(999)

		assert.Nil(t, result)
	})

	t.Run("direct child directory", func(t *testing.T) {
		dir := Directory{
			ID:   1,
			Name: "root",
			Children: []*Directory{
				{ID: 2, Name: "child"},
			},
		}

		result := dir.findAncestors(2)

		assert.Len(t, result, 1)
		assert.Equal(t, uint(1), result[0].ID)
	})

	t.Run("direct child image file", func(t *testing.T) {
		dir := Directory{
			ID:   1,
			Name: "root",
			ChildImageFiles: []*ImageFile{
				{ID: 10, Name: "image.jpg"},
			},
		}

		result := dir.findAncestors(10)

		assert.Len(t, result, 1)
		assert.Equal(t, uint(1), result[0].ID)
	})

	t.Run("deeply nested child", func(t *testing.T) {
		dir := Directory{
			ID:   1,
			Name: "root",
			Children: []*Directory{
				{
					ID:   2,
					Name: "child",
					Children: []*Directory{
						{ID: 3, Name: "grandchild"},
					},
				},
			},
		}

		result := dir.findAncestors(3)

		assert.Len(t, result, 2)
		assert.Equal(t, uint(1), result[0].ID)
		assert.Equal(t, uint(2), result[1].ID)
	})
}

func TestDirectory_FindChildByID(t *testing.T) {
	t.Run("not found returns empty", func(t *testing.T) {
		dir := Directory{ID: 1}

		result := dir.FindChildByID(999)

		assert.Zero(t, result.ID)
	})

	t.Run("direct child found", func(t *testing.T) {
		dir := Directory{
			ID: 1,
			Children: []*Directory{
				{ID: 2, Name: "child"},
			},
		}

		result := dir.FindChildByID(2)

		assert.Equal(t, uint(2), result.ID)
		assert.Equal(t, "child", result.Name)
	})

	t.Run("nested child found", func(t *testing.T) {
		dir := Directory{
			ID: 1,
			Children: []*Directory{
				{
					ID: 2,
					Children: []*Directory{
						{ID: 3, Name: "grandchild"},
					},
				},
			},
		}

		result := dir.FindChildByID(3)

		assert.Equal(t, uint(3), result.ID)
		assert.Equal(t, "grandchild", result.Name)
	})
}
