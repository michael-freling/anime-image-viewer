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

func TestDirectoryReader_ReadImageFiles(t *testing.T) {
	tester := newTester(t)
	testDBClient := tester.dbClient

	fileBuilder := tester.newFileCreator(t).
		CreateDirectory(Directory{ID: 1, Name: "directory1"}).
		CreateImage(ImageFile{ID: 10, Name: "image1.jpg", ParentID: 1}, TestImageFileJpeg).
		CreateImage(ImageFile{ID: 11, Name: "image2.png", ParentID: 1}, TestImageFilePng)

	t.Run("read image files from a directory", func(t *testing.T) {
		testDBClient.Truncate(t, &db.File{})
		db.LoadTestData(t, testDBClient, []db.File{
			fileBuilder.BuildDBDirectory(1),
			fileBuilder.BuildDBImageFile(10),
			fileBuilder.BuildDBImageFile(11),
		})

		reader := tester.getDirectoryReader()
		result, err := reader.ReadImageFiles(1)

		require.NoError(t, err)
		assert.Len(t, result, 2)
	})

	t.Run("read image files from non-existent directory", func(t *testing.T) {
		testDBClient.Truncate(t, &db.File{})

		reader := tester.getDirectoryReader()
		_, err := reader.ReadImageFiles(999)

		assert.ErrorIs(t, err, ErrDirectoryNotFound)
	})

	t.Run("read image files from empty directory", func(t *testing.T) {
		testDBClient.Truncate(t, &db.File{})
		db.LoadTestData(t, testDBClient, []db.File{
			fileBuilder.BuildDBDirectory(1),
		})

		reader := tester.getDirectoryReader()
		result, err := reader.ReadImageFiles(1)

		require.NoError(t, err)
		assert.Empty(t, result)
	})
}

func TestDirectoryReader_ReadImageFiles_WithConversionError(t *testing.T) {
	tester := newTester(t)
	testDBClient := tester.dbClient

	fileBuilder := tester.newFileCreator(t).
		CreateDirectory(Directory{ID: 1, Name: "directory1"}).
		CreateImage(ImageFile{ID: 10, Name: "image1.jpg", ParentID: 1}, TestImageFileJpeg)

	t.Run("returns partial results and error when some images fail conversion", func(t *testing.T) {
		testDBClient.Truncate(t, &db.File{})
		db.LoadTestData(t, testDBClient, []db.File{
			fileBuilder.BuildDBDirectory(1),
			fileBuilder.BuildDBImageFile(10),
			// Image 20 exists in DB but not on disk - will fail conversion
			{ID: 20, Name: "missing_image.jpg", ParentID: 1, Type: db.FileTypeImage},
		})

		reader := tester.getDirectoryReader()
		result, err := reader.ReadImageFiles(1)

		// Should return an error because missing_image.jpg does not exist on disk
		assert.Error(t, err)
		// But should still return the valid image
		assert.Len(t, result, 1)
	})
}

func TestDirectoryReader_ReadImageFilesRecursively(t *testing.T) {
	tester := newTester(t)
	testDBClient := tester.dbClient

	fileBuilder := tester.newFileCreator(t).
		CreateDirectory(Directory{ID: 1, Name: "directory1"}).
		CreateDirectory(Directory{ID: 2, Name: "sub_directory1", ParentID: 1}).
		CreateImage(ImageFile{ID: 10, Name: "image1.jpg", ParentID: 1}, TestImageFileJpeg).
		CreateImage(ImageFile{ID: 11, Name: "image2.jpg", ParentID: 2}, TestImageFileJpeg)

	t.Run("read image files recursively", func(t *testing.T) {
		testDBClient.Truncate(t, &db.File{})
		db.LoadTestData(t, testDBClient, []db.File{
			fileBuilder.BuildDBDirectory(1),
			fileBuilder.BuildDBDirectory(2),
			fileBuilder.BuildDBImageFile(10),
			fileBuilder.BuildDBImageFile(11),
		})

		reader := tester.getDirectoryReader()
		dir, err := reader.ReadDirectory(1)
		require.NoError(t, err)

		result, err := reader.ReadImageFilesRecursively(dir)

		require.NoError(t, err)
		assert.Len(t, result, 2)
	})

	t.Run("read image files recursively with no children", func(t *testing.T) {
		testDBClient.Truncate(t, &db.File{})
		db.LoadTestData(t, testDBClient, []db.File{
			fileBuilder.BuildDBDirectory(1),
			fileBuilder.BuildDBImageFile(10),
		})

		reader := tester.getDirectoryReader()
		dir, err := reader.ReadDirectory(1)
		require.NoError(t, err)

		result, err := reader.ReadImageFilesRecursively(dir)

		require.NoError(t, err)
		assert.Len(t, result, 1)
	})
}

