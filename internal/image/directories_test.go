package image

import (
	"os"
	"testing"

	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/michael-freling/anime-image-viewer/internal/xerrors"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestService_CreateDirectory(t *testing.T) {
	tester := newTester(t)
	testDBClient := tester.dbClient

	rootDirectory := tester.config.ImageRootDirectory

	service := tester.getDirectoryService()

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
			testDBClient.Truncate(t, &db.File{})
			db.LoadTestData(t, testDBClient, tc.createDirectoriesInDB)

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
	tester := newTester(t)
	testDBClient := tester.dbClient

	fileBuilder := tester.newFileBuilder().
		AddDirectory(Directory{ID: 1, Name: "directory1"}).
		AddDirectory(Directory{ID: 10, Name: "directory10", ParentID: 1}).
		AddDirectory(Directory{ID: 100, Name: "directory100", ParentID: 10})

	rootDirectory := tester.config.ImageRootDirectory
	service := tester.getDirectoryService()

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
				fileBuilder.BuildDBDirectory(t, 1),
			},
			makeDirectories: []string{
				"directory1",
			},
			directoryID: 1,
			newName:     "new_directory1",
			want: func() Directory {
				want := fileBuilder.BuildDirectory(1)
				want.updateName("new_directory1")
				return want
			}(),
		},
		{
			name: "update a directory name to the same name under different directory",
			insertDirectories: []db.File{
				fileBuilder.BuildDBDirectory(t, 1),
				fileBuilder.BuildDBDirectory(t, 10),
				{ID: 11, Name: "same_name_under_different_directory", ParentID: 1, Type: db.FileTypeDirectory},
				fileBuilder.BuildDBDirectory(t, 100),
			},
			makeDirectories: []string{
				"directory1",
				"directory1/directory10",
				"directory1/same_name_under_different_directory",
				"directory1/directory10/directory100",
			},
			directoryID: 100,
			newName:     "same_name_under_different_directory",
			want: func() Directory {
				dir := fileBuilder.BuildDirectory(100)
				dir.updateName("same_name_under_different_directory")
				return dir
			}(),
		},
		{
			name: "update a directory name to the same name with different cases",
			insertDirectories: []db.File{
				fileBuilder.BuildDBDirectory(t, 1),
			},
			makeDirectories: []string{"directory1"},
			directoryID:     1,
			newName:         "Directory1",
			want: func() Directory {
				dir := fileBuilder.BuildDirectory(1)
				dir.updateName("Directory1")
				return dir
			}(),
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
			wantErr:         xerrors.ErrInvalidArgument,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			testDBClient.Truncate(t, &db.File{})
			db.LoadTestData(t, testDBClient, tc.insertDirectories)

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
