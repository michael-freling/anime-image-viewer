package image

import (
	"log/slog"
	"testing"

	"github.com/google/go-cmp/cmp/cmpopts"
	"github.com/michael-freling/anime-image-viewer/frontend/src/xassert"
	"github.com/michael-freling/anime-image-viewer/internal/config"
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
				FilesMap: map[uint][]File{
					2:   {{ID: 2}},
					111: {{ID: 100}}, // a tag from a top directory
				},
				AncestorMap: map[uint][]File{
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
			require.NoError(t, dbClient.Truncate(&db.FileTag{}, &db.File{}))
			if len(tc.insertFiles) > 0 {
				require.NoError(t, db.BatchCreate(dbClient, tc.insertFiles))
			}
			if len(tc.insertFileTags) > 0 {
				require.NoError(t, db.BatchCreate(dbClient, tc.insertFileTags))
			}

			service := &TagService{
				dbClient: dbClient,
				directoryService: &DirectoryService{
					dbClient: dbClient,
					config: config.Config{
						ImageRootDirectory: t.TempDir(),
					},
				},
			}
			got, gotErr := service.ReadTagsByFileIDs(tc.fileIDs)
			if tc.wantErr != nil {
				assert.ErrorIs(t, gotErr, tc.wantErr)
				return
			}
			assert.NoError(t, gotErr)
			assert.Equal(t, tc.want, got)
		})
	}
}

func TestTagService_ReadImageFiles(t *testing.T) {
	tester := newTester(t, withGormLogger(slog.Default()))
	dbClient := tester.dbClient

	rootDirectory := tester.config.ImageRootDirectory

	tester.createDirectoryInFS(t, "Directory 1/Directory 10")
	tester.copyImageFile(t, "image.jpg", "Directory 1/image file 2")
	tester.copyImageFile(t, "image.jpg", "Directory 1/image file 3")
	tester.copyImageFile(t, "image.jpg", "Directory 1/Directory 10/image file 100")

	testCases := []struct {
		name           string
		tagID          uint
		insertFiles    []db.File
		insertTags     []db.Tag
		insertFileTags []db.FileTag
		want           ReadImageFilesResponse
		wantErr        error
	}{
		{
			name:  "Some image files",
			tagID: 1,
			insertFiles: []db.File{
				{ID: 1, Type: db.FileTypeDirectory, Name: "Directory 1"},
				{ID: 2, Type: db.FileTypeImage, ParentID: 1, Name: "image file 2"},
				{ID: 3, Type: db.FileTypeImage, ParentID: 1, Name: "image file 3"},
				{ID: 10, Type: db.FileTypeDirectory, ParentID: 1, Name: "Directory 10"},
				{ID: 100, Type: db.FileTypeImage, ParentID: 10, Name: "image file 100"},
			},
			insertTags: []db.Tag{
				{ID: 1, Name: "tag 1"},
				{ID: 2, Name: "tag 2"},
				{ID: 10, Name: "tag 10", ParentID: 1},
				{ID: 11, Name: "tag 11", ParentID: 1}, // a tag without an file
				{ID: 100, Name: "tag 100", ParentID: 10},
			},
			insertFileTags: []db.FileTag{
				{FileID: 1, TagID: 1},     // a top tag for a directory
				{FileID: 2, TagID: 2},     // a tag unrelated to an input tag
				{FileID: 10, TagID: 10},   // a tag for an intermediate directory
				{FileID: 100, TagID: 100}, // a tag for a direct file
			},
			want: ReadImageFilesResponse{
				Tags: []Tag{
					{ID: 1, Name: "tag 1"},
					{ID: 10, Name: "tag 10"},
					{ID: 100, Name: "tag 100"},
				},
				ImageFiles: map[uint][]ImageFile{
					1: {
						{ID: 2, Name: "image file 2", Path: rootDirectory + "/Directory 1/image file 2", ContentType: "image/jpeg"},
						{ID: 3, Name: "image file 3", Path: rootDirectory + "/Directory 1/image file 3", ContentType: "image/jpeg"},
						{ID: 100, Name: "image file 100", Path: rootDirectory + "/Directory 1/Directory 10/image file 100", ContentType: "image/jpeg"},
					},
					10: {
						{ID: 100, Name: "image file 100", Path: rootDirectory + "/Directory 1/Directory 10/image file 100", ContentType: "image/jpeg"},
					},
					100: {
						{ID: 100, Name: "image file 100", Path: rootDirectory + "/Directory 1/Directory 10/image file 100", ContentType: "image/jpeg"},
					},
				},
			},
		},

		{
			name:  "No tag exists",
			tagID: 1,
		},
		{
			name:  "No image file for a tag",
			tagID: 1,
			insertFileTags: []db.FileTag{
				{FileID: 1, TagID: 1},
			},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			require.NoError(t, dbClient.Truncate(&db.FileTag{}, &db.File{}, &db.Tag{}))
			if len(tc.insertFiles) > 0 {
				require.NoError(t, db.BatchCreate(dbClient, tc.insertFiles))
			}
			if len(tc.insertTags) > 0 {
				require.NoError(t, db.BatchCreate(dbClient, tc.insertTags))
			}
			if len(tc.insertFileTags) > 0 {
				require.NoError(t, db.BatchCreate(dbClient, tc.insertFileTags))
			}

			got, gotErr := tester.tagService.ReadImageFiles(tc.tagID)
			if tc.wantErr != nil {
				assert.ErrorIs(t, gotErr, tc.wantErr)
				return
			}
			assert.NoError(t, gotErr)
			assert.Equal(t, tc.want, got)
		})
	}
}

