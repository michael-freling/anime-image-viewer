package import_images

import (
	"context"
	"testing"

	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/michael-freling/anime-image-viewer/internal/image"
	"github.com/stretchr/testify/assert"
)

func TestBatchTagImporter_importTags(t *testing.T) {
	tester := newTester(t)
	dbTagBuilder := tester.dbClient.NewTagBuilder().
		AddTag(t, db.Tag{ID: 3, Name: "New Tag 1"}).
		AddTag(t, db.Tag{ID: 4, Name: "New Tag 10", ParentID: 3}).
		AddTag(t, db.Tag{ID: 5, Name: "New Tag 100", ParentID: 4})

	testCases := []struct {
		name string

		insertTags   []db.Tag
		importImages []importImage

		want               []image.ImageFile
		wantInsertTags     []db.Tag
		wantInsertFileTags []db.FileTag
		wantError          error
	}{
		{
			name: "succeed to import an image file with a new tag without an error",
			importImages: []importImage{
				{
					image: db.File{ID: 1},
					xmp: &XMP{RDF: RDF{TagsList: []string{
						"New Tag 1/New Tag 10/New Tag 100",
					}}},
				},
			},
			wantInsertTags: []db.Tag{
				dbTagBuilder.Build(t, 3),
				dbTagBuilder.Build(t, 4),
				dbTagBuilder.Build(t, 5),
			},
			wantInsertFileTags: []db.FileTag{
				dbTagBuilder.AddFileTag(t, db.FileTag{FileID: 1, TagID: 5, AddedBy: db.FileTagAddedByImport}).BuildFileTag(t, 1, 5),
			},
		},
		{
			name: "Import images with existing tags without an error",
			insertTags: dbTagBuilder.BuildTags(t,
				db.Tag{ID: 6, Name: "Existing Tag 1"},
				db.Tag{ID: 7, Name: "Existing Tag 10", ParentID: 6},
				db.Tag{ID: 8, Name: "Existing Tag 100", ParentID: 7},
				db.Tag{ID: 9, Name: "Overlapped tag name 100"},
			),
			importImages: []importImage{
				{
					image: db.File{ID: 1},
					xmp: &XMP{RDF: RDF{TagsList: []string{
						// existing tags
						"Existing Tag 1/Existing Tag 10/Existing Tag 100",
						// use the same tag with the root tag
						"Existing Tag 1/New Tag 10/Overlapped tag name 100",
					}}},
				},
				{
					image: db.File{ID: 2},
					xmp: &XMP{RDF: RDF{TagsList: []string{
						// use the same tag from the previous tag
						"Existing Tag 1/New Tag 10/New Tag 100",
					}}},
				},
			},
			wantInsertTags: []db.Tag{
				dbTagBuilder.Build(t, 6),
				dbTagBuilder.Build(t, 7),
				dbTagBuilder.Build(t, 8),
				dbTagBuilder.Build(t, 9),
				// in the previous test, tags with id 3-5 are created
				dbTagBuilder.AddTag(t, db.Tag{ID: 10, Name: "New Tag 10", ParentID: 6}).Build(t, 10),
				dbTagBuilder.AddTag(t, db.Tag{ID: 11, Name: "Overlapped tag name 100", ParentID: 10}).Build(t, 11),
				dbTagBuilder.AddTag(t, db.Tag{ID: 12, Name: "New Tag 100", ParentID: 10}).Build(t, 12),
			},
			wantInsertFileTags: []db.FileTag{
				dbTagBuilder.AddFileTag(t, db.FileTag{FileID: 1, TagID: 8, AddedBy: db.FileTagAddedByImport}).BuildFileTag(t, 1, 8),
				dbTagBuilder.AddFileTag(t, db.FileTag{FileID: 1, TagID: 11, AddedBy: db.FileTagAddedByImport}).BuildFileTag(t, 1, 11),
				dbTagBuilder.AddFileTag(t, db.FileTag{FileID: 2, TagID: 12, AddedBy: db.FileTagAddedByImport}).BuildFileTag(t, 2, 12),
			},
		},
		{
			name: "Unexpected data",
			importImages: []importImage{
				{
					// no image
					xmp: &XMP{RDF: RDF{TagsList: []string{
						"New Tag 1",
					}}},
				},
				{
					// no xmp file
					image: db.File{ID: 9},
				},
				{
					// no tag
					image: db.File{ID: 99},
					xmp:   &XMP{RDF: RDF{TagsList: []string{}}},
				},
				{
					image: db.File{ID: 999},
					xmp: &XMP{RDF: RDF{TagsList: []string{
						// empty tag
						" ",
					}}},
				},
			},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			ctx := context.Background()
			tester.dbClient.Truncate(t, db.Tag{}, db.FileTag{})
			db.LoadTestData(t, tester.dbClient, tc.insertTags)

			batchTagImporter := tester.getBatchTagImporter()
			gotErr := batchTagImporter.importTags(ctx, tc.importImages)
			assert.Equal(t, tc.wantError, gotErr)

			gotTags := db.MustGetAll[db.Tag](t, tester.dbClient)
			assert.Equal(t, tc.wantInsertTags, gotTags)

			gotFileTags := db.MustGetAll[db.FileTag](t, tester.dbClient)
			assert.Equal(t, tc.wantInsertFileTags, gotFileTags)
		})
	}
}
