package import_images

import (
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"testing"

	"github.com/michael-freling/anime-image-viewer/internal/config"
	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/michael-freling/anime-image-viewer/internal/image"
	"github.com/michael-freling/anime-image-viewer/internal/tag"
	"github.com/stretchr/testify/require"
)

type Tester struct {
	logger   *slog.Logger
	config   config.Config
	dbClient db.TestClient
}

func newTester(t *testing.T) Tester {
	t.Helper()

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	dbClient := db.NewTestClient(t)
	cfg := config.Config{
		ImageRootDirectory: t.TempDir(),
	}
	return Tester{
		logger:   logger,
		config:   cfg,
		dbClient: dbClient,
	}
}

func (tester Tester) copyXMPFile(t *testing.T, imageFile image.TestImageFile, destinationFilePath string) {
	sourceFilePath := tester.getTestFilePath(string(imageFile) + ".xmp")
	_, err := os.Stat(sourceFilePath)
	require.NoError(t, err)

	sourceFile, err := os.Open(sourceFilePath)
	require.NoError(t, err)
	defer sourceFile.Close()

	destinationFile, err := os.Create(destinationFilePath)
	require.NoError(t, err)
	defer destinationFile.Close()

	_, err = io.Copy(destinationFile, sourceFile)
	require.NoError(t, err)

}

func (tester Tester) getBatchImageImporter() *BatchImageImporter {
	return NewBatchImageImporter(
		tester.logger,
		tester.dbClient.Client,
		tester.getImageFileConverter(),
		tester.getTagReader(),
	)
}

func (tester Tester) getImageFileConverter() *image.ImageFileConverter {
	return image.NewImageFileConverter(tester.config)
}

func (tester Tester) getBatchTagImporter() batchTagImporter {
	return newBatchTagImporter(
		tester.dbClient.Client,
		tester.getTagReader(),
	)
}

func (tester Tester) getDirectoryReader() *image.DirectoryReader {
	return image.NewDirectoryReader(tester.config, tester.dbClient.Client)
}

func (tester Tester) getTagReader() *tag.Reader {
	return tag.NewReader(tester.dbClient.Client, tester.getDirectoryReader())
}

func (tester Tester) getTestFilePath(filePath string) string {
	return filepath.Join("..", "..", "testdata", filePath)
}

func (tester Tester) newFileCreator() *image.FileCreator {
	return image.NewFileCreator(tester.config.ImageRootDirectory)
}
