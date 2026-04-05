package tag

import (
	"testing"

	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/stretchr/testify/assert"
)

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
		want          bool
	}{
		{
			name:          "has direct tag",
			imageFileTags: map[uint]db.FileTagAddedBy{1: db.FileTagAddedByUser},
			want:          true,
		},
		{
			name:          "no tags at all",
			imageFileTags: map[uint]db.FileTagAddedBy{},
			want:          false,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			checker := ImageTagChecker{
				imageFileTags: tc.imageFileTags,
			}
			assert.Equal(t, tc.want, checker.HasAnyTag())
		})
	}
}

func TestImageTagChecker_GetTagMap(t *testing.T) {
	testCases := []struct {
		name          string
		imageFileTags map[uint]db.FileTagAddedBy
		want          map[uint]db.FileTagAddedBy
	}{
		{
			name: "direct tags only",
			imageFileTags: map[uint]db.FileTagAddedBy{
				1: db.FileTagAddedByUser,
				2: db.FileTagAddedBySuggestion,
			},
			want: map[uint]db.FileTagAddedBy{
				1: db.FileTagAddedByUser,
				2: db.FileTagAddedBySuggestion,
			},
		},
		{
			name:          "empty tags",
			imageFileTags: map[uint]db.FileTagAddedBy{},
			want:          map[uint]db.FileTagAddedBy{},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			checker := ImageTagChecker{
				imageFileTags: tc.imageFileTags,
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
				},
			},
			want: map[uint]TagStatsForFiles{
				10: {Count: 1, IsAddedBySelectedFiles: true},
			},
		},
		{
			name: "multiple images with same tag",
			imageTagCheckers: []ImageTagChecker{
				{
					imageFileID:   1,
					imageFileTags: map[uint]db.FileTagAddedBy{10: db.FileTagAddedByUser},
				},
				{
					imageFileID:   2,
					imageFileTags: map[uint]db.FileTagAddedBy{10: db.FileTagAddedByUser},
				},
			},
			want: map[uint]TagStatsForFiles{
				10: {Count: 2, IsAddedBySelectedFiles: true},
			},
		},
		{
			name: "multiple images with different tags",
			imageTagCheckers: []ImageTagChecker{
				{
					imageFileID:   1,
					imageFileTags: map[uint]db.FileTagAddedBy{10: db.FileTagAddedByUser},
				},
				{
					imageFileID:   2,
					imageFileTags: map[uint]db.FileTagAddedBy{30: db.FileTagAddedByUser},
				},
			},
			want: map[uint]TagStatsForFiles{
				10: {Count: 1, IsAddedBySelectedFiles: true},
				30: {Count: 1, IsAddedBySelectedFiles: true},
			},
		},
		{
			name: "checker with no tags at all returns nil",
			imageTagCheckers: []ImageTagChecker{
				{
					imageFileID:   1,
					imageFileTags: map[uint]db.FileTagAddedBy{},
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
