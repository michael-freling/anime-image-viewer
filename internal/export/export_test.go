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
		{ID: 3, Name: "tag10", ParentID: 1},
		{ID: 4, Name: "tag11", ParentID: 1},
		{ID: 5, Name: "tag100", ParentID: 3},
	} {
		tagBuilder.Add(t)
	}

	type fields struct {
		options BatchImageExporterOptions
	}
	type args struct {
		exportDirectory string
	}

	exportDirectory := t.TempDir()
	testCases := []struct {
		name   string
		fields fields
		args   args

		// insert data
		insertFiles    []db.File
		insertTags     []db.Tag
		insertFileTags []db.FileTag

		wantImages    []string
		wantErr       bool
		wantMetadatas []Metadata
	}{
		{
			name: "is a tag added to a directory excluded",
			fields: fields{
				options: BatchImageExporterOptions{
					IsDirectoryTagExcluded: true,
				},
			},
			args: args{
				exportDirectory: exportDirectory,
			},

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
				filepath.Join(exportDirectory,
					"train",
					fileCreator.BuildImageFile(11).Name,
				),
				filepath.Join(exportDirectory,
					"train",
					fileCreator.BuildImageFile(101).Name,
				),
			},
			wantMetadatas: []Metadata{
				{FileName: fileCreator.BuildImageFile(11).Name, Tags: []float64{0, 1, 0, 0, 0, 0}},
				{FileName: fileCreator.BuildImageFile(101).Name, Tags: []float64{0, 0, 0, 0, 0, 1}},
			},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			tester.dbClient.Truncate(t, tc.insertFiles, tc.insertTags, tc.insertFileTags)
			db.LoadTestData(t, tester.dbClient, tc.insertFiles)
			db.LoadTestData(t, tester.dbClient, tc.insertTags)
			db.LoadTestData(t, tester.dbClient, tc.insertFileTags)

			tc.fields.options.progressSleepDuration = time.Millisecond
			batchExporter := tester.getBatchImageExporter(tc.fields.options)
			gotErr := batchExporter.Export(context.Background(), tc.args.exportDirectory)
			if tc.wantErr {
				assert.Error(t, gotErr)
				return
			}
			assert.NoError(t, gotErr)

			gotImages := make([]string, 0)
			tagFileExists := false
			metadataFilePath := ""
			err := filepath.WalkDir(tc.args.exportDirectory, func(path string, d os.DirEntry, err error) error {
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
