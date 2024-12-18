package image

import (
	"os"
	"testing"

	"github.com/google/go-cmp/cmp/cmpopts"
	"github.com/michael-freling/anime-image-viewer/frontend/src/xassert"
	"github.com/michael-freling/anime-image-viewer/internal/config"
	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestService_CreateDirectory(t *testing.T) {
	rootDirectory := t.TempDir()

	tester := newTester(t)
	dbClient := tester.dbClient
	require.NoError(t, dbClient.Truncate(&db.File{}))

	service := DirectoryService{
		dbClient: dbClient,
		config: config.Config{
			ImageRootDirectory: rootDirectory,
		},
	}

	testCases := []struct {
		name                  string
		createDirectoriesInDB []db.File
		createDirectoriesInFS []string

		directoryName string
		parentID      uint
		want          Directory
		wantInsert    db.File
		wantErr       error
	}{
		// top root directory cases
		{
			name:          "create a directory",
			directoryName: "directory1",
			want: Directory{
				Name:     "directory1",
				Path:     rootDirectory + "/directory1",
				ParentID: db.RootDirectoryID,
			},
			wantInsert: db.File{
				Name: "directory1",
				Type: db.FileTypeDirectory,
			},
		},
		{
			name: "create a directory exists in a db",
			createDirectoriesInDB: []db.File{
				{Name: "directory1", Type: db.FileTypeDirectory},
			},
			directoryName: "directory1",
			wantErr:       ErrDirectoryAlreadyExists,
		},
		{
			name:                  "create a directory not exists in a db but as a file",
			createDirectoriesInFS: []string{"directory1"},
			directoryName:         "directory1",
			wantErr:               ErrDirectoryAlreadyExists,
		},
		{
			name: "create a directory exists in a db but not as a file",
			createDirectoriesInDB: []db.File{
				{Name: "directory1", Type: db.FileTypeDirectory},
			},
			directoryName: "directory1",
			wantErr:       ErrDirectoryAlreadyExists,
		},

		// directory under a parent
		{
			name: "create a directory under a directory",
			createDirectoriesInDB: []db.File{
				{ID: 1, Name: "directory1", Type: db.FileTypeDirectory},
			},
			createDirectoriesInFS: []string{"directory1"},
			directoryName:         "child directory1",
			parentID:              1,

			want: Directory{
				Name:     "child directory1",
				Path:     rootDirectory + "/directory1/child directory1",
				ParentID: 1,
			},
			wantInsert: db.File{
				Name:     "child directory1",
				ParentID: 1,
				Type:     db.FileTypeDirectory,
			},
		},
		{
			name: "create a directory exists in a db under a parent directory",
			createDirectoriesInDB: []db.File{
				{ID: 1, Name: "directory1", Type: db.FileTypeDirectory},
				{ID: 2, Name: "child directory1", ParentID: 1, Type: db.FileTypeDirectory},
			},
			createDirectoriesInFS: []string{"directory1"},
			directoryName:         "child directory1",
			parentID:              1,
			wantErr:               ErrDirectoryAlreadyExists,
		},
		{
			name: "create a directory under a parent not exists in a db but as a file",
			createDirectoriesInDB: []db.File{
				{ID: 1, Name: "directory1", Type: db.FileTypeDirectory},
			},
			createDirectoriesInFS: []string{"directory1", "directory1/child directory1"},
			directoryName:         "child directory1",
			parentID:              1,
			wantErr:               ErrDirectoryAlreadyExists,
		},
		{
			name: "create a directory under a parent exists in a db but not as a file",
			createDirectoriesInDB: []db.File{
				{ID: 1, Name: "directory1", Type: db.FileTypeDirectory},
				{ID: 2, Name: "child directory1", ParentID: 1, Type: db.FileTypeDirectory},
			},
			createDirectoriesInFS: []string{"directory1"},
			directoryName:         "child directory1",
			parentID:              1,
			wantErr:               ErrDirectoryAlreadyExists,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			t.Cleanup(func() {
				require.NoError(t, dbClient.Truncate(&db.File{}))
			})

			if len(tc.createDirectoriesInDB) > 0 {
				require.NoError(t, db.BatchCreate(dbClient, tc.createDirectoriesInDB))
			}
			if len(tc.createDirectoriesInFS) > 0 {
				for _, dir := range tc.createDirectoriesInFS {
					require.NoError(t, os.Mkdir(rootDirectory+"/"+dir, 0755))
				}
				t.Cleanup(func() {
					for _, dir := range tc.createDirectoriesInFS {
						require.NoError(t, os.RemoveAll(rootDirectory+"/"+dir))
					}
				})
			}

			got, gotErr := service.CreateDirectory(tc.directoryName, tc.parentID)
			assert.ErrorIs(t, gotErr, tc.wantErr)

			if tc.wantErr != nil {
				assert.Equal(t, Directory{}, got)
				return
			}

			t.Cleanup(func() {
				os.RemoveAll(got.Path)
			})

			tc.want.ID = got.ID
			assert.Equal(t, tc.want, got)

			gotInsert, err := db.FindByValue(service.dbClient, db.File{
				Name: tc.directoryName,
			})
			require.NoError(t, err)
			tc.wantInsert.ID = gotInsert.ID
			tc.wantInsert.CreatedAt = gotInsert.CreatedAt
			tc.wantInsert.UpdatedAt = gotInsert.UpdatedAt
			assert.Equal(t, tc.wantInsert, gotInsert)
		})
	}
}

