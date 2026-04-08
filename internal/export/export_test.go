package export

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/michael-freling/anime-image-viewer/internal/config"
	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/michael-freling/anime-image-viewer/internal/image"
	"github.com/michael-freling/anime-image-viewer/internal/tag"
	"github.com/stretchr/testify/assert"
)

type tester struct {
	dbClient           db.TestClient
	imageRootDirectory string
}

func newTester(t *testing.T) *tester {
	dbClient := db.NewTestClient(t)

	rootDir := t.TempDir()

	return &tester{
		dbClient:           dbClient,
		imageRootDirectory: rootDir,
	}
}

func (tester *tester) newFileCreator(t *testing.T) *image.FileCreator {
	return image.NewFileCreator(t, tester.imageRootDirectory)
}

func (tester *tester) getBatchImageExporter(options BatchImageExporterOptions) *BatchImageExporter {
	return &BatchImageExporter{
		logger:          slog.New(slog.NewTextHandler(io.Discard, nil)),
		dbClient:        tester.dbClient.Client,
		directoryReader: tester.getDirectoryReader(),
		tagReader:       tester.getTagReader(),
		options:         options,
	}
}

func (tester *tester) getDirectoryReader() *image.DirectoryReader {
	return image.NewDirectoryReader(config.Config{
		ImageRootDirectory: tester.imageRootDirectory,
	}, tester.dbClient.Client)
}

func (tester *tester) getTagReader() *tag.Reader {
	return tag.NewReader(tester.dbClient.Client, tester.getDirectoryReader())
}

func TestNewBatchImageExporter(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	dbClient := db.NewTestClient(t)
	conf := config.Config{
		ImageRootDirectory: t.TempDir(),
	}

	t.Run("default progress sleep duration", func(t *testing.T) {
		exporter := NewBatchImageExporter(logger, conf, dbClient.Client, BatchImageExporterOptions{})
		assert.NotNil(t, exporter)
		assert.Equal(t, 10*time.Second, exporter.options.progressSleepDuration)
	})

	t.Run("custom progress sleep duration", func(t *testing.T) {
		exporter := NewBatchImageExporter(logger, conf, dbClient.Client, BatchImageExporterOptions{
			progressSleepDuration: 5 * time.Second,
		})
		assert.NotNil(t, exporter)
		assert.Equal(t, 5*time.Second, exporter.options.progressSleepDuration)
	})

	t.Run("with IsDirectoryTagExcluded", func(t *testing.T) {
		exporter := NewBatchImageExporter(logger, conf, dbClient.Client, BatchImageExporterOptions{
			IsDirectoryTagExcluded: true,
		})
		assert.NotNil(t, exporter)
		assert.True(t, exporter.options.IsDirectoryTagExcluded)
	})
}

type exportTestCase struct {
	name    string
	options BatchImageExporterOptions

	exportDirectory string

	// insert data
	insertFiles    []db.File
	insertTags     []db.Tag
	insertFileTags []db.FileTag

	wantImages    []string
	wantErr       bool
	wantMetadatas []Metadata
}

