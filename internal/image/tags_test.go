package image

import (
	"testing"

	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestTagsService_GetAll(t *testing.T) {
	testCases := []struct {
		name     string
		tagsInDB []db.Tag
		want     []Tag
	}{
		{
			name: "No tag exists",
		},
		{
			name: "Some tags exist",
			tagsInDB: []db.Tag{
				{ID: 1, Name: "tag1"},
				{ID: 2, Name: "tag2"},
				{ID: 11, Name: "child1 tag under tag1", ParentID: 1},
				{ID: 12, Name: "child2 tag under tag1", ParentID: 1},
				{ID: 111, Name: "child tag under child1", ParentID: 11},
			},
			want: []Tag{
				{ID: 1, Name: "tag1", Children: []Tag{
					{ID: 11, Name: "child1 tag under tag1", Children: []Tag{
						{ID: 111, Name: "child tag under child1"},
					}},
					{ID: 12, Name: "child2 tag under tag1"},
				}},
				{ID: 2, Name: "tag2"},
			},
		},
	}
	dbClient, err := db.NewClient(db.DSNMemory, db.WithNopLogger())
	require.NoError(t, err)
	dbClient.Migrate(&db.Tag{})
	defer func() {
		require.NoError(t, db.Truncate(dbClient, &db.Tag{}))
	}()

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			db.Truncate(dbClient, &db.Tag{})
			if len(tc.tagsInDB) > 0 {
				require.NoError(t, db.BatchCreate(dbClient, tc.tagsInDB))
			}
			allTags, err := db.GetAll[db.Tag](dbClient)
			if err != nil {
				require.NoError(t, err)
			}
			require.Equal(t, len(tc.tagsInDB), len(allTags))
			for i := range allTags {
				require.EqualExportedValues(t, tc.tagsInDB[i], allTags[i])
			}

			service := &TagService{
				dbClient: dbClient,
			}
			got, gotErr := service.GetAll()
			require.NoError(t, gotErr)
			assert.Equal(t, tc.want, got)
		})
	}
}
