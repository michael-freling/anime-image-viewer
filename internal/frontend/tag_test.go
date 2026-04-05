package frontend

import (
	"context"
	"testing"

	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/michael-freling/anime-image-viewer/internal/tag"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type tagBuilder struct {
	*tag.TestTagBuilder

	t *testing.T
}

func (builder *tagBuilder) BuildFrontendTag(id uint) Tag {
	source := builder.Build(id)
	require.NotZero(builder.t, source.ID)
	return Tag{
		ID:   source.ID,
		Name: source.Name,
	}
}

func TestTagService_GetAll(t *testing.T) {
	tester := newTester(t)
	dbClient := tester.dbClient

	builder := tester.newTagBuilder(t)
	builder.Add(tag.Tag{ID: 1, Name: "tag1"}).
		Add(tag.Tag{ID: 2, Name: "tag2"}).
		Add(tag.Tag{ID: 11, Name: "child1 tag under tag1"}).
		Add(tag.Tag{ID: 12, Name: "child2 tag under tag1"}).
		Add(tag.Tag{ID: 111, Name: "child tag under child1"})

	testCases := []struct {
		name     string
		tagsInDB []db.Tag
		want     []Tag
	}{
		{
			name: "Some tags exist",
			tagsInDB: []db.Tag{
				builder.BuildDBTag(1),
				builder.BuildDBTag(2),
				builder.BuildDBTag(11),
				builder.BuildDBTag(12),
				builder.BuildDBTag(111),
			},
			want: []Tag{
				builder.BuildFrontendTag(1),
				builder.BuildFrontendTag(2),
				builder.BuildFrontendTag(11),
				builder.BuildFrontendTag(12),
				builder.BuildFrontendTag(111),
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

func TestTagService_ReadAllMap(t *testing.T) {
	tester := newTester(t)
	dbClient := tester.dbClient

	builder := tester.newTagBuilder(t)
	builder.Add(tag.Tag{ID: 1, Name: "tag1"}).
		Add(tag.Tag{ID: 2, Name: "tag2"}).
		Add(tag.Tag{ID: 11, Name: "child1 tag under tag1"}).
		Add(tag.Tag{ID: 12, Name: "child2 tag under tag1"}).
		Add(tag.Tag{ID: 111, Name: "child tag under child1"})

	testCases := []struct {
		name     string
		tagsInDB []db.Tag
		want     map[uint]Tag
	}{
		{
			name: "Multiple tags",
			tagsInDB: []db.Tag{
				builder.BuildDBTag(1),
				builder.BuildDBTag(2),
				builder.BuildDBTag(11),
				builder.BuildDBTag(12),
				builder.BuildDBTag(111),
			},
			want: map[uint]Tag{
				1:   {ID: 1, Name: "tag1"},
				2:   {ID: 2, Name: "tag2"},
				11:  {ID: 11, Name: "child1 tag under tag1"},
				12:  {ID: 12, Name: "child2 tag under tag1"},
				111: {ID: 111, Name: "child tag under child1"},
			},
		},
		{
			name: "No tags",
			want: map[uint]Tag{},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			dbClient.Truncate(t, &db.Tag{})
			db.LoadTestData(t, dbClient, tc.tagsInDB)

			service := tester.getTagService()
			got, gotErr := service.ReadAllMap()
			require.NoError(t, gotErr)
			assert.Equal(t, tc.want, got)
		})
	}
}

func TestTagService_ReadAllMap_Error(t *testing.T) {
	tester := newTester(t)
	dbClient := tester.dbClient

	// Close the database to cause an error
	dbClient.Truncate(t, &db.Tag{})

	// Test: ReadAllMap returns empty map for no tags (not an error)
	service := tester.getTagService()

	got, gotErr := service.ReadAllMap()
	require.NoError(t, gotErr)
	assert.Equal(t, map[uint]Tag{}, got)
}

func TestTagService_GetAll_EmptyResult(t *testing.T) {
	tester := newTester(t)
	dbClient := tester.dbClient

	dbClient.Truncate(t, &db.Tag{})

	service := tester.getTagService()
	got, gotErr := service.GetAll()
	require.NoError(t, gotErr)
	assert.Nil(t, got, "GetAll should return nil for empty result")
}

func TestTagService_ReadTagsByFileIDs_Error(t *testing.T) {
	tester := newTester(t)
	dbClient := tester.dbClient

	// Insert files but no file_tags. Pass a file ID that doesn't exist at all
	// to trigger the error path in CreateBatchTagCheckerByFileIDs.
	dbClient.Truncate(t, &db.FileTag{}, &db.File{})

	service := tester.getTagService()
	// Passing IDs that do not exist should still succeed (empty result)
	got, gotErr := service.ReadTagsByFileIDs(context.Background(), []uint{999, 1000})
	require.NoError(t, gotErr)
	assert.Equal(t, ReadTagsByFileIDsResponse{}, got)
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
				{FileID: 1, TagID: 1},     // a tag for a top directory (not requested)
				{FileID: 2, TagID: 2},     // tag for file 2
				{FileID: 3, TagID: 1},     // a file isn't included in a query
				{FileID: 10, TagID: 11},   // a tag for a parent directory (not requested)
				{FileID: 100, TagID: 111}, // a tag for a direct file
			},
			want: ReadTagsByFileIDsResponse{
				TagStats: map[uint]TagStat{
					2:   {FileCount: 1, IsAddedBySelectedFiles: true},
					111: {FileCount: 1, IsAddedBySelectedFiles: true},
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