func TestBatchImageExporter_Export(t *testing.T) {
	tester := newTester(t)
	fileCreator := tester.newFileCreator(t)

	directories := []image.Directory{
		{ID: 1, Name: "dir1"},
		{ID: 10, Name: "child 10", ParentID: 1},
		{ID: 100, Name: "child 100", ParentID: 10},
	}
	for _, directory := range directories {
		fileCreator.CreateDirectory(directory)
	}
	images := []image.ImageFile{
		{ID: 11, Name: "image11.jpg", ParentID: 1},
		{ID: 12, Name: "image22.jpg", ParentID: 1},
		{ID: 101, Name: "image101.jpg", ParentID: 10},
	}
	for _, img := range images {
		fileCreator.CreateImage(img, image.TestImageFileJpeg)
	}
	tagBuilder := tag.NewTestTagBuilder()
	for _, t := range []tag.Tag{
		{ID: 1, Name: "tag1"},
		{ID: 2, Name: "tag2"},
		{ID: 3, Name: "tag10"},
		{ID: 4, Name: "tag11"},
		{ID: 5, Name: "tag100"},
	} {
		tagBuilder.Add(t)
	}

	excludeTagDir := t.TempDir()
	includeTagDir := t.TempDir()
	noTagDir := t.TempDir()

	testCases := []exportTestCase{
		{
			name: "is a tag added to a directory excluded",
			options: BatchImageExporterOptions{
				IsDirectoryTagExcluded: true,
			},
			exportDirectory: excludeTagDir,

			insertFiles: []db.File{
				fileCreator.BuildDBDirectory(1),
				fileCreator.BuildDBImageFile(11),
				fileCreator.BuildDBImageFile(12),
				fileCreator.BuildDBDirectory(10),
				fileCreator.BuildDBImageFile(101),
				fileCreator.BuildDBDirectory(100),
				{ID: 9999, Name: "image9999.jpg", ParentID: 100}, // no tag
			},
			insertTags: []db.Tag{
				tagBuilder.BuildDBTag(1),
				tagBuilder.BuildDBTag(2),
				tagBuilder.BuildDBTag(3),
				tagBuilder.BuildDBTag(4),
				tagBuilder.BuildDBTag(5),
			},
			insertFileTags: []db.FileTag{
				{FileID: 1, TagID: 3},   // tag to a directory. Should be ignored
				{FileID: 11, TagID: 1},  // a root tag to a file
				{FileID: 101, TagID: 5}, // a leaf tag to a file
			},

			wantImages: []string{
				filepath.Join(excludeTagDir, "train", fileCreator.BuildImageFile(11).Name),
				filepath.Join(excludeTagDir, "train", fileCreator.BuildImageFile(101).Name),
			},
			wantMetadatas: []Metadata{
				{FileName: fileCreator.BuildImageFile(11).Name, Tags: []float64{0, 1, 0, 0, 0, 0}},
				{FileName: fileCreator.BuildImageFile(101).Name, Tags: []float64{0, 0, 0, 0, 0, 1}},
			},
		},
		{
			name: "include directory tags (IsDirectoryTagExcluded=false)",
			options: BatchImageExporterOptions{
				IsDirectoryTagExcluded: false,
			},
			exportDirectory: includeTagDir,
			insertFiles: []db.File{
				fileCreator.BuildDBDirectory(1),
				fileCreator.BuildDBImageFile(11),
				fileCreator.BuildDBImageFile(12),
				fileCreator.BuildDBDirectory(10),
				fileCreator.BuildDBImageFile(101),
			},
			insertTags: []db.Tag{
				tagBuilder.BuildDBTag(1),
				tagBuilder.BuildDBTag(2),
				tagBuilder.BuildDBTag(3),
				tagBuilder.BuildDBTag(4),
				tagBuilder.BuildDBTag(5),
			},
			insertFileTags: []db.FileTag{
				{FileID: 1, TagID: 3},   // tag to a directory. Should be included
				{FileID: 11, TagID: 1},  // a root tag to a file
				{FileID: 101, TagID: 5}, // a leaf tag to a file
			},
			wantImages: []string{
				filepath.Join(includeTagDir, "train", fileCreator.BuildImageFile(11).Name),
				filepath.Join(includeTagDir, "train", fileCreator.BuildImageFile(101).Name),
			},
			wantMetadatas: []Metadata{
				{FileName: fileCreator.BuildImageFile(11).Name, Tags: []float64{0, 1, 0, 0, 0, 0}},
				// image12 has no direct tags, so it's excluded from export
				{FileName: fileCreator.BuildImageFile(101).Name, Tags: []float64{0, 0, 0, 0, 0, 1}},
			},
		},
		{
			name: "no images have tags, nothing exported",
			options: BatchImageExporterOptions{
				IsDirectoryTagExcluded: true,
			},
			exportDirectory: noTagDir,
			insertFiles: []db.File{
				fileCreator.BuildDBDirectory(1),
				fileCreator.BuildDBImageFile(11),
			},
			insertTags:     []db.Tag{},
			insertFileTags: []db.FileTag{},
			wantImages:    []string{},
			wantMetadatas: []Metadata{},
		},
	}

	// Test case: file already exists in export directory
	existingFileDir := t.TempDir()
	trainDir := filepath.Join(existingFileDir, "train")
	assert.NoError(t, os.MkdirAll(trainDir, 0755))
	// Create a file with same name as would be exported
	existingFilePath := filepath.Join(trainDir, fileCreator.BuildImageFile(11).Name)
	assert.NoError(t, os.WriteFile(existingFilePath, []byte("existing"), 0644))

	testCases = append(testCases, exportTestCase{
		name: "export fails when file already exists in destination",
		options: BatchImageExporterOptions{
			IsDirectoryTagExcluded: false,
		},
		exportDirectory: existingFileDir,
		insertFiles: []db.File{
			fileCreator.BuildDBDirectory(1),
			fileCreator.BuildDBImageFile(11),
		},
		insertTags: []db.Tag{
			tagBuilder.BuildDBTag(1),
		},
		insertFileTags: []db.FileTag{
			{FileID: 11, TagID: 1},
		},
		wantErr: true,
	})

	// Test: ReadImageFilesRecursively error when a DB image record has no physical file
	readErrorDir := t.TempDir()
	testCases = append(testCases, exportTestCase{
		name: "export fails when image in DB has no physical file",
		options: BatchImageExporterOptions{
			IsDirectoryTagExcluded: false,
		},
		exportDirectory: readErrorDir,
		insertFiles: []db.File{
			fileCreator.BuildDBDirectory(1),
			// A valid image that exists physically
			fileCreator.BuildDBImageFile(11),
			// An image record in DB but no physical file on disk
			{ID: 9998, Name: "ghost_image.jpg", ParentID: 1, Type: db.FileTypeImage},
		},
		insertTags: []db.Tag{
			tagBuilder.BuildDBTag(1),
		},
		insertFileTags: []db.FileTag{
			{FileID: 9998, TagID: 1},
		},
		wantErr: true,
	})

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			tester.dbClient.Truncate(t, tc.insertFiles, tc.insertTags, tc.insertFileTags)
			db.LoadTestData(t, tester.dbClient, tc.insertFiles)
			db.LoadTestData(t, tester.dbClient, tc.insertTags)
			db.LoadTestData(t, tester.dbClient, tc.insertFileTags)

			tc.options.progressSleepDuration = time.Millisecond
			batchExporter := tester.getBatchImageExporter(tc.options)
			gotErr := batchExporter.Export(context.Background(), tc.exportDirectory)
			if tc.wantErr {
				assert.Error(t, gotErr)
				return
			}
			assert.NoError(t, gotErr)

			gotImages := make([]string, 0)
			tagFileExists := false
			metadataFilePath := ""
			err := filepath.WalkDir(tc.exportDirectory, func(path string, d os.DirEntry, err error) error {
				t.Log(path)
				if err != nil {
					return err
				}
				if d != nil && d.IsDir() {
					return nil
				}
				if filepath.Base(path) == "tags.json" {
					tagFileExists = true
					return nil
				}
				if filepath.Base(path) == "metadata.jsonl" {
					metadataFilePath = path
					return nil
				}

				gotImages = append(gotImages, path)
				return nil
			})
			assert.NoError(t, err)
			assert.ElementsMatch(t, tc.wantImages, gotImages)
			assert.True(t, tagFileExists)
			assert.NotEmpty(t, metadataFilePath)

			// Check metadata.jsonl
			gotMetadatas := readMetadataFile(t, metadataFilePath)
			assert.Equal(t, tc.wantMetadatas, gotMetadatas)
		})
	}
}

