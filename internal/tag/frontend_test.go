package tag

import (
	"context"
	"slices"
	"testing"

	"github.com/google/go-cmp/cmp/cmpopts"
	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/michael-freling/anime-image-viewer/internal/image"
	"github.com/michael-freling/anime-image-viewer/internal/xassert"
	"github.com/michael-freling/anime-image-viewer/internal/xerrors"
	tag_suggestionv1 "github.com/michael-freling/anime-image-viewer/plugins/plugins-protos/gen/go/tag_suggestion/v1"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/mock/gomock"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func TestTagFrontendService_CreateTopTag(t *testing.T) {
	tester := newTester(t)
	dbClient := tester.dbClient

	service := &TagFrontendService{
		dbClient: dbClient,
	}

	t.Run("create a top tag successfully", func(t *testing.T) {
		dbClient.Truncate(&db.Tag{})
		got, err := service.CreateTopTag("MyTag")
		require.NoError(t, err)
		assert.Equal(t, "MyTag", got.Name)
		assert.NotZero(t, got.ID)

		// Verify it was persisted
		allTags, err := db.GetAll[db.Tag](dbClient)
		require.NoError(t, err)
		assert.Len(t, allTags, 1)
		assert.Equal(t, "MyTag", allTags[0].Name)
	})
}

func TestTagFrontendService_Create(t *testing.T) {
	tester := newTester(t)
	dbClient := tester.dbClient

	service := &TagFrontendService{
		dbClient: dbClient,
	}

	t.Run("create a tag successfully", func(t *testing.T) {
		dbClient.Truncate(&db.Tag{})

		got, err := service.Create(context.Background(), TagInput{
			Name: "mytag",
		})
		require.NoError(t, err)
		assert.Equal(t, "mytag", got.Name)
		assert.NotZero(t, got.ID)
	})

}

func TestTagFrontendService_UpdateName(t *testing.T) {
	tester := newTester(t)
	dbClient := tester.dbClient

	service := &TagFrontendService{
		dbClient: dbClient,
	}

	testCases := []struct {
		name       string
		insertTags []db.Tag
		tagID      uint
		newName    string
		wantName   string
		wantErr    bool
	}{
		{
			name: "update name successfully",
			insertTags: []db.Tag{
				{ID: 1, Name: "old_name"},
			},
			tagID:    1,
			newName:  "new_name",
			wantName: "new_name",
		},
		{
			name:       "tag not found returns error",
			insertTags: nil,
			tagID:      999,
			newName:    "new_name",
			wantErr:    true,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			dbClient.Truncate(&db.Tag{})
			if len(tc.insertTags) > 0 {
				require.NoError(t, db.BatchCreate(dbClient, tc.insertTags))
			}

			got, err := service.UpdateName(context.Background(), tc.tagID, tc.newName)
			if tc.wantErr {
				assert.Error(t, err)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tc.wantName, got.Name)
			assert.Equal(t, tc.tagID, got.ID)

			// Verify persistence
			allTags, err := db.GetAll[db.Tag](dbClient)
			require.NoError(t, err)
			assert.Len(t, allTags, 1)
			assert.Equal(t, tc.wantName, allTags[0].Name)
		})
	}
}

func TestTagFrontendService_UpdateCategory(t *testing.T) {
	tester := newTester(t)
	dbClient := tester.dbClient

	service := &TagFrontendService{
		dbClient: dbClient,
	}

	testCases := []struct {
		name         string
		insertTags   []db.Tag
		tagID        uint
		newCategory  string
		wantCategory string
		wantErr      bool
	}{
		{
			name: "set category to character",
			insertTags: []db.Tag{
				{ID: 1, Name: "Sakura"},
			},
			tagID:        1,
			newCategory:  "character",
			wantCategory: "character",
		},
		{
			name: "clear category back to empty",
			insertTags: []db.Tag{
				{ID: 1, Name: "Sakura", Category: "character"},
			},
			tagID:        1,
			newCategory:  "",
			wantCategory: "",
		},
		{
			name:        "tag not found returns error",
			insertTags:  nil,
			tagID:       999,
			newCategory: "character",
			wantErr:     true,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			dbClient.Truncate(&db.Tag{})
			if len(tc.insertTags) > 0 {
				require.NoError(t, db.BatchCreate(dbClient, tc.insertTags))
			}

			got, err := service.UpdateCategory(context.Background(), tc.tagID, tc.newCategory)
			if tc.wantErr {
				assert.Error(t, err)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tc.wantCategory, got.Category)
			assert.Equal(t, tc.tagID, got.ID)

			// Verify persistence
			allTags, err := db.GetAll[db.Tag](dbClient)
			require.NoError(t, err)
			assert.Len(t, allTags, 1)
			assert.Equal(t, tc.wantCategory, allTags[0].Category)
		})
	}
}

