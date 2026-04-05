package tag

import (
	"testing"

	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/stretchr/testify/assert"
)

func TestTag_AddChild(t *testing.T) {
	parent := &Tag{ID: 1, Name: "parent"}
	child1 := &Tag{ID: 2, Name: "child1"}
	child2 := &Tag{ID: 3, Name: "child2"}

	parent.AddChild(child1)
	assert.Len(t, parent.Children, 1)
	assert.Equal(t, child1, parent.Children[0])

	parent.AddChild(child2)
	assert.Len(t, parent.Children, 2)
	assert.Equal(t, child2, parent.Children[1])
}

func TestTag_findChildByID(t *testing.T) {
	grandchild := &Tag{ID: 100, Name: "grandchild"}
	child1 := &Tag{ID: 10, Name: "child1", Children: []*Tag{grandchild}}
	child2 := &Tag{ID: 20, Name: "child2"}
	root := Tag{ID: 1, Name: "root", Children: []*Tag{child1, child2}}

	testCases := []struct {
		name   string
		id     uint
		wantID uint
	}{
		{
			name:   "find root itself",
			id:     1,
			wantID: 1,
		},
		{
			name:   "find direct child",
			id:     10,
			wantID: 10,
		},
		{
			name:   "find second direct child",
			id:     20,
			wantID: 20,
		},
		{
			name:   "find grandchild",
			id:     100,
			wantID: 100,
		},
		{
			name:   "not found returns empty tag",
			id:     999,
			wantID: 0,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			got := root.findChildByID(tc.id)
			assert.Equal(t, tc.wantID, got.ID)
		})
	}
}

func TestTag_convertToFlattenMap(t *testing.T) {
	grandchild := &Tag{ID: 100, Name: "grandchild"}
	child1 := &Tag{ID: 10, Name: "child1", Children: []*Tag{grandchild}}
	child2 := &Tag{ID: 20, Name: "child2"}
	root := Tag{ID: 1, Name: "root", Children: []*Tag{child1, child2}}

	result := root.convertToFlattenMap()

	assert.Len(t, result, 4)
	assert.Equal(t, uint(1), result[1].ID)
	assert.Equal(t, uint(10), result[10].ID)
	assert.Equal(t, uint(20), result[20].ID)
	assert.Equal(t, uint(100), result[100].ID)
}

func TestTag_convertToFlattenMap_leafNode(t *testing.T) {
	leaf := Tag{ID: 5, Name: "leaf"}
	result := leaf.convertToFlattenMap()
	assert.Len(t, result, 1)
	assert.Equal(t, uint(5), result[5].ID)
}

func TestTag_FindChildByName(t *testing.T) {
	child1 := &Tag{ID: 10, Name: "alpha"}
	child2 := &Tag{ID: 20, Name: "beta"}
	root := Tag{ID: 1, Name: "root", Children: []*Tag{child1, child2}}

	testCases := []struct {
		name     string
		search   string
		wantNil  bool
		wantName string
	}{
		{
			name:     "find existing child by name",
			search:   "alpha",
			wantName: "alpha",
		},
		{
			name:     "find second child by name",
			search:   "beta",
			wantName: "beta",
		},
		{
			name:    "not found returns nil",
			search:  "gamma",
			wantNil: true,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			got := root.FindChildByName(tc.search)
			if tc.wantNil {
				assert.Nil(t, got)
			} else {
				assert.NotNil(t, got)
				assert.Equal(t, tc.wantName, got.Name)
			}
		})
	}
}

func TestTag_ConvertToFlattenMap(t *testing.T) {
	grandchild := &Tag{ID: 100, Name: "grandchild"}
	child1 := &Tag{ID: 10, Name: "child1", Children: []*Tag{grandchild}}
	child2 := &Tag{ID: 20, Name: "child2"}
	// Root node (ID 0) should be excluded from the result
	root := Tag{ID: 0, Name: "root", Children: []*Tag{child1, child2}}

	result := root.ConvertToFlattenMap()

	// Root is excluded, children and grandchildren are included
	assert.Len(t, result, 3)
	assert.Contains(t, result, uint(10))
	assert.Contains(t, result, uint(20))
	assert.Contains(t, result, uint(100))
	_, hasRoot := result[0]
	assert.False(t, hasRoot)
}

