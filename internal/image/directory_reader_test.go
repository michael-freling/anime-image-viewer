package image

import (
	"testing"

	"github.com/google/go-cmp/cmp/cmpopts"
	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/michael-freling/anime-image-viewer/internal/xassert"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDirectoryReader_ReadAncestors(t *testing.T) {
	tester := newTester(t)
	dbClient := tester.dbClient

	rootDirectory := tester.config.ImageRootDirectory
	reader := tester.getDirectoryReader()

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
				{ID: 1, Name: "directory1", Type: db.FileTypeDirectory},
				{ID: 2, Name: "sub directory1", ParentID: 1, Type: db.FileTypeDirectory},
				{ID: 3, Name: "sub directory2", ParentID: 2, Type: db.FileTypeDirectory},
				{ID: 4, Name: "image file 1", ParentID: 2, Type: db.FileTypeImage},
			},
			fileIDs: []uint{
				1,
				2,
				3,
				4,
			},
			want: map[uint][]Directory{
				2: {
					{ID: 1, Name: "directory1", Path: rootDirectory + "/directory1"},
				},
				3: {
					{ID: 1, Name: "directory1", Path: rootDirectory + "/directory1"},
					{ID: 2, Name: "sub directory1", ParentID: 1, Path: rootDirectory + "/directory1/sub directory1"},
				},
				4: {
					{ID: 1, Name: "directory1", Path: rootDirectory + "/directory1"},
					{ID: 2, Name: "sub directory1", ParentID: 1, Path: rootDirectory + "/directory1/sub directory1"},
				},
			},
		},
		{
			name: "read ancestors from only one file",
			insertDirectories: []db.File{
				{ID: 1, Name: "directory1", Type: db.FileTypeDirectory},
				{ID: 2, Name: "sub directory1", ParentID: 1, Type: db.FileTypeDirectory},
				{ID: 4, Name: "image file 1", ParentID: 2, Type: db.FileTypeImage},
			},
			fileIDs: []uint{
				4,
			},
			want: map[uint][]Directory{
				4: {
					{ID: 1, Name: "directory1", Path: rootDirectory + "/directory1"},
					{ID: 2, Name: "sub directory1", ParentID: 1, Path: rootDirectory + "/directory1/sub directory1"},
				},
			},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			dbClient.Truncate(&db.File{})
			if len(tc.insertDirectories) > 0 {
				require.NoError(t, db.BatchCreate(dbClient, tc.insertDirectories))
			}

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

	rootDirectory := tester.config.ImageRootDirectory
	reader := tester.getDirectoryReader()

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
				{ID: 1, Name: "directory1", Type: db.FileTypeDirectory},
			},
			directoryID: 1,
			want: Directory{
				ID:   1,
				Name: "directory1",
				Path: rootDirectory + "/directory1",
			},
		},
		{
			name: "sub directory exists",
			insertDirectories: []db.File{
				{ID: 1, Name: "directory1", Type: db.FileTypeDirectory},
				{ID: 2, Name: "sub directory1", ParentID: 1, Type: db.FileTypeDirectory},
			},
			directoryID: 2,
			want: Directory{
				ID:       2,
				Name:     "sub directory1",
				ParentID: 1,
				Path:     rootDirectory + "/directory1/sub directory1",
			},
		},
		{
			name:        "no directory has been created",
			directoryID: 999,
			wantErr:     ErrDirectoryNotFound,
		},
		{
			name: "a directory doesn't exist",
			insertDirectories: []db.File{
				{ID: 1, Name: "directory1", Type: db.FileTypeDirectory},
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
			require.NoError(t, dbClient.Truncate(&db.File{}))
			if len(tc.insertDirectories) > 0 {
				require.NoError(t, db.BatchCreate(dbClient, tc.insertDirectories))
			}

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
