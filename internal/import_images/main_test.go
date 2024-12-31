package import_images

import (
	"io"
	"log/slog"
	"path/filepath"
	"testing"

	"github.com/michael-freling/anime-image-viewer/internal/config"
	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/michael-freling/anime-image-viewer/internal/image"
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

func (tester Tester) getBatchImageImporter() *BatchImageImporter {
	return NewBatchImageImporter(
		tester.logger,
		tester.dbClient.Client,
		tester.getDirectoryReader(),
		tester.getImageFileConverter(),
	)
}

func (tester Tester) getDirectoryReader() *image.DirectoryReader {
	return image.NewDirectoryReader(tester.config, tester.dbClient.Client)
}

func (tester Tester) getImageFileConverter() *image.ImageFileConverter {
	return image.NewImageFileConverter(tester.config)
}

func (tester Tester) getTestFilePath(filePath string) string {
	return filepath.Join("..", "..", "testdata", filePath)
}

func (tester Tester) newFileCreator() *image.FileCreator {
	return image.NewFileCreator(tester.config.ImageRootDirectory)
}
