package image

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/michael-freling/anime-image-viewer/internal/config"
	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCopy(t *testing.T) {
	t.Run("copy a file successfully", func(t *testing.T) {
		tmpDir := t.TempDir()
		sourceFilePath := filepath.Join("..", "..", "testdata", "image.jpg")
		destFilePath := filepath.Join(tmpDir, "copied.jpg")

		nBytes, err := Copy(sourceFilePath, destFilePath)

		require.NoError(t, err)
		assert.Greater(t, nBytes, int64(0))

		sourceStat, err := os.Stat(sourceFilePath)
		require.NoError(t, err)
		destStat, err := os.Stat(destFilePath)
		require.NoError(t, err)
		assert.Equal(t, sourceStat.Size(), destStat.Size())
		assert.Equal(t, sourceStat.Mode(), destStat.Mode())
		assert.Equal(t, sourceStat.ModTime(), destStat.ModTime())
	})

	t.Run("source file does not exist", func(t *testing.T) {
		tmpDir := t.TempDir()
		_, err := Copy("/nonexistent/file.jpg", filepath.Join(tmpDir, "dest.jpg"))
		assert.Error(t, err)
	})

	t.Run("destination directory does not exist", func(t *testing.T) {
		sourceFilePath := filepath.Join("..", "..", "testdata", "image.jpg")
		_, err := Copy(sourceFilePath, "/nonexistent/dir/dest.jpg")
		assert.Error(t, err)
	})

	t.Run("source file not readable (permission denied)", func(t *testing.T) {
		tmpDir := t.TempDir()
		sourceFilePath := filepath.Join(tmpDir, "unreadable.jpg")
		require.NoError(t, os.WriteFile(sourceFilePath, []byte("test data"), 0644))
		require.NoError(t, os.Chmod(sourceFilePath, 0000))
		t.Cleanup(func() {
			os.Chmod(sourceFilePath, 0644)
		})

		_, err := Copy(sourceFilePath, filepath.Join(tmpDir, "dest.jpg"))
		assert.Error(t, err)
	})
}

func TestIsSupportedImageFile(t *testing.T) {
	t.Run("jpeg file is supported", func(t *testing.T) {
		filePath := filepath.Join("..", "..", "testdata", "image.jpg")
		err := IsSupportedImageFile(filePath)
		assert.NoError(t, err)
	})

	t.Run("png file is supported", func(t *testing.T) {
		filePath := filepath.Join("..", "..", "testdata", "image.png")
		err := IsSupportedImageFile(filePath)
		assert.NoError(t, err)
	})

	t.Run("text file is unsupported", func(t *testing.T) {
		filePath := filepath.Join("..", "..", "testdata", "image.txt")
		err := IsSupportedImageFile(filePath)
		assert.ErrorIs(t, err, ErrUnsupportedImageFile)
	})

	t.Run("nonexistent file returns error", func(t *testing.T) {
		err := IsSupportedImageFile("/nonexistent/file.jpg")
		assert.Error(t, err)
	})
}

func TestGetContentType(t *testing.T) {
	t.Run("jpeg content type", func(t *testing.T) {
		filePath := filepath.Join("..", "..", "testdata", "image.jpg")
		file, err := os.Open(filePath)
		require.NoError(t, err)
		defer file.Close()

		contentType, err := getContentType(file)

		require.NoError(t, err)
		assert.Equal(t, "image/jpeg", contentType)
	})

	t.Run("png content type", func(t *testing.T) {
		filePath := filepath.Join("..", "..", "testdata", "image.png")
		file, err := os.Open(filePath)
		require.NoError(t, err)
		defer file.Close()

		contentType, err := getContentType(file)

		require.NoError(t, err)
		assert.Equal(t, "image/png", contentType)
	})

	t.Run("text content type", func(t *testing.T) {
		filePath := filepath.Join("..", "..", "testdata", "image.txt")
		file, err := os.Open(filePath)
		require.NoError(t, err)
		defer file.Close()

		contentType, err := getContentType(file)

		require.NoError(t, err)
		assert.NotContains(t, supportedContentTypes, contentType)
	})
}