func TestDirectoryReader_ReadImageFilesRecursively_ErrorPropagation(t *testing.T) {
	tester := newTester(t)
	testDBClient := tester.dbClient

	fileBuilder := tester.newFileCreator(t).
		CreateDirectory(Directory{ID: 1, Name: "directory1"}).
		CreateDirectory(Directory{ID: 2, Name: "sub_directory1", ParentID: 1}).
		CreateImage(ImageFile{ID: 10, Name: "image1.jpg", ParentID: 1}, TestImageFileJpeg)

	t.Run("returns error when child directory image fails", func(t *testing.T) {
		testDBClient.Truncate(t, &db.File{})
		db.LoadTestData(t, testDBClient, []db.File{
			fileBuilder.BuildDBDirectory(1),
			fileBuilder.BuildDBDirectory(2),
			fileBuilder.BuildDBImageFile(10),
			// Missing file on disk in sub_directory
			{ID: 20, Name: "missing.jpg", ParentID: 2, Type: db.FileTypeImage},
		})

		reader := tester.getDirectoryReader()
		dir, err := reader.ReadDirectory(1)
		require.NoError(t, err)

		_, err = reader.ReadImageFilesRecursively(dir)
		assert.Error(t, err)
	})
}

func TestDirectoryReader_ReadDirectories(t *testing.T) {
	tester := newTester(t)
	testDBClient := tester.dbClient

	fileBuilder := tester.newFileCreator(t).
		CreateDirectory(Directory{ID: 1, Name: "directory1"}).
		CreateDirectory(Directory{ID: 2, Name: "directory2"}).
		CreateDirectory(Directory{ID: 3, Name: "sub_directory1", ParentID: 1})

	t.Run("read multiple directories", func(t *testing.T) {
		testDBClient.Truncate(t, &db.File{})
		db.LoadTestData(t, testDBClient, []db.File{
			fileBuilder.BuildDBDirectory(1),
			fileBuilder.BuildDBDirectory(2),
			fileBuilder.BuildDBDirectory(3),
		})

		reader := tester.getDirectoryReader()
		result, err := reader.ReadDirectories([]uint{1, 2})

		require.NoError(t, err)
		assert.Len(t, result, 2)
		assert.Equal(t, "directory1", result[1].Name)
		assert.Equal(t, "directory2", result[2].Name)
	})

	t.Run("read directories with non-existent ID", func(t *testing.T) {
		testDBClient.Truncate(t, &db.File{})
		db.LoadTestData(t, testDBClient, []db.File{
			fileBuilder.BuildDBDirectory(1),
		})

		reader := tester.getDirectoryReader()
		result, err := reader.ReadDirectories([]uint{1, 999})

		assert.Error(t, err)
		assert.ErrorIs(t, err, ErrDirectoryNotFound)
		// result still returned for the valid directory
		assert.NotNil(t, result)
		assert.Equal(t, "directory1", result[1].Name)
	})

	t.Run("read sub directory", func(t *testing.T) {
		testDBClient.Truncate(t, &db.File{})
		db.LoadTestData(t, testDBClient, []db.File{
			fileBuilder.BuildDBDirectory(1),
			fileBuilder.BuildDBDirectory(3),
		})

		reader := tester.getDirectoryReader()
		result, err := reader.ReadDirectories([]uint{3})

		require.NoError(t, err)
		assert.Len(t, result, 1)
		assert.Equal(t, "sub_directory1", result[3].Name)
	})
}

func TestDirectoryReader_ReadDirectoryTree(t *testing.T) {
	tester := newTester(t)
	testDBClient := tester.dbClient

	t.Run("empty tree", func(t *testing.T) {
		testDBClient.Truncate(t, &db.File{})

		reader := tester.getDirectoryReader()
		result, err := reader.ReadDirectoryTree()

		require.NoError(t, err)
		assert.Equal(t, uint(0), result.ID)
		assert.Nil(t, result.Children)
	})

	t.Run("tree with directories and images", func(t *testing.T) {
		fileBuilder := tester.newFileCreator(t).
			CreateDirectory(Directory{ID: 1, Name: "dir1"}).
			CreateImage(ImageFile{ID: 10, Name: "img1.jpg", ParentID: 1}, TestImageFileJpeg)

		testDBClient.Truncate(t, &db.File{})
		db.LoadTestData(t, testDBClient, []db.File{
			fileBuilder.BuildDBDirectory(1),
			fileBuilder.BuildDBImageFile(10),
		})

		reader := tester.getDirectoryReader()
		result, err := reader.ReadDirectoryTree()

		require.NoError(t, err)
		require.Len(t, result.Children, 1)
		assert.Equal(t, "dir1", result.Children[0].Name)
		require.Len(t, result.Children[0].ChildImageFiles, 1)
		assert.Equal(t, "img1.jpg", result.Children[0].ChildImageFiles[0].Name)
	})
}

func TestDirectoryReader_ReadInitialDirectory(t *testing.T) {
	tester := newTester(t)
	reader := tester.getDirectoryReader()

	result := reader.ReadInitialDirectory()

	assert.Equal(t, tester.config.ImageRootDirectory, result)
}

func TestDirectoryReader_ReadDirectory_rootDirectory(t *testing.T) {
	tester := newTester(t)
	testDBClient := tester.dbClient
	testDBClient.Truncate(t, &db.File{})

	reader := tester.getDirectoryReader()
	result, err := reader.ReadDirectory(db.RootDirectoryID)

	require.NoError(t, err)
	assert.Equal(t, uint(db.RootDirectoryID), result.ID)
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
