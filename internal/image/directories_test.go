package image

import (
	"testing"

	"github.com/michael-freling/anime-image-viewer/internal/config"
	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestService_ReadDirectory(t *testing.T) {
	dbClient, err := db.NewClient(db.DSNMemory)
	require.NoError(t, err)
	defer dbClient.Close()
	dbClient.Migrate()

	rootDirectory := "testdata"
	service := DirectoryService{
		dbClient: dbClient,
		config: config.Config{
			DefaultDirectory: rootDirectory,
		},
	}

	testCases := []struct {
		name              string
		insertDirectories []db.Directory
		directoryID       uint
		want              Directory
		wantErr           error
	}{
		{
			name: "directory exists",
			insertDirectories: []db.Directory{
				{ID: 1, Name: "directory1"},
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
			insertDirectories: []db.Directory{
				{ID: 1, Name: "directory1"},
				{ID: 2, Name: "sub directory1", ParentID: 1},
			},
			directoryID: 2,
			want: Directory{
				ID:   2,
				Name: "sub directory1",
				Path: rootDirectory + "/directory1/sub directory1",
			},
		},
		{
			name:        "no directory has been created",
			directoryID: 999,
			wantErr:     ErrDirectoryNotFound,
		},
		{
			name: "a directory doesn't exist",
			insertDirectories: []db.Directory{
				{ID: 1, Name: "directory1"},
			},
			directoryID: 999,
			wantErr:     ErrDirectoryNotFound,
		},
		{
			name: "a parent directory doesn't exist",
			insertDirectories: []db.Directory{
				{ID: 1, Name: "directory1", ParentID: 999},
			},
			directoryID: 1,
			wantErr:     ErrDirectoryNotFound,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			if len(tc.insertDirectories) > 0 {
				require.NoError(t, db.BatchCreate(dbClient, tc.insertDirectories))
				defer func() {
					require.NoError(t, db.Truncate(dbClient, &db.Directory{}))
				}()
			}

			got, gotErr := service.ReadDirectory(tc.directoryID)
			assert.ErrorIs(t, gotErr, tc.wantErr)
			if tc.wantErr != nil {
				return
			}
			assert.Equal(t, tc.want, got)
		})
	}
}
