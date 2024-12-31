package frontend

import (
	"io"
	"log/slog"
	"testing"

	"github.com/michael-freling/anime-image-viewer/internal/config"
	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/michael-freling/anime-image-viewer/internal/image"
	"github.com/michael-freling/anime-image-viewer/internal/search"
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
		search.NewSearchRunner(
			tester.logger,
			tester.dbClient,
			tester.getDirectoryReader(),
			tester.getFileReader(),
			tester.getTagReader(),
			tester.getImageConverter(),
		),
		tester.getDirectoryReader(),
	)
}

func (tester tester) getImageConverter() *image.ImageFileConverter {
	return image.NewImageFileConverter(tester.config)
}

func (tester tester) getFileReader() *image.Reader {
	return image.NewReader(
		tester.dbClient,
		tester.getDirectoryReader(),
		tester.getImageConverter(),
	)
}

func (tester tester) getDirectoryReader() *image.DirectoryReader {
	return image.NewDirectoryReader(tester.config, tester.dbClient)
}

func (tester tester) getTagReader() *tag.Reader {
	return tag.NewReader(
		tester.dbClient,
		tester.getDirectoryReader(),
	)
}

func (tester tester) newFileCreator() *fileCreator {
	return &fileCreator{
		image.NewFileCreator(tester.config.ImageRootDirectory),
	}
}
