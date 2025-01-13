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
)

type tester struct {
	logger   *slog.Logger
	config   config.Config
	dbClient db.TestClient
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

	dbClient := db.NewTestClient(t)
	cfg := config.Config{
		ImageRootDirectory: t.TempDir(),
	}

	return tester{
		logger:   logger,
		config:   cfg,
		dbClient: dbClient,
	}
}

func (tester tester) getDirectoryService() *DirectoryService {
	return NewDirectoryService(
		tester.dbClient.Client,
		tester.getDirectoryReader(),
		tester.getTagReader(),
	)
}

func (tester tester) getSearchService() *SearchService {
	return NewSearchService(
		search.NewSearchRunner(
			tester.logger,
			tester.dbClient.Client,
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
		tester.dbClient.Client,
		tester.getDirectoryReader(),
		tester.getImageConverter(),
	)
}

func (tester tester) getDirectoryReader() *image.DirectoryReader {
	return image.NewDirectoryReader(tester.config, tester.dbClient.Client)
}

func (tester tester) getTagReader() *tag.Reader {
	return tag.NewReader(
		tester.dbClient.Client,
		tester.getDirectoryReader(),
	)
}

func (tester tester) newFileCreator(t *testing.T) *fileCreator {
	return &fileCreator{
		FileCreator: image.NewFileCreator(t, tester.config.ImageRootDirectory),

		directoryChildrenMap: make(map[uint][]image.Directory),
	}
}

func (tester tester) getTagService() *TagService {
	return NewTagService(tester.getTagReader())
}

func (tester tester) newTagBuilder(t *testing.T) *tagBuilder {
	return &tagBuilder{
		TestTagBuilder: tag.NewTestTagBuilder(),
		t:              t,
	}
}
