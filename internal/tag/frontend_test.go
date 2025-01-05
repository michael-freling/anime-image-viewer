package tag

import (
	"context"
	"slices"
	"testing"

	"github.com/google/go-cmp/cmp/cmpopts"
	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/michael-freling/anime-image-viewer/internal/image"
	"github.com/michael-freling/anime-image-viewer/internal/xassert"
	tag_suggestionv1 "github.com/michael-freling/anime-image-viewer/plugins/plugins-protos/gen/go/tag_suggestion/v1"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/mock/gomock"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func TestTagFrontendService_GetAll(t *testing.T) {
	tester := newTester(t)
	dbClient := tester.dbClient

	builder := newTagBuilder().
		add(Tag{ID: 1, Name: "tag1"}).
		add(Tag{ID: 2, Name: "tag2"}).
		add(Tag{ID: 11, Name: "child1 tag under tag1", ParentID: 1}).
		add(Tag{ID: 12, Name: "child2 tag under tag1", ParentID: 1}).
		add(Tag{ID: 111, Name: "child tag under child1", ParentID: 11})

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
				builder.build(1),
				builder.build(2),
			},
		},
		{
			name: "No tag exists",
		},
	}

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

			service := tester.getFrontendService(frontendServiceMocks{})
			got, gotErr := service.GetAll()
			require.NoError(t, gotErr)
			assert.Equal(t, tc.want, got)
		})
	}
}

