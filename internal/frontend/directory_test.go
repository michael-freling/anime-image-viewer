package frontend

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/michael-freling/anime-image-viewer/internal/image"
	"github.com/michael-freling/anime-image-viewer/internal/xerrors"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestService_ReadDirectoryTree(t *testing.T) {
	tester := newTester(t)

	testCases := []struct {
		name      string
		want      Directory
		wantError error
	}{
		{
			name: "read an initial directory tree",
			want: Directory{
				Name: tester.config.ImageRootDirectory,
				Path: tester.config.ImageRootDirectory,
			},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			tester.dbClient.Truncate(t, &db.File{})
			service := tester.getDirectoryService()

			got, gotErr := service.ReadDirectoryTree()
			assert.ErrorIs(t, gotErr, tc.wantError)
			if tc.wantError != nil {
				return
			}
			assert.Equal(t, tc.want, got)
		})
	}
}

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
				Name: "directory1",
				Path: rootDirectory + "/directory1",
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
			wantErr:       image.ErrDirectoryAlreadyExists,
		},
		{
			name:                  "create a directory not exists in a db but as a file",
			createDirectoriesInFS: []string{"directory1"},
			directoryName:         "directory1",
			wantErr:               image.ErrDirectoryAlreadyExists,
		},
		{
			name: "create a directory exists in a db but not as a file",
			createDirectoriesInDB: []db.File{
				{Name: "directory1", Type: db.FileTypeDirectory},
			},
			directoryName: "directory1",
			wantErr:       image.ErrDirectoryAlreadyExists,
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
				Name: "child directory1",
				Path: rootDirectory + "/directory1/child directory1",
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
			wantErr:               image.ErrDirectoryAlreadyExists,
		},
		{
			name: "create a directory under a parent not exists in a db but as a file",
			createDirectoriesInDB: []db.File{
				{ID: 1, Name: "directory1", Type: db.FileTypeDirectory},
			},
			createDirectoriesInFS: []string{"directory1", "directory1/child directory1"},
			directoryName:         "child directory1",
			parentID:              1,
			wantErr:               image.ErrDirectoryAlreadyExists,
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
			wantErr:               image.ErrDirectoryAlreadyExists,
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

			ctx := context.Background()
			got, gotErr := service.CreateDirectory(ctx, tc.directoryName, tc.parentID)
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

	fileBuilder := tester.newFileCreator().
		CreateDirectory(t, image.Directory{ID: 1, Name: "directory1"}).
		CreateDirectory(t, image.Directory{ID: 10, Name: "directory10", ParentID: 1}).
		CreateDirectory(t, image.Directory{ID: 100, Name: "directory100", ParentID: 10}).
		CreateDirectory(t, image.Directory{ID: 1001, Name: "directory 1001", ParentID: 100}).
		CreateDirectory(t, image.Directory{ID: 1002, Name: "directory 1002", ParentID: 100})

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
				fileBuilder.BuildDBDirectory(t, 10),
				fileBuilder.BuildDBDirectory(t, 100),
				fileBuilder.BuildDBDirectory(t, 1001),
			},
			directoryID: 1001,
			newName:     "new_directory1",
			want: func() Directory {
				want := fileBuilder.BuildDirectory(1001)
				want.UpdateName("new_directory1")
				return newDirectoryConverter().convertDirectory(want)
			}(),
		},
		{
			name: "update a directory name to the same name under different directory",
			insertDirectories: []db.File{
				fileBuilder.BuildDBDirectory(t, 1),
				fileBuilder.BuildDBDirectory(t, 10),
				{ID: 11, Name: "same_name_under_different_directory", ParentID: 1, Type: db.FileTypeDirectory},
				fileBuilder.BuildDBDirectory(t, 100),
				fileBuilder.BuildDBDirectory(t, 1002),
			},
			makeDirectories: []string{
				filepath.Join(fileBuilder.BuildDirectory(1).Name, "same_name_under_different_directory"),
			},
			directoryID: 1002,
			newName:     "same_name_under_different_directory",
			want: func() Directory {
				dir := fileBuilder.BuildDirectory(1002)
				dir.UpdateName("same_name_under_different_directory")
				return newDirectoryConverter().convertDirectory(dir)
			}(),
		},
		{
			name: "update a directory name to the same name with different cases",
			insertDirectories: []db.File{
				fileBuilder.BuildDBDirectory(t, 1),
				fileBuilder.BuildDBDirectory(t, 10),
				fileBuilder.BuildDBDirectory(t, 100),
				{ID: 1003, Name: "directory1", ParentID: 100, Type: db.FileTypeDirectory},
			},
			makeDirectories: []string{
				filepath.Join(
					fileBuilder.BuildDirectory(1).Name,
					fileBuilder.BuildDirectory(10).Name,
					fileBuilder.BuildDirectory(100).Name,
					"directory1",
				),
			},
			directoryID: 1003,
			newName:     "Directory1",
			want: Directory{
				ID:   1003,
				Name: "Directory1",
				Path: filepath.Join(fileBuilder.BuildDirectory(100).Path, "Directory1"),
			},
		},
		{
			name: "parent directory doesn't exist in the DB",
			insertDirectories: []db.File{
				{ID: 9, Name: "directory 9", ParentID: 999, Type: db.FileTypeDirectory},
			},
			makeDirectories: []string{"directory 9"},
			directoryID:     9,
			newName:         "new_directory",
			wantErr:         image.ErrDirectoryNotFound,
		},
		{
			name: "A directory doesn't exist in the DB",
			insertDirectories: []db.File{
				{ID: 9, Name: "directory 999", Type: db.FileTypeDirectory},
			},
			makeDirectories: []string{"directory 999"},
			directoryID:     999,
			newName:         "something new",
			wantErr:         image.ErrDirectoryNotFound,
		},
		{
			name: "A directory doesn't exist in the FS",
			insertDirectories: []db.File{
				{ID: 9, Name: "directory 9", Type: db.FileTypeDirectory},
			},
			directoryID: 9,
			newName:     "something new",
			wantErr:     image.ErrDirectoryNotFound,
		},
		{
			name: "update a directory name to the same name with other directory in the DB",
			insertDirectories: []db.File{
				fileBuilder.BuildDBDirectory(t, 1),
				fileBuilder.BuildDBDirectory(t, 10),
				{ID: 99, Name: "directory 99", ParentID: 1, Type: db.FileTypeDirectory},
			},
			makeDirectories: []string{
				filepath.Join(fileBuilder.BuildDirectory(1).Name, "directory 99"),
			},
			directoryID: 10,
			newName:     "directory 99",
			wantErr:     image.ErrDirectoryAlreadyExists,
		},
		{
			name: "update a directory name to the same name with other directory in the FS",
			insertDirectories: []db.File{
				fileBuilder.BuildDBDirectory(t, 1),
			},
			makeDirectories: []string{
				"new_directory",
			},
			directoryID: 1,
			newName:     "new_directory",
			wantErr:     image.ErrDirectoryAlreadyExists,
		},
		{
			name: "Updates a directory with the same directory name",
			insertDirectories: []db.File{
				fileBuilder.BuildDBDirectory(t, 1),
			},
			directoryID: 1,
			newName:     fileBuilder.BuildDBDirectory(t, 1).Name,
			wantErr:     xerrors.ErrInvalidArgument,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			testDBClient.Truncate(t, &db.File{})
			db.LoadTestData(t, testDBClient, tc.insertDirectories)

			if len(tc.makeDirectories) > 0 {
				for _, dir := range tc.makeDirectories {
					require.NoError(t, os.Mkdir(
						filepath.Join(rootDirectory, dir), 0755),
					)
				}
				t.Cleanup(func() {
					for _, dir := range tc.makeDirectories {
						require.NoError(t, os.RemoveAll(
							filepath.Join(
								rootDirectory,
								dir,
							),
						))
					}
				})
			}

			ctx := context.Background()
			got, gotErr := service.UpdateName(ctx, tc.directoryID, tc.newName)
			assert.ErrorIs(t, gotErr, tc.wantErr)
			if tc.wantErr != nil {
				return
			}
			assert.Equal(t, tc.want, got)
		})
	}
}
