package image

import (
	"testing"

	"github.com/google/go-cmp/cmp/cmpopts"
	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/michael-freling/anime-image-viewer/internal/xassert"
	"github.com/stretchr/testify/assert"
)

func TestDirectoryReader_ReadAncestors(t *testing.T) {
	tester := newTester(t)
	testDBClient := tester.dbClient

	fileBuilder := tester.newFileCreator(t).
		CreateDirectory(Directory{ID: 1, Name: "directory1"}).
		CreateDirectory(Directory{ID: 2, Name: "sub directory1", ParentID: 1}).
		CreateDirectory(Directory{ID: 3, Name: "sub directory2", ParentID: 2}).
		CreateImage(ImageFile{ID: 4, Name: "image file 1", ParentID: 2}, TestImageFileJpeg)

	testCases := []struct {
		name              string
		insertDirectories []db.File
		fileIDs           []uint
		want              map[uint][]Directory
		wantErr           error
	}{
		{
			name: "read ancestors",
			insertDirectories: []db.File{
				fileBuilder.BuildDBDirectory(1),
				fileBuilder.BuildDBDirectory(2),
				fileBuilder.BuildDBDirectory(3),
				fileBuilder.BuildDBImageFile(4),
			},
			fileIDs: []uint{
				1,
				2,
				3,
				4,
			},
			want: map[uint][]Directory{
				2: {
					fileBuilder.BuildDirectory(1),
				},
				3: {
					fileBuilder.BuildDirectory(1),
					fileBuilder.BuildDirectory(2),
				},
				4: {
					fileBuilder.BuildDirectory(1),
					fileBuilder.BuildDirectory(2),
				},
			},
		},
		{
			name: "read ancestors from only one file",
			insertDirectories: []db.File{
				fileBuilder.BuildDBDirectory(1),
				fileBuilder.BuildDBDirectory(2),
				{ID: 4, Name: "image file 1", ParentID: 2, Type: db.FileTypeImage},
			},
			fileIDs: []uint{
				4,
			},
			want: map[uint][]Directory{
				4: {
					fileBuilder.BuildDirectory(1),
					fileBuilder.BuildDirectory(2),
				},
			},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			testDBClient.Truncate(t, &db.File{})
			db.LoadTestData(t, testDBClient, tc.insertDirectories)

			reader := tester.getDirectoryReader()
			got, gotErr := reader.ReadAncestors(tc.fileIDs)
			assert.ErrorIs(t, gotErr, tc.wantErr)
			if tc.wantErr != nil {
				return
			}
			for fileID, want := range tc.want {
				xassert.ElementsMatch(
					t,
					want,
					got[fileID],
					cmpopts.SortSlices(func(a, b Directory) bool {
						return a.ID < b.ID
					}),
					cmpopts.IgnoreFields(Directory{}, "Children", "ChildImageFiles"),
				)
			}
		})
	}
}

func TestDirectoryReader_readDirectory(t *testing.T) {
	tester := newTester(t)
	dbClient := tester.dbClient

	fileBuilder := tester.newFileCreator(t).
		CreateDirectory(Directory{ID: 1, Name: "directory1"}).
		CreateDirectory(Directory{ID: 2, Name: "sub directory1", ParentID: 1})

	testCases := []struct {
		name              string
		insertDirectories []db.File
		directoryID       uint
		want              Directory
		wantErr           error
	}{
		{
			name: "directory exists",
			insertDirectories: []db.File{
				fileBuilder.BuildDBDirectory(1),
			},
			directoryID: 1,
			want:        fileBuilder.BuildDirectory(1),
		},
		{
			name: "sub directory exists",
			insertDirectories: []db.File{
				fileBuilder.BuildDBDirectory(1),
				fileBuilder.BuildDBDirectory(2),
			},
			directoryID: 2,
			want:        fileBuilder.BuildDirectory(2),
		},
		{
			name:        "no directory has been created",
			directoryID: 999,
			wantErr:     ErrDirectoryNotFound,
		},
		{
			name: "a directory doesn't exist",
			insertDirectories: []db.File{
				fileBuilder.BuildDBDirectory(1),
			},
			directoryID: 999,
			wantErr:     ErrDirectoryNotFound,
		},
		{
			name: "a parent directory doesn't exist",
			insertDirectories: []db.File{
				{ID: 1, Name: "directory1", ParentID: 999, Type: db.FileTypeDirectory},
			},
			directoryID: 1,
			wantErr:     ErrDirectoryNotFound,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			dbClient.Truncate(t, &db.File{})
			db.LoadTestData(t, dbClient, tc.insertDirectories)

			reader := tester.getDirectoryReader()
			got, gotErr := reader.ReadDirectory(tc.directoryID)
			assert.ErrorIs(t, gotErr, tc.wantErr)
			if tc.wantErr != nil {
				assert.Zero(t, got)
				return
			}
			assert.Equal(t, tc.want, got)
		})
	}
}