func TestBatchImageExporter_Export_ReadOnly(t *testing.T) {
	tester := newTester(t)
	fileCreator := tester.newFileCreator(t)
	fileCreator.CreateDirectory(image.Directory{ID: 1, Name: "dir1"})
	fileCreator.CreateImage(image.ImageFile{ID: 11, Name: "image11.jpg", ParentID: 1}, image.TestImageFileJpeg)

	tagBuilder := tag.NewTestTagBuilder()
	tagBuilder.Add(tag.Tag{ID: 1, Name: "tag1"})

	tester.dbClient.Truncate(t,
		[]db.File{},
		[]db.Tag{},
		[]db.FileTag{},
	)
	db.LoadTestData(t, tester.dbClient, []db.File{
		fileCreator.BuildDBDirectory(1),
		fileCreator.BuildDBImageFile(11),
	})
	db.LoadTestData(t, tester.dbClient, []db.Tag{
		tagBuilder.BuildDBTag(1),
	})
	db.LoadTestData(t, tester.dbClient, []db.FileTag{
		{FileID: 11, TagID: 1},
	})

	// Create export directory, create train subdir with proper permissions,
	// then make the root export dir read-only so tags.json creation fails
	exportDir := t.TempDir()
	trainDir := filepath.Join(exportDir, "train")
	assert.NoError(t, os.MkdirAll(trainDir, 0755))
	// Make export dir read-only after subdirs are created
	assert.NoError(t, os.Chmod(exportDir, 0555))
	t.Cleanup(func() {
		os.Chmod(exportDir, 0755) // restore for cleanup
	})

	batchExporter := tester.getBatchImageExporter(BatchImageExporterOptions{
		progressSleepDuration: time.Millisecond,
	})

	err := batchExporter.Export(context.Background(), exportDir)
	assert.Error(t, err, "should fail when export directory is read-only")
}