func TestTagFrontendService_GetTagFileCount(t *testing.T) {
	tester := newTester(t)

	// setup: create tags and file tags
	require.NoError(t, db.BatchCreate(tester.dbClient, []db.Tag{
		{ID: 1, Name: "tag1"},
		{ID: 2, Name: "tag2"},
	}))
	require.NoError(t, db.BatchCreate(tester.dbClient, []db.FileTag{
		{TagID: 1, FileID: 100, AddedBy: db.FileTagAddedByUser},
		{TagID: 1, FileID: 200, AddedBy: db.FileTagAddedByUser},
	}))

	service := tester.getFrontendService(frontendServiceMocks{})

	count, err := service.GetTagFileCount(1)
	require.NoError(t, err)
	assert.Equal(t, uint(2), count)

	count, err = service.GetTagFileCount(2)
	require.NoError(t, err)
	assert.Equal(t, uint(0), count)
}

func TestTagFrontendService_DeleteTag(t *testing.T) {
	tester := newTester(t)
	tester.dbClient.Truncate(&db.Tag{}, &db.FileTag{})

	require.NoError(t, db.BatchCreate(tester.dbClient, []db.Tag{
		{ID: 1, Name: "tag1"},
		{ID: 2, Name: "tag2"},
	}))
	require.NoError(t, db.BatchCreate(tester.dbClient, []db.FileTag{
		{TagID: 1, FileID: 100, AddedBy: db.FileTagAddedByUser},
		{TagID: 1, FileID: 200, AddedBy: db.FileTagAddedByUser},
	}))

	ctx := context.Background()
	service := tester.getFrontendService(frontendServiceMocks{})

	// Delete tag with file associations
	err := service.DeleteTag(ctx, 1)
	require.NoError(t, err)

	// Verify tag is deleted
	tags, err := db.GetAll[db.Tag](tester.dbClient)
	require.NoError(t, err)
	assert.Len(t, tags, 1)
	assert.Equal(t, uint(2), tags[0].ID)

	// Verify file tags are deleted
	fileTags, err := tester.dbClient.FileTag().FindAllByTagIDs([]uint{1})
	require.NoError(t, err)
	assert.Empty(t, fileTags)

	// Delete tag without file associations
	err = service.DeleteTag(ctx, 2)
	require.NoError(t, err)

	tags, err = db.GetAll[db.Tag](tester.dbClient)
	require.NoError(t, err)
	assert.Empty(t, tags)
}