func TestDirectoryService_UpdateName(t *testing.T) {
	dbClient, err := db.NewClient(db.DSNMemory)
	require.NoError(t, err)
	defer dbClient.Close()
	dbClient.Migrate()
	require.NoError(t, dbClient.Truncate(&db.File{}))

	rootDirectory := t.TempDir()
	service := DirectoryService{
		dbClient: dbClient,
		config: config.Config{
			ImageRootDirectory: rootDirectory,
		},
	}

	testCases := []struct {
		name              string
		insertDirectories []db.File
		makeDirectories   []string
		directoryID       uint
		newName           string
		want              Directory
		wantErr           error
	}{
		{
			name: "update a directory name",
			insertDirectories: []db.File{
				{ID: 1, Name: "directory1", Type: db.FileTypeDirectory},
			},
			makeDirectories: []string{
				"directory1",
			},
			directoryID: 1,
			newName:     "new_directory1",
			want: Directory{
				ID:   1,
				Name: "new_directory1",
				Path: rootDirectory + "/new_directory1",
			},
		},
		{
			name: "update a directory name to the same name under different directory",
			insertDirectories: []db.File{
				{ID: 1, Name: "directory1", Type: db.FileTypeDirectory},
				{ID: 2, Name: "directory2", Type: db.FileTypeDirectory},
				{ID: 11, Name: "same_name_under_different_directory", ParentID: 1, Type: db.FileTypeDirectory},
				{ID: 12, Name: "directory21", ParentID: 2, Type: db.FileTypeDirectory},
			},
			makeDirectories: []string{
				"directory1",
				"directory2",
				"directory1/same_name_under_different_directory",
				"directory2/directory21",
			},
			directoryID: 12,
			newName:     "same_name_under_different_directory",
			want: Directory{
				ID:       12,
				Name:     "same_name_under_different_directory",
				Path:     rootDirectory + "/directory2/same_name_under_different_directory",
				ParentID: 2,
			},
		},
		{
			name: "update a directory name to the same name with different cases",
			insertDirectories: []db.File{
				{ID: 1, Name: "directory1", Type: db.FileTypeDirectory},
			},
			makeDirectories: []string{"directory1"},
			directoryID:     1,
			newName:         "Directory1",
			want: Directory{
				ID:   1,
				Name: "Directory1",
				Path: rootDirectory + "/Directory1",
			},
		},
		{
			name: "parent directory doesn't exist in the DB",
			insertDirectories: []db.File{
				{ID: 1, Name: "directory1", ParentID: 2, Type: db.FileTypeDirectory},
			},
			makeDirectories: []string{"directory1"},
			directoryID:     1,
			newName:         "new_directory",
			wantErr:         ErrDirectoryNotFound,
		},
		{
			name: "A directory doesn't exist in the DB",
			insertDirectories: []db.File{
				{ID: 1, Name: "directory1", Type: db.FileTypeDirectory},
			},
			makeDirectories: []string{"directory1"},
			directoryID:     999,
			newName:         "directory2",
			wantErr:         ErrDirectoryNotFound,
		},
		{
			name: "A directory doesn't exist in the FS",
			insertDirectories: []db.File{
				{ID: 1, Name: "directory1", Type: db.FileTypeDirectory},
			},
			makeDirectories: []string{"directory2"},
			directoryID:     1,
			newName:         "directory3",
			wantErr:         ErrDirectoryNotFound,
		},
		{
			name: "update a directory name to the same name with other directory in the DB",
			insertDirectories: []db.File{
				{ID: 1, Name: "directory1", Type: db.FileTypeDirectory},
				{ID: 2, Name: "new_directory", Type: db.FileTypeDirectory},
			},
			makeDirectories: []string{"directory1"},
			directoryID:     1,
			newName:         "new_directory",
			wantErr:         ErrDirectoryAlreadyExists,
		},
		{
			name: "update a directory name to the same name with other directory in the FS",
			insertDirectories: []db.File{
				{ID: 1, Name: "directory1", Type: db.FileTypeDirectory},
			},
			makeDirectories: []string{"directory1", "new_directory"},
			directoryID:     1,
			newName:         "new_directory",
			wantErr:         ErrDirectoryAlreadyExists,
		},
		{
			name: "Updates a directory with the same directory name",
			insertDirectories: []db.File{
				{ID: 1, Name: "directory1", Type: db.FileTypeDirectory},
			},
			makeDirectories: []string{"directory1"},
			directoryID:     1,
			newName:         "directory1",
			wantErr:         ErrInvalidArgument,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			if len(tc.insertDirectories) > 0 {
				require.NoError(t, db.BatchCreate(dbClient, tc.insertDirectories))
				t.Cleanup(func() {
					require.NoError(t, dbClient.Truncate(&db.File{}))
				})
			}
			if len(tc.makeDirectories) > 0 {
				for _, dir := range tc.makeDirectories {
					require.NoError(t, os.Mkdir(rootDirectory+"/"+dir, 0755))
				}
				t.Cleanup(func() {
					for _, dir := range tc.makeDirectories {
						require.NoError(t, os.RemoveAll(rootDirectory+"/"+dir))
					}
				})
			}

			got, gotErr := service.UpdateName(tc.directoryID, tc.newName)
			assert.ErrorIs(t, gotErr, tc.wantErr)
			if tc.wantErr != nil {
				return
			}
			assert.Equal(t, tc.want, got)
		})
	}

}

func TestDirectoryService_readAncestors(t *testing.T) {
	tester := newTester(t)
	dbClient := tester.dbClient

	rootDirectory := t.TempDir()
	service := DirectoryService{
		dbClient: dbClient,
		config: config.Config{
			ImageRootDirectory: rootDirectory,
		},
	}

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

			got, gotErr := service.readAncestors(tc.fileIDs)
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

func TestDirectoryService_ReadDirectory(t *testing.T) {
	dbClient, err := db.NewClient(db.DSNMemory)
	require.NoError(t, err)
	defer dbClient.Close()
	dbClient.Migrate()

	rootDirectory := "testdata"
	service := DirectoryService{
		dbClient: dbClient,
		config: config.Config{
			ImageRootDirectory: rootDirectory,
		},
	}

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

			got, gotErr := service.readDirectory(tc.directoryID)
			assert.ErrorIs(t, gotErr, tc.wantErr)
			if tc.wantErr != nil {
				assert.Zero(t, got)
				return
			}
			assert.Equal(t, tc.want, got)
		})
	}
}