func TestGetContentType_ClosedFile(t *testing.T) {
	// Closing the file before calling getContentType causes file.Read to
	// return an error, covering the error branch inside getContentType.
	tmpDir := t.TempDir()
	filePath := filepath.Join(tmpDir, "closed.jpg")
	require.NoError(t, os.WriteFile(filePath, []byte("some data"), 0644))

	file, err := os.Open(filePath)
	require.NoError(t, err)
	file.Close()

	_, err = getContentType(file)
	assert.Error(t, err)
}

func TestIsSupportedImageFile_EmptyFile(t *testing.T) {
	// An empty file causes getContentType to fail with io.EOF when
	// trying to read 512 bytes, covering the error return in
	// IsSupportedImageFile.
	tmpDir := t.TempDir()
	filePath := filepath.Join(tmpDir, "empty.jpg")
	require.NoError(t, os.WriteFile(filePath, []byte{}, 0644))

	err := IsSupportedImageFile(filePath)
	assert.Error(t, err)
}

func TestNewReader(t *testing.T) {
	cfg := config.Config{ImageRootDirectory: "/tmp"}
	dbClient := db.NewTestClient(t)
	directoryReader := NewDirectoryReader(cfg, dbClient.Client)
	converter := NewImageFileConverter(cfg)

	reader := NewReader(dbClient.Client, directoryReader, converter)

	assert.NotNil(t, reader)
	assert.Equal(t, dbClient.Client, reader.dbClient)
	assert.Equal(t, directoryReader, reader.directoryReader)
	assert.Equal(t, converter, reader.imageFileConverter)
}

func TestImageFileList_ToMap(t *testing.T) {
	t.Run("empty list", func(t *testing.T) {
		list := ImageFileList{}
		result := list.ToMap()
		assert.Empty(t, result)
	})

	t.Run("multiple image files", func(t *testing.T) {
		list := ImageFileList{
			{ID: 1, Name: "image1.jpg"},
			{ID: 2, Name: "image2.png"},
			{ID: 3, Name: "image3.jpg"},
		}

		result := list.ToMap()

		assert.Len(t, result, 3)
		assert.Equal(t, "image1.jpg", result[1].Name)
		assert.Equal(t, "image2.png", result[2].Name)
		assert.Equal(t, "image3.jpg", result[3].Name)
	})
}

func TestConvertImageFile(t *testing.T) {
	tmpDir := t.TempDir()
	cfg := config.Config{ImageRootDirectory: tmpDir}
	converter := NewImageFileConverter(cfg)

	// Create a test image file in the temp dir
	parentDir := Directory{
		ID:           1,
		Name:         "testdir",
		Path:         filepath.Join(tmpDir, "testdir"),
		RelativePath: "testdir",
	}
	require.NoError(t, os.MkdirAll(parentDir.Path, 0755))

	t.Run("convert a jpeg image file", func(t *testing.T) {
		sourceFilePath := filepath.Join("..", "..", "testdata", "image.jpg")
		destFilePath := filepath.Join(parentDir.Path, "test.jpg")
		_, err := Copy(sourceFilePath, destFilePath)
		require.NoError(t, err)

		dbFile := db.File{
			ID:       10,
			Name:     "test.jpg",
			ParentID: 1,
			Type:     db.FileTypeImage,
		}

		imageFile, err := converter.ConvertImageFile(parentDir, dbFile)

		require.NoError(t, err)
		assert.Equal(t, uint(10), imageFile.ID)
		assert.Equal(t, "test.jpg", imageFile.Name)
		assert.Equal(t, "/files/testdir/test.jpg", imageFile.Path)
		assert.Equal(t, destFilePath, imageFile.LocalFilePath)
		assert.Equal(t, uint(1), imageFile.ParentID)
		assert.Equal(t, "image/jpeg", imageFile.ContentType)
	})

	t.Run("convert a png image file", func(t *testing.T) {
		sourceFilePath := filepath.Join("..", "..", "testdata", "image.png")
		destFilePath := filepath.Join(parentDir.Path, "test.png")
		_, err := Copy(sourceFilePath, destFilePath)
		require.NoError(t, err)

		dbFile := db.File{
			ID:       11,
			Name:     "test.png",
			ParentID: 1,
			Type:     db.FileTypeImage,
		}

		imageFile, err := converter.ConvertImageFile(parentDir, dbFile)

		require.NoError(t, err)
		assert.Equal(t, uint(11), imageFile.ID)
		assert.Equal(t, "image/png", imageFile.ContentType)
	})

	t.Run("file does not exist", func(t *testing.T) {
		dbFile := db.File{
			ID:       12,
			Name:     "nonexistent.jpg",
			ParentID: 1,
			Type:     db.FileTypeImage,
		}

		_, err := converter.ConvertImageFile(parentDir, dbFile)
		assert.Error(t, err)
	})

	t.Run("unsupported file type", func(t *testing.T) {
		sourceFilePath := filepath.Join("..", "..", "testdata", "image.txt")
		destFilePath := filepath.Join(parentDir.Path, "unsupported.txt")
		_, err := Copy(sourceFilePath, destFilePath)
		require.NoError(t, err)

		dbFile := db.File{
			ID:       13,
			Name:     "unsupported.txt",
			ParentID: 1,
			Type:     db.FileTypeImage,
		}

		_, err = converter.ConvertImageFile(parentDir, dbFile)
		assert.ErrorIs(t, err, ErrUnsupportedImageFile)
	})
}