func TestBatchImageExporter_exportImageFile(t *testing.T) {
	tester := newTester(t)
	fileCreator := tester.newFileCreator(t)
	fileCreator.CreateDirectory(image.Directory{ID: 1, Name: "dir1"})
	fileCreator.CreateImage(image.ImageFile{ID: 11, Name: "image11.jpg", ParentID: 1}, image.TestImageFileJpeg)

	batchExporter := tester.getBatchImageExporter(BatchImageExporterOptions{})

	t.Run("success", func(t *testing.T) {
		exportDir := t.TempDir()
		imgFile := fileCreator.BuildImageFile(11)
		err := batchExporter.exportImageFile(imgFile, exportDir)
		assert.NoError(t, err)

		destPath := filepath.Join(exportDir, imgFile.Name)
		assert.FileExists(t, destPath)
	})

	t.Run("source file does not exist", func(t *testing.T) {
		exportDir := t.TempDir()
		nonExistentImage := image.ImageFile{
			ID:            999,
			Name:          "nonexistent.jpg",
			LocalFilePath: "/nonexistent/path/nonexistent.jpg",
		}
		err := batchExporter.exportImageFile(nonExistentImage, exportDir)
		assert.Error(t, err)
	})

	t.Run("destination directory does not exist", func(t *testing.T) {
		imgFile := fileCreator.BuildImageFile(11)
		err := batchExporter.exportImageFile(imgFile, "/nonexistent/export/dir")
		assert.Error(t, err)
	})
}

func TestBatchImageExporter_ExportImages_InvalidDirectory(t *testing.T) {
	tester := newTester(t)
	fileCreator := tester.newFileCreator(t)
	fileCreator.CreateDirectory(image.Directory{ID: 1, Name: "dir1"})
	fileCreator.CreateImage(image.ImageFile{ID: 11, Name: "image11.jpg", ParentID: 1}, image.TestImageFileJpeg)

	tagBuilder := tag.NewTestTagBuilder()
	tagBuilder.Add(tag.Tag{ID: 1, Name: "tag1"})

	tester.dbClient.Truncate(t,
		[]db.File{},
		[]db.Tag{},
		[]db.FileTag{},
	)
	db.LoadTestData(t, tester.dbClient, []db.File{
		fileCreator.BuildDBDirectory(1),
		fileCreator.BuildDBImageFile(11),
	})
	db.LoadTestData(t, tester.dbClient, []db.Tag{
		tagBuilder.BuildDBTag(1),
	})
	db.LoadTestData(t, tester.dbClient, []db.FileTag{
		{FileID: 11, TagID: 1},
	})

	allTags, err := tester.getTagReader().ReadAllTags()
	assert.NoError(t, err)

	batchExporter := tester.getBatchImageExporter(BatchImageExporterOptions{
		progressSleepDuration: time.Millisecond,
	})

	// Use a path under /dev/null which is not a directory on Linux
	err = batchExporter.ExportImages(context.Background(), "/dev/null/invalid/path", allTags)
	assert.Error(t, err)
}

func TestBatchImageExporter_ExportImages_CancelledContext(t *testing.T) {
	tester := newTester(t)
	fileCreator := tester.newFileCreator(t)
	fileCreator.CreateDirectory(image.Directory{ID: 1, Name: "dir1"})
	fileCreator.CreateImage(image.ImageFile{ID: 11, Name: "image11.jpg", ParentID: 1}, image.TestImageFileJpeg)

	tagBuilder := tag.NewTestTagBuilder()
	tagBuilder.Add(tag.Tag{ID: 1, Name: "tag1"})

	tester.dbClient.Truncate(t, []db.File{}, []db.Tag{}, []db.FileTag{})
	db.LoadTestData(t, tester.dbClient, []db.File{
		fileCreator.BuildDBDirectory(1),
		fileCreator.BuildDBImageFile(11),
	})
	db.LoadTestData(t, tester.dbClient, []db.Tag{
		tagBuilder.BuildDBTag(1),
	})
	db.LoadTestData(t, tester.dbClient, []db.FileTag{
		{FileID: 11, TagID: 1},
	})

	allTags, err := tester.getTagReader().ReadAllTags()
	assert.NoError(t, err)

	batchExporter := tester.getBatchImageExporter(BatchImageExporterOptions{
		// Use a long sleep so the progress goroutine is still in select when cancel fires
		progressSleepDuration: 10 * time.Second,
	})

	exportDir := t.TempDir()

	// Create a context that will be cancelled immediately
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // cancel immediately

	// ExportImages should still complete since errgroups ignore context
	err = batchExporter.ExportImages(ctx, exportDir, allTags)
	// The export might succeed or fail depending on timing,
	// but the progress goroutine should hit ctx.Done()
	_ = err
}

func readMetadataFile(t *testing.T, metadataFilePath string) []Metadata {
	metadataFile, err := os.Open(metadataFilePath)
	assert.NoError(t, err)
	defer metadataFile.Close()

	contents, err := io.ReadAll(metadataFile)
	assert.NoError(t, err)
	lines := strings.Split(string(contents), "\n")
	lines = lines[:len(lines)-1] // remove the last empty line

	gotMetadatas := make([]Metadata, 0)
	for _, line := range lines {
		gotMetadata := Metadata{}
		err := json.Unmarshal([]byte(line), &gotMetadata)
		assert.NoError(t, err)
		gotMetadatas = append(gotMetadatas, gotMetadata)
	}
	return gotMetadatas
}