func TestTag_ConvertToFlattenMap_emptyChildren(t *testing.T) {
	root := Tag{ID: 0, Name: "root"}
	result := root.ConvertToFlattenMap()
	assert.Len(t, result, 0)
}

func TestGetMaxTagID(t *testing.T) {
	testCases := []struct {
		name string
		tags []Tag
		want uint
	}{
		{
			name: "empty tags",
			tags: []Tag{},
			want: 0,
		},
		{
			name: "single tag without children",
			tags: []Tag{
				{ID: 5, Name: "tag5"},
			},
			want: 5,
		},
		{
			name: "multiple tags without children",
			tags: []Tag{
				{ID: 3, Name: "tag3"},
				{ID: 7, Name: "tag7"},
				{ID: 1, Name: "tag1"},
			},
			want: 7,
		},
		{
			name: "tags with children where child has max id",
			tags: []Tag{
				{
					ID:   1,
					Name: "tag1",
					Children: []*Tag{
						{ID: 10, Name: "child10", Children: []*Tag{
							{ID: 100, Name: "grandchild100"},
						}},
					},
				},
				{ID: 5, Name: "tag5"},
			},
			want: 100,
		},
		{
			name: "tags where parent has max id",
			tags: []Tag{
				{
					ID:   200,
					Name: "tag200",
					Children: []*Tag{
						{ID: 10, Name: "child10"},
					},
				},
				{ID: 5, Name: "tag5"},
			},
			want: 200,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			got := GetMaxTagID(tc.tags)
			assert.Equal(t, tc.want, got)
		})
	}
}

func TestImageTagChecker_HasDirectTag(t *testing.T) {
	testCases := []struct {
		name          string
		imageFileTags map[uint]db.FileTagAddedBy
		want          bool
	}{
		{
			name:          "has direct tags",
			imageFileTags: map[uint]db.FileTagAddedBy{1: db.FileTagAddedByUser},
			want:          true,
		},
		{
			name:          "no direct tags",
			imageFileTags: map[uint]db.FileTagAddedBy{},
			want:          false,
		},
		{
			name:          "nil direct tags",
			imageFileTags: nil,
			want:          false,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			checker := ImageTagChecker{
				imageFileTags: tc.imageFileTags,
			}
			assert.Equal(t, tc.want, checker.HasDirectTag())
		})
	}
}

func TestImageTagChecker_GetDirectTags(t *testing.T) {
	testCases := []struct {
		name          string
		imageFileTags map[uint]db.FileTagAddedBy
		wantLen       int
	}{
		{
			name: "multiple direct tags",
			imageFileTags: map[uint]db.FileTagAddedBy{
				1: db.FileTagAddedByUser,
				2: db.FileTagAddedBySuggestion,
			},
			wantLen: 2,
		},
		{
			name:          "no direct tags",
			imageFileTags: map[uint]db.FileTagAddedBy{},
			wantLen:       0,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			checker := ImageTagChecker{
				imageFileTags: tc.imageFileTags,
			}
			got := checker.GetDirectTags()
			assert.Len(t, got, tc.wantLen)
			// Verify all returned tag IDs exist in the original map
			for _, tagID := range got {
				_, ok := tc.imageFileTags[tagID]
				assert.True(t, ok, "returned tagID %d should be in imageFileTags", tagID)
			}
		})
	}
}