func TestTagFrontendService_MergeTags(t *testing.T) {
	tester := newTester(t)
	ctx := context.Background()

	t.Run("merge with file associations", func(t *testing.T) {
		tester.dbClient.Truncate(&db.Tag{}, &db.FileTag{})

		require.NoError(t, db.BatchCreate(tester.dbClient, []db.Tag{
			{ID: 1, Name: "source"},
			{ID: 2, Name: "target"},
		}))
		require.NoError(t, db.BatchCreate(tester.dbClient, []db.FileTag{
			{TagID: 1, FileID: 100, AddedBy: db.FileTagAddedByUser},
			{TagID: 1, FileID: 200, AddedBy: db.FileTagAddedByUser},
			{TagID: 2, FileID: 200, AddedBy: db.FileTagAddedByUser}, // overlap
			{TagID: 2, FileID: 300, AddedBy: db.FileTagAddedByUser},
		}))

		service := tester.getFrontendService(frontendServiceMocks{})
		err := service.MergeTags(ctx, 1, 2)
		require.NoError(t, err)

		// Source tag should be deleted
		tags, err := db.GetAll[db.Tag](tester.dbClient)
		require.NoError(t, err)
		assert.Len(t, tags, 1)
		assert.Equal(t, uint(2), tags[0].ID)

		// Source file-tags should be deleted
		sourceFileTags, err := tester.dbClient.FileTag().FindAllByTagIDs([]uint{1})
		require.NoError(t, err)
		assert.Empty(t, sourceFileTags)

		// Target should have file 100 (transferred), 200 (already had), 300 (already had)
		targetFileTags, err := tester.dbClient.FileTag().FindAllByTagIDs([]uint{2})
		require.NoError(t, err)
		assert.Len(t, targetFileTags, 3)
	})

	t.Run("merge same tag returns error", func(t *testing.T) {
		service := tester.getFrontendService(frontendServiceMocks{})
		err := service.MergeTags(ctx, 1, 1)
		assert.Error(t, err)
	})

	t.Run("merge with no file associations", func(t *testing.T) {
		tester.dbClient.Truncate(&db.Tag{}, &db.FileTag{})

		require.NoError(t, db.BatchCreate(tester.dbClient, []db.Tag{
			{ID: 10, Name: "empty-source"},
			{ID: 20, Name: "target"},
		}))

		service := tester.getFrontendService(frontendServiceMocks{})
		err := service.MergeTags(ctx, 10, 20)
		require.NoError(t, err)

		tags, err := db.GetAll[db.Tag](tester.dbClient)
		require.NoError(t, err)
		assert.Len(t, tags, 1)
		assert.Equal(t, uint(20), tags[0].ID)
	})

	t.Run("merge with non-existent source tag returns error", func(t *testing.T) {
		tester.dbClient.Truncate(&db.Tag{}, &db.FileTag{})

		require.NoError(t, db.BatchCreate(tester.dbClient, []db.Tag{
			{ID: 200, Name: "target"},
		}))

		service := tester.getFrontendService(frontendServiceMocks{})
		err := service.MergeTags(ctx, 999, 200)
		assert.Error(t, err)
	})

	t.Run("merge with non-existent target tag returns error", func(t *testing.T) {
		tester.dbClient.Truncate(&db.Tag{}, &db.FileTag{})

		require.NoError(t, db.BatchCreate(tester.dbClient, []db.Tag{
			{ID: 201, Name: "source"},
		}))

		service := tester.getFrontendService(frontendServiceMocks{})
		err := service.MergeTags(ctx, 201, 999)
		assert.Error(t, err)
	})
}

func TestTagFrontendService_BatchUpdateTagsForFiles_NoChanges(t *testing.T) {
	tester := newTester(t)
	dbClient := tester.dbClient

	service := &TagFrontendService{
		dbClient: dbClient,
	}

	// When all added tags already exist for all files and there are no deleted tags,
	// createdFileTags and deletedTagIDs are both empty, so no transaction is executed.
	dbClient.Truncate(&db.FileTag{})
	require.NoError(t, db.BatchCreate(dbClient, []db.FileTag{
		{FileID: 1, TagID: 1},
		{FileID: 2, TagID: 1},
	}))

	err := service.BatchUpdateTagsForFiles(context.Background(), []uint{1, 2}, []uint{1}, nil)
	assert.NoError(t, err)
}

