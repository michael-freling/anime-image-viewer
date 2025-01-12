package frontend

import (
	"context"
	"testing"

	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/michael-freling/anime-image-viewer/internal/image"
	"github.com/michael-freling/anime-image-viewer/internal/tag"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type tagBuilder struct {
	*tag.TestTagBuilder

	t *testing.T
}

func (builder *tagBuilder) BuildFrontendTag(id uint) Tag {
	source := builder.TestTagBuilder.Build(id)
	require.NotZero(builder.t, source.ID)

	children := make([]Tag, len(source.Children))
	for i, child := range source.Children {
		children[i] = builder.BuildFrontendTag(child.ID)
	}
	if len(children) == 0 {
		children = nil
	}

	return Tag{
		ID:       source.ID,
		Name:     source.Name,
		FullName: source.FullName,
		ParentID: source.ParentID,
		Children: children,
	}
}

func TestTagService_GetAll(t *testing.T) {
	tester := newTester(t)
	dbClient := tester.dbClient

	builder := tester.newTagBuilder(t)
	builder.Add(tag.Tag{ID: 1, Name: "tag1"}).
		Add(tag.Tag{ID: 2, Name: "tag2"}).
		Add(tag.Tag{ID: 11, Name: "child1 tag under tag1", ParentID: 1}).
		Add(tag.Tag{ID: 12, Name: "child2 tag under tag1", ParentID: 1}).
		Add(tag.Tag{ID: 111, Name: "child tag under child1", ParentID: 11})

	testCases := []struct {
		name     string
		tagsInDB []db.Tag
		want     []Tag
	}{
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
				builder.BuildFrontendTag(1),
				builder.BuildFrontendTag(2),
			},
		},
		{
			name: "No tag exists",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			dbClient.Truncate(t, &db.Tag{})
			db.LoadTestData(t, dbClient, tc.tagsInDB)

			allTags, err := db.GetAll[db.Tag](dbClient.Client)
			if err != nil {
				require.NoError(t, err)
			}
			require.Equal(t, len(tc.tagsInDB), len(allTags))
			for i := range allTags {
				require.EqualExportedValues(t, tc.tagsInDB[i], allTags[i])
			}

			service := tester.getTagService()
			got, gotErr := service.GetAll()
			require.NoError(t, gotErr)
			assert.Equal(t, tc.want, got)
		})
	}
}

func TestTagService_ReadTagsByFileIDs(t *testing.T) {
	tester := newTester(t)
	dbClient := tester.dbClient

	testCases := []struct {
		name           string
		fileIDs        []uint
		insertFiles    []db.File
		insertFileTags []db.FileTag
		want           ReadTagsByFileIDsResponse
		wantErr        error
	}{
		{
			name:    "No file tags",
			fileIDs: []uint{1, 2},
			insertFiles: []db.File{
				{ID: 1, Type: db.FileTypeDirectory, Name: "File 1"},
				{ID: 2, Type: db.FileTypeDirectory, Name: "File 2"},
			},
			want: ReadTagsByFileIDsResponse{},
		},
		{
			name:    "Some file tags",
			fileIDs: []uint{2, 100},
			insertFiles: []db.File{
				{ID: 1, Type: db.FileTypeDirectory, Name: "Directory 1"},
				{ID: 2, Type: db.FileTypeImage, ParentID: 1, Name: "image file 2"},
				{ID: 3, Type: db.FileTypeImage, ParentID: 1, Name: "image file 3"},
				{ID: 10, Type: db.FileTypeDirectory, ParentID: 1, Name: "Directory 10"},
				{ID: 100, Type: db.FileTypeImage, ParentID: 10, Name: "image file 100"},
			},
			insertFileTags: []db.FileTag{
				{FileID: 1, TagID: 1},     // a tag for a top directory
				{FileID: 2, TagID: 2},     // tag in directory 1 and 2
				{FileID: 3, TagID: 1},     // a file isn't included in a query
				{FileID: 10, TagID: 11},   // a tag for a parent directory
				{FileID: 100, TagID: 111}, // a tag for a direct file
			},
			want: ReadTagsByFileIDsResponse{
				AncestorMap: map[uint][]image.File{
					1:  {{ID: 2}, {ID: 100}},
					11: {{ID: 100}}, // a tag from a parent directory
				},
				TagCounts: map[uint]uint{
					1:   2,
					2:   1,
					11:  1,
					111: 1,
				},
			},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			dbClient.Truncate(t, &db.FileTag{}, &db.File{})
			db.LoadTestData(t, dbClient, tc.insertFiles)
			db.LoadTestData(t, dbClient, tc.insertFileTags)

			service := tester.getTagService()
			got, gotErr := service.ReadTagsByFileIDs(context.Background(), tc.fileIDs)
			if tc.wantErr != nil {
				assert.ErrorIs(t, gotErr, tc.wantErr)
				return
			}
			assert.NoError(t, gotErr)
			assert.Equal(t, tc.want, got)
		})
	}
}