func TestImageTagChecker_HasAnyTag(t *testing.T) {
	testCases := []struct {
		name          string
		imageFileTags map[uint]db.FileTagAddedBy
		ancestorsTags map[uint][]db.FileTagAddedBy
		want          bool
	}{
		{
			name:          "has direct tag only",
			imageFileTags: map[uint]db.FileTagAddedBy{1: db.FileTagAddedByUser},
			ancestorsTags: map[uint][]db.FileTagAddedBy{},
			want:          true,
		},
		{
			name:          "has ancestor tag only",
			imageFileTags: map[uint]db.FileTagAddedBy{},
			ancestorsTags: map[uint][]db.FileTagAddedBy{1: {db.FileTagAddedByUser}},
			want:          true,
		},
		{
			name:          "has both direct and ancestor tags",
			imageFileTags: map[uint]db.FileTagAddedBy{1: db.FileTagAddedByUser},
			ancestorsTags: map[uint][]db.FileTagAddedBy{2: {db.FileTagAddedByUser}},
			want:          true,
		},
		{
			name:          "no tags at all",
			imageFileTags: map[uint]db.FileTagAddedBy{},
			ancestorsTags: map[uint][]db.FileTagAddedBy{},
			want:          false,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			checker := ImageTagChecker{
				imageFileTags: tc.imageFileTags,
				ancestorsTags: tc.ancestorsTags,
			}
			assert.Equal(t, tc.want, checker.HasAnyTag())
		})
	}
}

func TestImageTagChecker_GetTagMap(t *testing.T) {
	testCases := []struct {
		name          string
		imageFileTags map[uint]db.FileTagAddedBy
		ancestorsTags map[uint][]db.FileTagAddedBy
		want          map[uint]db.FileTagAddedBy
	}{
		{
			name: "direct tags only",
			imageFileTags: map[uint]db.FileTagAddedBy{
				1: db.FileTagAddedByUser,
				2: db.FileTagAddedBySuggestion,
			},
			ancestorsTags: map[uint][]db.FileTagAddedBy{},
			want: map[uint]db.FileTagAddedBy{
				1: db.FileTagAddedByUser,
				2: db.FileTagAddedBySuggestion,
			},
		},
		{
			name:          "ancestor tags only",
			imageFileTags: map[uint]db.FileTagAddedBy{},
			ancestorsTags: map[uint][]db.FileTagAddedBy{
				10: {db.FileTagAddedByUser},
			},
			want: map[uint]db.FileTagAddedBy{
				10: db.FileTagAddedByUser,
			},
		},
		{
			name: "ancestor tag with user takes priority over suggestion",
			imageFileTags: map[uint]db.FileTagAddedBy{},
			ancestorsTags: map[uint][]db.FileTagAddedBy{
				10: {db.FileTagAddedBySuggestion, db.FileTagAddedByUser},
			},
			want: map[uint]db.FileTagAddedBy{
				10: db.FileTagAddedByUser,
			},
		},
		{
			name: "ancestor tag with only suggestion",
			imageFileTags: map[uint]db.FileTagAddedBy{},
			ancestorsTags: map[uint][]db.FileTagAddedBy{
				10: {db.FileTagAddedBySuggestion},
			},
			want: map[uint]db.FileTagAddedBy{
				10: db.FileTagAddedBySuggestion,
			},
		},
		{
			name: "mixed direct and ancestor tags",
			imageFileTags: map[uint]db.FileTagAddedBy{
				1: db.FileTagAddedByUser,
			},
			ancestorsTags: map[uint][]db.FileTagAddedBy{
				10: {db.FileTagAddedBySuggestion},
			},
			want: map[uint]db.FileTagAddedBy{
				1:  db.FileTagAddedByUser,
				10: db.FileTagAddedBySuggestion,
			},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			checker := ImageTagChecker{
				imageFileTags: tc.imageFileTags,
				ancestorsTags: tc.ancestorsTags,
			}
			got := checker.GetTagMap()
			assert.Equal(t, tc.want, got)
		})
	}
}