func TestTagService_BatchUpdateTagsForFiles(t *testing.T) {
	tester := newTester(t)
	dbClient := tester.dbClient

	testCases := []struct {
		name           string
		fileIDs        []uint
		addedTagIDs    []uint
		deletedTagIDs  []uint
		insertFileTags []db.FileTag
		wantFileTags   []db.FileTag
		wantErr        error
	}{
		{
			name:          "Create new tags and delete old tags for files",
			fileIDs:       []uint{1, 2, 3},
			addedTagIDs:   []uint{1, 2},
			deletedTagIDs: []uint{10, 11},
			insertFileTags: []db.FileTag{
				{FileID: 1, TagID: 1},

				{FileID: 1, TagID: 10}, // deleted
				{FileID: 2, TagID: 10}, // deleted
				{FileID: 2, TagID: 11}, // deleted

				{FileID: 1, TagID: 100}, // Same file with the different tag
				{FileID: 9, TagID: 100}, // different file with the different tag
			},
			wantFileTags: []db.FileTag{
				{FileID: 1, TagID: 1}, // keep
				{FileID: 1, TagID: 2}, // inserted
				{FileID: 1, TagID: 100},

				{FileID: 2, TagID: 1}, // inserted
				{FileID: 2, TagID: 2}, // inserted

				{FileID: 3, TagID: 1}, // inserted
				{FileID: 3, TagID: 2}, // inserted

				{FileID: 9, TagID: 100},
			},
		},
		{
			name:        "no delete tag",
			fileIDs:     []uint{1, 2},
			addedTagIDs: []uint{1, 2},
			insertFileTags: []db.FileTag{
				{FileID: 1, TagID: 1},

				{FileID: 1, TagID: 100}, // Same file with the different tag
				{FileID: 9, TagID: 100}, // different file with the different tag
			},
			wantFileTags: []db.FileTag{
				{FileID: 1, TagID: 1}, // keep
				{FileID: 1, TagID: 2}, // inserted
				{FileID: 1, TagID: 100},

				{FileID: 2, TagID: 1}, // inserted
				{FileID: 2, TagID: 2}, // inserted

				{FileID: 9, TagID: 100},
			},
		},
		{
			name:        "no delete tag",
			fileIDs:     []uint{1, 2},
			addedTagIDs: []uint{1, 2},
			insertFileTags: []db.FileTag{
				{FileID: 1, TagID: 1},

				{FileID: 1, TagID: 100}, // Same file with the different tag
				{FileID: 9, TagID: 100}, // different file with the different tag
			},
			wantFileTags: []db.FileTag{
				{FileID: 1, TagID: 1}, // keep
				{FileID: 1, TagID: 2}, // inserted
				{FileID: 1, TagID: 100},

				{FileID: 2, TagID: 1}, // inserted
				{FileID: 2, TagID: 2}, // inserted

				{FileID: 9, TagID: 100},
			},
		},
		{
			name:          "no added tag",
			fileIDs:       []uint{1, 2, 3},
			deletedTagIDs: []uint{1, 2},
			insertFileTags: []db.FileTag{
				{FileID: 1, TagID: 1},
				{FileID: 1, TagID: 2},
				{FileID: 2, TagID: 2},

				{FileID: 1, TagID: 100}, // Same file with the different tag
				{FileID: 9, TagID: 100}, // different file with the different tag
			},
			wantFileTags: []db.FileTag{
				{FileID: 1, TagID: 100},
				{FileID: 9, TagID: 100},
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
			gotErr := service.BatchUpdateTagsForFiles(tc.fileIDs, tc.addedTagIDs, tc.deletedTagIDs)
			if tc.wantErr != nil {
				assert.ErrorIs(t, gotErr, tc.wantErr)
				return
			}
			assert.NoError(t, gotErr)

			gotFileTags, err := db.GetAll[db.FileTag](dbClient)
			require.NoError(t, err)
			xassert.ElementsMatch(t,
				tc.wantFileTags,
				gotFileTags,
				cmpopts.SortSlices(func(a, b db.FileTag) bool {
					if a.FileID == b.FileID {
						return a.TagID < b.TagID
					}
					return a.FileID < b.FileID
				}),
				cmpopts.IgnoreFields(db.FileTag{}, "CreatedAt"),
			)
		})
	}
}
