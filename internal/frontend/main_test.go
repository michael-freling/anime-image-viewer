package frontend

import (
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/michael-freling/anime-image-viewer/internal/config"
	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/michael-freling/anime-image-viewer/internal/image"
	"github.com/michael-freling/anime-image-viewer/internal/tag"
	"github.com/stretchr/testify/require"
)

type tester struct {
	logger   *slog.Logger
	config   config.Config
	dbClient *db.Client
}

type testerOption struct {
	gormLoggerOption db.ClientOption
}

type newTesterOption func(*testerOption)

func withGormLogger(logger *slog.Logger) newTesterOption {
	return func(o *testerOption) {
		o.gormLoggerOption = db.WithGormLogger(logger)
	}
}

func newTester(t *testing.T, opts ...newTesterOption) tester {
	t.Helper()

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	defaultOption := &testerOption{
		gormLoggerOption: db.WithNopLogger(),
	}
	for _, opt := range opts {
		opt(defaultOption)
	}

	dbClient, err := db.NewClient(db.DSNMemory, defaultOption.gormLoggerOption)
	require.NoError(t, err)
	t.Cleanup(func() {
		dbClient.Close()
	})
	dbClient.Migrate()

	cfg := config.Config{
		ImageRootDirectory: t.TempDir(),
	}

	return tester{
		logger:   logger,
		config:   cfg,
		dbClient: dbClient,
	}
}

func (tester tester) getSearchService() *SearchService {
	return NewSearchService(
		tester.getDirectoryReader(),
		tester.getTagReader(),
	)
}

func (tester tester) getDirectoryReader() *image.DirectoryReader {
	return image.NewDirectoryReader(tester.config, tester.dbClient)
}

func (tester tester) getTagReader() *tag.Reader {
	return tag.NewReader(
		tester.dbClient,
		tester.getDirectoryReader(),
		image.NewImageFileConverter(tester.config),
	)
}

func (tester tester) copyImageFile(t *testing.T, source, destination string) {
	t.Helper()

	destination = strings.TrimPrefix(destination, "/files/")
	destination = filepath.Join(tester.config.ImageRootDirectory, destination)
	if err := os.MkdirAll(filepath.Dir(destination), 0755); err != nil {
		t.Fatal(err)
	}

	_, err := image.Copy(
		filepath.Join("..", "..", "testdata", source),
		destination,
	)
	require.NoError(t, err)
}