func TestBatchImageTagChecker_GetStats(t *testing.T) {
	testCases := []struct {
		name             string
		imageTagCheckers []ImageTagChecker
		want             map[uint]TagStatsForFiles
	}{
		{
			name:             "empty checkers returns nil",
			imageTagCheckers: []ImageTagChecker{},
			want:             nil,
		},
		{
			name: "single image with direct tags",
			imageTagCheckers: []ImageTagChecker{
				{
					imageFileID:   1,
					imageFileTags: map[uint]db.FileTagAddedBy{10: db.FileTagAddedByUser},
					ancestorsTags: map[uint][]db.FileTagAddedBy{},
				},
			},
			want: map[uint]TagStatsForFiles{
				10: {Count: 1, IsAddedBySelectedFiles: true, IsAddedByAncestor: false},
			},
		},
		{
			name: "single image with ancestor tags",
			imageTagCheckers: []ImageTagChecker{
				{
					imageFileID:   1,
					imageFileTags: map[uint]db.FileTagAddedBy{},
					ancestorsTags: map[uint][]db.FileTagAddedBy{10: {db.FileTagAddedByUser}},
				},
			},
			want: map[uint]TagStatsForFiles{
				10: {Count: 1, IsAddedBySelectedFiles: false, IsAddedByAncestor: true},
			},
		},
		{
			name: "multiple images with same tag",
			imageTagCheckers: []ImageTagChecker{
				{
					imageFileID:   1,
					imageFileTags: map[uint]db.FileTagAddedBy{10: db.FileTagAddedByUser},
					ancestorsTags: map[uint][]db.FileTagAddedBy{},
				},
				{
					imageFileID:   2,
					imageFileTags: map[uint]db.FileTagAddedBy{},
					ancestorsTags: map[uint][]db.FileTagAddedBy{10: {db.FileTagAddedByUser}},
				},
			},
			want: map[uint]TagStatsForFiles{
				10: {Count: 2, IsAddedBySelectedFiles: true, IsAddedByAncestor: true},
			},
		},
		{
			name: "multiple images with different tags",
			imageTagCheckers: []ImageTagChecker{
				{
					imageFileID:   1,
					imageFileTags: map[uint]db.FileTagAddedBy{10: db.FileTagAddedByUser},
					ancestorsTags: map[uint][]db.FileTagAddedBy{20: {db.FileTagAddedBySuggestion}},
				},
				{
					imageFileID:   2,
					imageFileTags: map[uint]db.FileTagAddedBy{30: db.FileTagAddedByUser},
					ancestorsTags: map[uint][]db.FileTagAddedBy{},
				},
			},
			want: map[uint]TagStatsForFiles{
				10: {Count: 1, IsAddedBySelectedFiles: true, IsAddedByAncestor: false},
				20: {Count: 1, IsAddedBySelectedFiles: false, IsAddedByAncestor: true},
				30: {Count: 1, IsAddedBySelectedFiles: true, IsAddedByAncestor: false},
			},
		},
		{
			name: "checker with no tags at all returns nil",
			imageTagCheckers: []ImageTagChecker{
				{
					imageFileID:   1,
					imageFileTags: map[uint]db.FileTagAddedBy{},
					ancestorsTags: map[uint][]db.FileTagAddedBy{},
				},
			},
			want: nil,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			checker := BatchImageTagChecker{
				imageTagCheckers: tc.imageTagCheckers,
			}
			got := checker.GetStats()
			assert.Equal(t, tc.want, got)
		})
	}
}

func TestBatchImageTagChecker_GetTagCheckerForImageFileID(t *testing.T) {
	checkers := BatchImageTagChecker{
		imageTagCheckers: []ImageTagChecker{
			{
				imageFileID:   1,
				imageFileTags: map[uint]db.FileTagAddedBy{10: db.FileTagAddedByUser},
			},
			{
				imageFileID:   2,
				imageFileTags: map[uint]db.FileTagAddedBy{20: db.FileTagAddedByUser},
			},
		},
	}

	t.Run("found", func(t *testing.T) {
		got := checkers.GetTagCheckerForImageFileID(1)
		assert.Equal(t, uint(1), got.imageFileID)
	})

	t.Run("not found returns empty checker", func(t *testing.T) {
		got := checkers.GetTagCheckerForImageFileID(999)
		assert.Equal(t, uint(0), got.imageFileID)
	})
}