func TestTagFrontendService_BatchUpdateTagsForFiles(t *testing.T) {
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
				{FileID: 1, TagID: 2, AddedBy: db.FileTagAddedByUser}, // inserted
				{FileID: 1, TagID: 100},

				{FileID: 2, TagID: 1, AddedBy: db.FileTagAddedByUser}, // inserted
				{FileID: 2, TagID: 2, AddedBy: db.FileTagAddedByUser}, // inserted

				{FileID: 3, TagID: 1, AddedBy: db.FileTagAddedByUser}, // inserted
				{FileID: 3, TagID: 2, AddedBy: db.FileTagAddedByUser}, // inserted

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
				{FileID: 1, TagID: 2, AddedBy: db.FileTagAddedByUser}, // inserted
				{FileID: 1, TagID: 100},

				{FileID: 2, TagID: 1, AddedBy: db.FileTagAddedByUser}, // inserted
				{FileID: 2, TagID: 2, AddedBy: db.FileTagAddedByUser}, // inserted

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
				{FileID: 1, TagID: 2, AddedBy: db.FileTagAddedByUser}, // inserted
				{FileID: 1, TagID: 100},

				{FileID: 2, TagID: 1, AddedBy: db.FileTagAddedByUser}, // inserted
				{FileID: 2, TagID: 2, AddedBy: db.FileTagAddedByUser}, // inserted

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

			service := &TagFrontendService{
				dbClient: dbClient,
			}
			ctx := context.Background()
			gotErr := service.BatchUpdateTagsForFiles(ctx, tc.fileIDs, tc.addedTagIDs, tc.deletedTagIDs)
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

func TestTagFrontendService_SuggestTags(t *testing.T) {
	tester := newTester(t)

	tagBuilder := NewTestTagBuilder().
		Add(Tag{ID: 1, Name: "tag1"}).
		Add(Tag{ID: 2, Name: "tag2"}).
		Add(Tag{ID: 10, Name: "tag 10"}).
		Add(Tag{ID: 20, Name: "tag 11"}).
		Add(Tag{ID: 100, Name: "tag 100"}).
		Add(Tag{ID: 200, Name: "tag 110"})

	// tester.copyImageFile(t, "image.jpg", filepath.Join("Directory 1", "Directory 10", "image11.jpg"))
	// tester.copyImageFile(t, "image.jpg", filepath.Join("Directory 1", "Directory 10", "Directory 100", "image101.jpg"))

	fileBuilder := tester.newFileCreator(t).
		CreateDirectory(image.Directory{ID: 1, Name: "Directory 1"}).
		CreateDirectory(image.Directory{ID: 10, Name: "Directory 10", ParentID: 1}).
		CreateImage(image.ImageFile{ID: 11, Name: "image11.jpg", ParentID: 10, ContentType: "image/jpeg"}, image.TestImageFileJpeg).
		CreateDirectory(image.Directory{ID: 100, Name: "Directory 100", ParentID: 10}).
		CreateImage(image.ImageFile{ID: 101, Name: "image101.jpg", ParentID: 100, ContentType: "image/jpeg"}, image.TestImageFileJpeg)

	// See the full list of how it should behave in /docs/features/tag_suggestion.md
	testCases := []struct {
		name           string
		insertDBFiles  []db.File
		insertTags     []db.Tag
		insertFileTags []db.FileTag

		imageFileIDs    []uint
		setupMockClient func(*tag_suggestionv1.MockTagSuggestionServiceClient)

		want         SuggestTagsResponse
		wantError    error
		wantAnyError bool // when true, assert any error without matching a specific type
	}{
		{
			name: "multiple image files",
			insertTags: []db.Tag{
				{ID: 1, Name: "tag1"},
				{ID: 2, Name: "tag2"},
				{ID: 10, Name: "tag 10"},
				{ID: 20, Name: "tag 11"},
				{ID: 100, Name: "tag 100"},
				{ID: 200, Name: "tag 110"},
			},
			insertDBFiles: []db.File{
				{ID: 1, Name: "Directory 1", Type: db.FileTypeDirectory},
				{ID: 10, Name: "Directory 10", Type: db.FileTypeDirectory, ParentID: 1},
				{ID: 11, Name: "image11.jpg", Type: db.FileTypeImage, ParentID: 10},
				{ID: 100, Name: "Directory 100", Type: db.FileTypeDirectory, ParentID: 10},
				{ID: 101, Name: "image101.jpg", Type: db.FileTypeImage, ParentID: 100},
			},
			insertFileTags: []db.FileTag{
				{FileID: 11, TagID: 10},  // an image has a tag
				{FileID: 101, TagID: 20}, // an image has a tag
			},
			imageFileIDs: []uint{
				11,  // an image has a tag
				101, // an image has a tag
			},
			setupMockClient: func(mock *tag_suggestionv1.MockTagSuggestionServiceClient) {
				mock.EXPECT().
					Suggest(gomock.Any(), &tag_suggestionv1.SuggestRequest{
						ImageUrls: []string{
							fileBuilder.BuildImageFile(11).LocalFilePath,
							fileBuilder.BuildImageFile(101).LocalFilePath,
						},
					}).
					Return(&tag_suggestionv1.SuggestResponse{
						Suggestions: []*tag_suggestionv1.Suggestion{
							{
								Scores: []*tag_suggestionv1.SuggestionScore{
									{TagId: 10, Score: 0.9},
									{TagId: 20, Score: 0.8},
									{TagId: 100, Score: 0.7},
									{TagId: 200, Score: 0.7},
									{TagId: 2, Score: 0.6},
									{TagId: 1, Score: 0.5},
								},
							},
							{
								Scores: []*tag_suggestionv1.SuggestionScore{
									{TagId: 1, Score: 0.5},
									{TagId: 2, Score: 0.4},
									{TagId: 10, Score: 0.3},
									{TagId: 20, Score: 0.2},
									{TagId: 100, Score: 0.1},
									{TagId: 200, Score: 0},
								},
							},
						},
						AllTags: map[uint64]*tag_suggestionv1.Tag{
							0:   {Id: 0},
							1:   {Id: 1},
							2:   {Id: 2},
							10:  {Id: 10},
							11:  {Id: 20},
							100: {Id: 100},
							200: {Id: 200},
						},
					}, nil)
			},
			want: SuggestTagsResponse{
				// ImageFiles: []image.ImageFile{
				// 	fileBuilder.buildImageFile(11),
				// 	fileBuilder.buildImageFile(101),
				// },
				Suggestions: map[uint][]TagSuggestion{
					11: {
						{TagID: 10, Score: 0.9, HasTag: true},
						{TagID: 20, Score: 0.8},
						{TagID: 100, Score: 0.7},
						{TagID: 200, Score: 0.7},
						{TagID: 2, Score: 0.6},
						{TagID: 1, Score: 0.5},
					},
					101: {
						{TagID: 1, Score: 0.5},
						{TagID: 2, Score: 0.4},
						{TagID: 10, Score: 0.3},
						{TagID: 20, Score: 0.2, HasTag: true},
						{TagID: 100, Score: 0.1},
						{TagID: 200, Score: 0},
					},
				},
				AllTags: map[uint]Tag{
					1:   tagBuilder.Build(1),
					2:   tagBuilder.Build(2),
					10:  tagBuilder.Build(10),
					20:  tagBuilder.Build(20),
					100: tagBuilder.Build(100),
					200: tagBuilder.Build(200),
				},
			},
		},
		{
			name: "tag suggestion service returns an error",
			insertTags: []db.Tag{
				{ID: 1, Name: "tag1"},
			},
			insertDBFiles: []db.File{
				{ID: 1, Name: "Directory 1", Type: db.FileTypeDirectory},
				{ID: 10, Name: "Directory 10", Type: db.FileTypeDirectory, ParentID: 1},
				{ID: 11, Name: "image11.jpg", Type: db.FileTypeImage, ParentID: 10},
			},
			imageFileIDs: []uint{11},
			setupMockClient: func(mock *tag_suggestionv1.MockTagSuggestionServiceClient) {
				err := status.New(codes.NotFound, assert.AnError.Error()).Err()
				mock.EXPECT().
					Suggest(gomock.Any(), gomock.Any()).
					Return(nil, err).
					Times(1)
			},
			wantError: status.New(codes.NotFound, assert.AnError.Error()).Err(),
		},
		{
			name:         "no image was found by its ID",
			imageFileIDs: []uint{1},
			setupMockClient: func(mock *tag_suggestionv1.MockTagSuggestionServiceClient) {
				mock.EXPECT().
					Suggest(gomock.Any(), gomock.Any()).
					Times(0)
			},
			wantError: image.ErrImageFileNotFound,
		},
		{
			name:         "empty imageFileIDs returns invalid argument error",
			imageFileIDs: []uint{},
			setupMockClient: func(mock *tag_suggestionv1.MockTagSuggestionServiceClient) {
				mock.EXPECT().
					Suggest(gomock.Any(), gomock.Any()).
					Times(0)
			},
			wantError: xerrors.ErrInvalidArgument,
		},
		{
			name: "unknown gRPC error is logged and returns generic error",
			insertTags: []db.Tag{
				{ID: 1, Name: "tag1"},
			},
			insertDBFiles: []db.File{
				{ID: 1, Name: "Directory 1", Type: db.FileTypeDirectory},
				{ID: 10, Name: "Directory 10", Type: db.FileTypeDirectory, ParentID: 1},
				{ID: 11, Name: "image11.jpg", Type: db.FileTypeImage, ParentID: 10},
			},
			imageFileIDs: []uint{11},
			setupMockClient: func(mock *tag_suggestionv1.MockTagSuggestionServiceClient) {
				err := status.New(codes.Unknown, "unknown server error").Err()
				mock.EXPECT().
					Suggest(gomock.Any(), gomock.Any()).
					Return(nil, err).
					Times(1)
			},
			// The error is a generic "failed to suggest tags" message, not wrapped
			wantAnyError: true,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			tester.dbClient.Truncate(&db.Tag{}, &db.FileTag{}, &db.File{})
			if len(tc.insertDBFiles) > 0 {
				require.NoError(t, db.BatchCreate(tester.dbClient, tc.insertDBFiles))
			}
			if len(tc.insertTags) > 0 {
				require.NoError(t, db.BatchCreate(tester.dbClient, tc.insertTags))
			}
			if len(tc.insertFileTags) > 0 {
				require.NoError(t, db.BatchCreate(tester.dbClient, tc.insertFileTags))
			}

			suggestionService := tester.getTagSuggestionService(t, tc.setupMockClient)
			service := tester.getFrontendService(frontendServiceMocks{
				suggestionService: suggestionService,
			})
			got, err := service.SuggestTags(
				context.Background(),
				tc.imageFileIDs,
			)
			if tc.wantAnyError {
				assert.Error(t, err)
			} else if tc.wantError != nil {
				assert.ErrorIs(t, err, tc.wantError)
			} else {
				assert.NoError(t, err)
			}
			assert.Equal(t, tc.want, got)
		})
	}
}

