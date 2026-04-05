package tag

import (
	"testing"

	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/stretchr/testify/assert"
)

func TestTestTagBuilder_BuildDBTag(t *testing.T) {
	builder := NewTestTagBuilder().
		Add(Tag{ID: 1, Name: "parent"}).
		Add(Tag{ID: 10, Name: "child", ParentID: 1})

	testCases := []struct {
		name string
		id   uint
		want db.Tag
	}{
		{
			name: "top-level tag",
			id:   1,
			want: db.Tag{
				ID:   1,
				Name: "parent",
			},
		},
		{
			name: "child tag with parent ID",
			id:   10,
			want: db.Tag{
				ID:       10,
				Name:     "child",
				ParentID: 1,
			},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			got := builder.BuildDBTag(tc.id)
			assert.Equal(t, tc.want, got)
		})
	}
}
