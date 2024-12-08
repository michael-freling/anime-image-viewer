package image

import (
	"testing"

	"github.com/michael-freling/anime-image-viewer/frontend/src/xassert"
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
	dbClient.Migrate()

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			dbClient.Truncate(&db.Tag{})
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

func TestTagService_ReplaceFileTags(t *testing.T) {
	tester := newTester(t)
	dbClient := tester.dbClient

	testCases := []struct {
		name           string
		fileIDs        []uint
		tagIDs         []uint
		insertFileTags []db.FileTag
		wantFileTags   []db.FileTag
		wantErr        error
	}{
		{
			name:    "Create new tags and delete old tags for files",
			fileIDs: []uint{1, 2},
			tagIDs:  []uint{1, 3},
			insertFileTags: []db.FileTag{
				{FileID: 1, TagID: 1},
				{FileID: 2, TagID: 2}, // deleted
				{FileID: 9, TagID: 1}, // different file with the same tag
				{FileID: 9, TagID: 9}, // different file with the different tag
			},
			wantFileTags: []db.FileTag{
				{FileID: 1, TagID: 1}, // keep
				{FileID: 1, TagID: 3}, // inserted
				{FileID: 2, TagID: 1}, // inserted
				{FileID: 2, TagID: 3}, // inserted
				{FileID: 9, TagID: 1},
				{FileID: 9, TagID: 9},
			},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			dbClient.Truncate(&db.FileTag{})
			require.NoError(t, db.BatchCreate(dbClient, tc.insertFileTags))

			service := &TagService{
				dbClient: dbClient,
			}
			gotErr := service.ReplaceFileTags(tc.fileIDs, tc.tagIDs)
			if tc.wantErr != nil {
				assert.ErrorIs(t, gotErr, tc.wantErr)
				return
			}
			assert.NoError(t, gotErr)

			gotFileTags, err := db.GetAll[db.FileTag](dbClient)
			require.NoError(t, err)
			xassert.ElementsMatchIgnoringFields(t,
				tc.wantFileTags,
				gotFileTags,
				func(a, b db.FileTag) bool {
					if a.FileID == b.FileID {
						return a.TagID < b.TagID
					}
					return a.FileID < b.FileID
				},
				"CreatedAt",
			)
		})
	}
}