func TestTagFrontendService_AddSuggestedTags(t *testing.T) {
	tester := newTester(t)
	dbClient := tester.dbClient

	defaultInsertFiles := []db.File{
		{ID: 1, Name: "Directory 1", Type: db.FileTypeDirectory},
		{ID: 11, Name: "image11.jpg", Type: db.FileTypeImage, ParentID: 1},
		{ID: 12, Name: "image12.jpg", Type: db.FileTypeImage, ParentID: 1},
	}

	testCases := []struct {
		name    string
		request AddSuggestedTagsRequest

		insertFiles    []db.File
		insertTags     []db.Tag
		insertFileTags []db.FileTag

		want                 AddSuggestedTagsResponse
		wantInsertedFileTags []db.FileTag
		wantErr              error
	}{
		{
			name: "empty request returns empty response",
			request: AddSuggestedTagsRequest{
				SelectedTags: map[uint][]uint{},
			},
			want: AddSuggestedTagsResponse{},
		},
		{
			name:    "nil selected tags returns empty response",
			request: AddSuggestedTagsRequest{},
			want:    AddSuggestedTagsResponse{},
		},
		{
			name: "Add tags to image files",
			request: AddSuggestedTagsRequest{
				SelectedTags: map[uint][]uint{
					11: {2, 10},
					12: {100},
				},
			},

			insertFiles: defaultInsertFiles,
			insertTags: []db.Tag{
				{ID: 1, Name: "tag1"},
				{ID: 2, Name: "tag2"},
				{ID: 10, Name: "tag 10"},
				{ID: 100, Name: "tag 100"},
			},
			insertFileTags: []db.FileTag{
				{FileID: 11, TagID: 1, AddedBy: db.FileTagAddedByUser},
				{FileID: 12, TagID: 2, AddedBy: db.FileTagAddedByUser},
			},
			want: AddSuggestedTagsResponse{},
			wantInsertedFileTags: []db.FileTag{
				{FileID: 11, TagID: 2, AddedBy: db.FileTagAddedBySuggestion},
				{FileID: 11, TagID: 10, AddedBy: db.FileTagAddedBySuggestion},
				{FileID: 12, TagID: 100, AddedBy: db.FileTagAddedBySuggestion},
			},
		},
		{
			name: "request includes tags that are already added directly",
			request: AddSuggestedTagsRequest{
				SelectedTags: map[uint][]uint{
					11: {2},    // insert a tag successfully
					98: {100},  // image has tag 100 directly - duplicated
					99: {100},  // image has tag 100 directly - duplicated
				},
			},

			insertFiles: slices.Concat(defaultInsertFiles, []db.File{
				{ID: 98, Name: "image98.jpg", Type: db.FileTypeImage, ParentID: 1},
				{ID: 99, Name: "image99.jpg", Type: db.FileTypeImage, ParentID: 1},
			}),
			insertTags: []db.Tag{
				{ID: 1, Name: "tag1"},
				{ID: 2, Name: "tag2"},
				{ID: 100, Name: "tag 100"},
			},
			insertFileTags: []db.FileTag{
				{FileID: 98, TagID: 100, AddedBy: db.FileTagAddedBySuggestion},
				{FileID: 99, TagID: 100, AddedBy: db.FileTagAddedBySuggestion},
			},
			want: AddSuggestedTagsResponse{
				DuplicatedTags: map[uint][]uint{
					98: {100},
					99: {100},
				},
			},
			wantInsertedFileTags: []db.FileTag{
				{FileID: 11, TagID: 2, AddedBy: db.FileTagAddedBySuggestion},
			},
		},
		{
			name: "all tags are duplicated",
			request: AddSuggestedTagsRequest{
				SelectedTags: map[uint][]uint{
					11: {100},
					12: {100},
				},
			},
			insertFiles: defaultInsertFiles,
			insertTags: []db.Tag{
				{ID: 1, Name: "tag1"},
				{ID: 10, Name: "tag 10"},
				{ID: 100, Name: "tag 100"},
			},
			insertFileTags: []db.FileTag{
				{FileID: 11, TagID: 100, AddedBy: db.FileTagAddedByUser},
				{FileID: 12, TagID: 100, AddedBy: db.FileTagAddedByUser},
			},
			want: AddSuggestedTagsResponse{
				DuplicatedTags: map[uint][]uint{
					11: {100},
					12: {100},
				},
			},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			dbClient.Truncate(
				&db.File{},
				&db.Tag{},
				&db.FileTag{},
			)
			if len(tc.insertFiles) > 0 {
				require.NoError(t, db.BatchCreate(dbClient, tc.insertFiles))
			}
			if len(tc.insertTags) > 0 {
				require.NoError(t, db.BatchCreate(dbClient, tc.insertTags))
			}
			if len(tc.insertFileTags) > 0 {
				require.NoError(t, db.BatchCreate(dbClient, tc.insertFileTags))
			}

			suggestionService := tester.getTagSuggestionService(t, func(mock *tag_suggestionv1.MockTagSuggestionServiceClient) {})
			service := tester.getFrontendService(frontendServiceMocks{
				suggestionService: suggestionService,
			})
			got, gotErr := service.AddSuggestedTags(context.Background(), tc.request)
			if tc.wantErr != nil {
				assert.ErrorIs(t, gotErr, tc.wantErr)
				return
			}
			assert.NoError(t, gotErr)
			assert.Equal(t, tc.want, got)

			gotFileTags, err := db.GetAll[db.FileTag](dbClient)
			require.NoError(t, err)
			wantAllFileTags := slices.Concat(tc.insertFileTags, tc.wantInsertedFileTags)
			if len(wantAllFileTags) == 0 {
				assert.Empty(t, gotFileTags)
			} else {
				xassert.ElementsMatch(t,
					wantAllFileTags,
					gotFileTags,
					cmpopts.SortSlices(func(a, b db.FileTag) bool {
						if a.FileID == b.FileID {
							return a.TagID < b.TagID
						}
						return a.FileID < b.FileID
					}),
					cmpopts.IgnoreFields(db.FileTag{}, "CreatedAt"),
				)
			}
		})
	}
}