func TestReader_ReadImagesByIDs(t *testing.T) {
	tester := newTester(t)

	fileBuilder := tester.newFileCreator(t).
		CreateDirectory(Directory{ID: 1, Name: "directory1"}).
		CreateImage(ImageFile{ID: 10, Name: "image1.jpg", ParentID: 1}, TestImageFileJpeg).
		CreateImage(ImageFile{ID: 11, Name: "image2.png", ParentID: 1}, TestImageFilePng)

	directoryReader := tester.getDirectoryReader()
	converter := NewImageFileConverter(tester.config)
	reader := NewReader(tester.dbClient.Client, directoryReader, converter)

	t.Run("read existing image files", func(t *testing.T) {
		tester.dbClient.Truncate(t, &db.File{})
		db.LoadTestData(t, tester.dbClient, []db.File{
			fileBuilder.BuildDBDirectory(1),
			fileBuilder.BuildDBImageFile(10),
			fileBuilder.BuildDBImageFile(11),
		})

		result, err := reader.ReadImagesByIDs([]uint{10, 11})

		require.NoError(t, err)
		assert.Len(t, result, 2)

		resultMap := result.ToMap()
		assert.Equal(t, "image1.jpg", resultMap[10].Name)
		assert.Equal(t, "image2.png", resultMap[11].Name)
	})

	t.Run("read empty list", func(t *testing.T) {
		tester.dbClient.Truncate(t, &db.File{})

		result, err := reader.ReadImagesByIDs([]uint{})

		require.NoError(t, err)
		assert.Empty(t, result)
	})

	t.Run("deletes stale records whose file is missing while parent dir exists", func(t *testing.T) {
		tester.dbClient.Truncate(t, &db.File{}, &db.FileTag{}, &db.FileCharacter{})
		db.LoadTestData(t, tester.dbClient, []db.File{
			fileBuilder.BuildDBDirectory(1),
			fileBuilder.BuildDBImageFile(10),
			// Record 12 exists in the DB but the file was never created on
			// disk (e.g. deleted or moved outside the app). Its parent
			// directory1 does exist on disk.
			{ID: 12, Name: "missing.png", ParentID: 1, Type: db.FileTypeImage},
		})
		// Associations for the stale record that must be cleaned up too.
		db.LoadTestData(t, tester.dbClient, []db.FileTag{
			{TagID: 100, FileID: 12, AddedBy: db.FileTagAddedByUser},
		})
		db.LoadTestData(t, tester.dbClient, []db.FileCharacter{
			{CharacterID: 200, FileID: 12, AddedBy: db.FileTagAddedByUser},
		})

		result, err := reader.ReadImagesByIDs([]uint{10, 12})

		require.NoError(t, err)
		assert.Len(t, result, 1)
		assert.Equal(t, "image1.jpg", result.ToMap()[10].Name)

		// The stale record and its associations are removed from the DB;
		// the valid record remains.
		remaining, err := tester.dbClient.Client.File().FindImageFilesByIDs([]uint{10, 12})
		require.NoError(t, err)
		require.Len(t, remaining, 1)
		assert.Equal(t, uint(10), remaining[0].ID)

		remainingTags, err := tester.dbClient.Client.FileTag().FindAllByFileID([]uint{12})
		require.NoError(t, err)
		assert.Empty(t, remainingTags)
		remainingChars, err := tester.dbClient.Client.FileCharacter().FindByFileIDs([]uint{12})
		require.NoError(t, err)
		assert.Empty(t, remainingChars)
	})

	t.Run("keeps stale record when parent directory is unavailable on disk", func(t *testing.T) {
		// Use a dedicated tester so removing the directory does not affect
		// other sub-tests that share the fixture on disk.
		guardTester := newTester(t)
		guardBuilder := guardTester.newFileCreator(t).
			CreateDirectory(Directory{ID: 1, Name: "directory1"}).
			CreateImage(ImageFile{ID: 10, Name: "image1.jpg", ParentID: 1}, TestImageFileJpeg)
		guardReader := NewReader(
			guardTester.dbClient.Client,
			guardTester.getDirectoryReader(),
			NewImageFileConverter(guardTester.config),
		)

		guardTester.dbClient.Truncate(t, &db.File{})
		db.LoadTestData(t, guardTester.dbClient, []db.File{
			guardBuilder.BuildDBDirectory(1),
			guardBuilder.BuildDBImageFile(10),
		})

		// Simulate the whole storage location becoming unavailable (e.g. wrong
		// root path or unmounted drive): the parent directory and its file are
		// both gone from disk.
		require.NoError(t, os.RemoveAll(guardBuilder.BuildDirectory(1).Path))

		result, err := guardReader.ReadImagesByIDs([]uint{10})

		require.NoError(t, err)
		assert.Empty(t, result, "the missing file is skipped from results")

		// The record must NOT be deleted: the file might not truly be gone.
		remaining, err := guardTester.dbClient.Client.File().FindImageFilesByIDs([]uint{10})
		require.NoError(t, err)
		require.Len(t, remaining, 1, "record should be preserved when parent directory is unavailable")
	})

	t.Run("keeps stale record whose parent directory is missing from the DB", func(t *testing.T) {
		tester.dbClient.Truncate(t, &db.File{})
		db.LoadTestData(t, tester.dbClient, []db.File{
			fileBuilder.BuildDBDirectory(1),
			fileBuilder.BuildDBImageFile(10),
			// Record 13 has no parent directory in the DB, so its path cannot
			// be resolved. It must be skipped but not deleted (we can't confirm
			// the file was truly removed).
			{ID: 13, Name: "orphan.png", ParentID: 999, Type: db.FileTypeImage},
		})

		result, err := reader.ReadImagesByIDs([]uint{10, 13})

		require.NoError(t, err)
		assert.Len(t, result, 1)

		remaining, err := tester.dbClient.Client.File().FindImageFilesByIDs([]uint{13})
		require.NoError(t, err)
		require.Len(t, remaining, 1, "orphan record should be preserved when its parent is unknown")
	})

	t.Run("keeps stale record when the cleanup delete fails", func(t *testing.T) {
		// Dedicated tester because dropping a table is destructive.
		failTester := newTester(t)
		failBuilder := failTester.newFileCreator(t).
			CreateDirectory(Directory{ID: 1, Name: "directory1"}).
			CreateImage(ImageFile{ID: 10, Name: "image1.jpg", ParentID: 1}, TestImageFileJpeg)
		failReader := NewReader(
			failTester.dbClient.Client,
			failTester.getDirectoryReader(),
			NewImageFileConverter(failTester.config),
		)

		failTester.dbClient.Truncate(t, &db.File{})
		db.LoadTestData(t, failTester.dbClient, []db.File{
			failBuilder.BuildDBDirectory(1),
			failBuilder.BuildDBImageFile(10),
			// Stale record with an existing parent directory: normally deleted.
			{ID: 12, Name: "missing.png", ParentID: 1, Type: db.FileTypeImage},
		})
		// Make the cleanup transaction fail by removing a table it writes to.
		failTester.dbClient.DropTable(t, &db.FileTag{})

		result, err := failReader.ReadImagesByIDs([]uint{10, 12})

		// The read still succeeds (best-effort cleanup); only the valid image
		// is returned.
		require.NoError(t, err)
		require.Len(t, result, 1)
		assert.Equal(t, uint(10), result[0].ID)

		// The cleanup was rolled back, so the stale record remains.
		remaining, err := failTester.dbClient.Client.File().FindImageFilesByIDs([]uint{12})
		require.NoError(t, err)
		require.Len(t, remaining, 1, "record should be preserved when cleanup fails")
	})
}
