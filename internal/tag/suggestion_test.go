package tag

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/michael-freling/anime-image-viewer/internal/image"
	tag_suggestionv1 "github.com/michael-freling/anime-image-viewer/plugins/plugins-protos/gen/go/tag_suggestion/v1"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/mock/gomock"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func TestTagSuggestionService_Suggest(t *testing.T) {
	tester := newTester(t)

	tagBuilder := newTagBuilder().
		add(Tag{ID: 1, Name: "tag1"}, 0).
		add(Tag{ID: 2, Name: "tag2"}, 0).
		add(Tag{ID: 10, Name: "tag 10"}, 1).
		add(Tag{ID: 20, Name: "tag 11"}, 2).
		add(Tag{ID: 100, Name: "tag 100"}, 10).
		add(Tag{ID: 200, Name: "tag 110"}, 20)

	tester.copyImageFile(t, "image.jpg", filepath.Join("Directory 1", "Directory 10", "image11.jpg"))
	tester.copyImageFile(t, "image.jpg", filepath.Join("Directory 1", "Directory 10", "Directory 100", "image101.jpg"))

	fileBuilder := tester.newFileBuilder().
		addDirectory(image.Directory{ID: 1, Name: "Directory 1"}).
		addDirectory(image.Directory{ID: 10, Name: "Directory 10", ParentID: 1}).
		addImageFile(image.ImageFile{ID: 11, Name: "image11.jpg", ParentID: 10, ContentType: "image/jpeg"}).
		addDirectory(image.Directory{ID: 100, Name: "Directory 100", ParentID: 10}).
		addImageFile(image.ImageFile{ID: 101, Name: "image101.jpg", ParentID: 100, ContentType: "image/jpeg"})

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
							fileBuilder.buildImageFile(11).LocalFilePath,
							fileBuilder.buildImageFile(101).LocalFilePath,
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
				ImageFiles: []image.ImageFile{
					fileBuilder.buildImageFile(11),
					fileBuilder.buildImageFile(101),
				},
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
				err := status.New(codes.Unknown, assert.AnError.Error()).Err()
				mock.EXPECT().
					Suggest(gomock.Any(), gomock.Any()).
					Return(nil, err).
					Times(1)
			},
			wantError: status.New(codes.Unknown, assert.AnError.Error()).Err(),
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

			service := tester.getTagSuggestionService(t, tc.setupMockClient)
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