func TestTagFrontendService_ReadTagsByFileIDs(t *testing.T) {
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
			require.NoError(t, dbClient.Truncate(&db.FileTag{}, &db.File{}))
			if len(tc.insertFiles) > 0 {
				require.NoError(t, db.BatchCreate(dbClient, tc.insertFiles))
			}
			if len(tc.insertFileTags) > 0 {
				require.NoError(t, db.BatchCreate(dbClient, tc.insertFileTags))
			}

			service := tester.getFrontendService(frontendServiceMocks{})
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

	tagBuilder := newTagBuilder().
		add(Tag{ID: 1, Name: "tag1"}).
		add(Tag{ID: 2, Name: "tag2"}).
		add(Tag{ID: 10, Name: "tag 10", ParentID: 1}).
		add(Tag{ID: 20, Name: "tag 11", ParentID: 2}).
		add(Tag{ID: 100, Name: "tag 100", ParentID: 10}).
		add(Tag{ID: 200, Name: "tag 110", ParentID: 20})

	// tester.copyImageFile(t, "image.jpg", filepath.Join("Directory 1", "Directory 10", "image11.jpg"))
	// tester.copyImageFile(t, "image.jpg", filepath.Join("Directory 1", "Directory 10", "Directory 100", "image101.jpg"))

	fileBuilder := tester.newFileCreator().
		CreateDirectory(t, image.Directory{ID: 1, Name: "Directory 1"}).
		CreateDirectory(t, image.Directory{ID: 10, Name: "Directory 10", ParentID: 1}).
		CreateImage(t, image.ImageFile{ID: 11, Name: "image11.jpg", ParentID: 10, ContentType: "image/jpeg"}, image.TestImageFileJpeg).
		CreateDirectory(t, image.Directory{ID: 100, Name: "Directory 100", ParentID: 10}).
		CreateImage(t, image.ImageFile{ID: 101, Name: "image101.jpg", ParentID: 100, ContentType: "image/jpeg"}, image.TestImageFileJpeg)

	// See the full list of how it should behave in /docs/features/tag_suggestion.md
	testCases := []struct {
		name           string
		insertDBFiles  []db.File
		insertTags     []db.Tag
		insertFileTags []db.FileTag

		imageFileIDs    []uint
		setupMockClient func(*tag_suggestionv1.MockTagSuggestionServiceClient)

		want      SuggestTagsResponse
		wantError error
	}{
		{
			name: "multiple image files",
			insertTags: []db.Tag{
				{ID: 1, Name: "tag1"},
				{ID: 2, Name: "tag2"},
				{ID: 10, Name: "tag 10", ParentID: 1},
				{ID: 20, Name: "tag 11", ParentID: 2},
				{ID: 100, Name: "tag 100", ParentID: 10},
				{ID: 200, Name: "tag 110", ParentID: 20},
			},
			insertDBFiles: []db.File{
				{ID: 1, Name: "Directory 1", Type: db.FileTypeDirectory},
				{ID: 10, Name: "Directory 10", Type: db.FileTypeDirectory, ParentID: 1},
				{ID: 11, Name: "image11.jpg", Type: db.FileTypeImage, ParentID: 10},
				{ID: 100, Name: "Directory 100", Type: db.FileTypeDirectory, ParentID: 10},
				{ID: 101, Name: "image101.jpg", Type: db.FileTypeImage, ParentID: 100},
			},
			insertFileTags: []db.FileTag{
				{FileID: 11, TagID: 10},  // an image has a intermediate tag
				{FileID: 100, TagID: 20}, // a directory has an intermediate tag
			},
			imageFileIDs: []uint{
				11,  // an image has a tag
				101, // a directory has a tag but not an image
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
						// a parent tag doesn't matter
						{TagID: 1, Score: 0.5, HasDescendantTag: true},
					},
					101: {
						{TagID: 1, Score: 0.5},
						{TagID: 2, Score: 0.4, HasDescendantTag: true},
						{TagID: 10, Score: 0.3},
						{TagID: 20, Score: 0.2, HasTag: true},
						{TagID: 100, Score: 0.1},
						{TagID: 200, Score: 0},
					},
				},
				AllTags: map[uint]Tag{
					1:   tagBuilder.build(1),
					2:   tagBuilder.build(2),
					10:  tagBuilder.build(10),
					20:  tagBuilder.build(20),
					100: tagBuilder.build(100),
					200: tagBuilder.build(200),
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
			if tc.wantError != nil {
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
				{ID: 10, Name: "tag 10", ParentID: 1},
				{ID: 100, Name: "tag 100", ParentID: 10},
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
			name: "request includes tags that are already added or of which children are added",
			request: AddSuggestedTagsRequest{
				SelectedTags: map[uint][]uint{
					11:  {2},        // insert a tag successfully
					98:  {1, 2},     // an image has a descendant tag
					99:  {100},      // an image has a tag
					998: {1},        // an ancestor has a descendant tag
					999: {100, 200}, // an ancestor has a tag
				},
			},

			insertFiles: slices.Concat(defaultInsertFiles, []db.File{
				{ID: 10, Name: "Directory 10", Type: db.FileTypeDirectory, ParentID: 1},
				{ID: 98, Name: "image98.jpg", Type: db.FileTypeImage, ParentID: 1},
				{ID: 99, Name: "image99.jpg", Type: db.FileTypeImage, ParentID: 1},

				{ID: 998, Name: "image998.jpg", Type: db.FileTypeImage, ParentID: 10},
				{ID: 999, Name: "image999.jpg", Type: db.FileTypeImage, ParentID: 10},
			}),
			insertTags: []db.Tag{
				{ID: 1, Name: "tag1"},
				{ID: 2, Name: "tag2"},
				{ID: 10, Name: "tag 10", ParentID: 1},
				{ID: 20, Name: "tag 20", ParentID: 2},
				{ID: 100, Name: "tag 100", ParentID: 10},
				{ID: 200, Name: "tag 200", ParentID: 20},
			},
			insertFileTags: []db.FileTag{
				{FileID: 10, TagID: 100, AddedBy: db.FileTagAddedBySuggestion},
				{FileID: 10, TagID: 200, AddedBy: db.FileTagAddedBySuggestion},
				{FileID: 98, TagID: 100, AddedBy: db.FileTagAddedBySuggestion},
				{FileID: 98, TagID: 200, AddedBy: db.FileTagAddedBySuggestion},
				{FileID: 99, TagID: 100, AddedBy: db.FileTagAddedBySuggestion},
				{FileID: 99, TagID: 200, AddedBy: db.FileTagAddedBySuggestion},
			},
			want: AddSuggestedTagsResponse{
				DuplicatedTags: map[uint][]uint{
					98:  {1, 2},
					99:  {100},
					998: {1},
					999: {100, 200},
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
					11: {10},
					12: {100},
				},
			},
			insertFiles: defaultInsertFiles,
			insertTags: []db.Tag{
				{ID: 1, Name: "tag1"},
				{ID: 10, Name: "tag 10", ParentID: 1},
				{ID: 100, Name: "tag 100", ParentID: 10},
			},
			insertFileTags: []db.FileTag{
				{FileID: 11, TagID: 100, AddedBy: db.FileTagAddedByUser},
				{FileID: 12, TagID: 100, AddedBy: db.FileTagAddedByUser},
			},
			want: AddSuggestedTagsResponse{
				DuplicatedTags: map[uint][]uint{
					11: {10},
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
			xassert.ElementsMatch(t,
				slices.Concat(tc.insertFileTags, tc.wantInsertedFileTags),
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
