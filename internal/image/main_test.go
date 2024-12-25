package image

import (
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"testing"

	"github.com/michael-freling/anime-image-viewer/internal/config"
	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/stretchr/testify/require"
)

type Tester struct {
	config   config.Config
	dbClient *db.Client

	directoryService *DirectoryService
	tagService       *TagService
	fileService      *ImageFileService

	staticFilePath string
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

func newTester(t *testing.T, opts ...newTesterOption) Tester {
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

	imageFileService := NewFileService(logger, dbClient)
	directoryService := NewDirectoryService(
		logger,
		cfg,
		dbClient,
		imageFileService,
	)

	return Tester{
		config:           cfg,
		dbClient:         dbClient,
		directoryService: directoryService,
		tagService:       NewTagService(logger, dbClient, directoryService),
		fileService:      imageFileService,

		staticFilePath: "/files",
	}
}

func (tester Tester) createDirectoryInFS(t *testing.T, name string) string {
	t.Helper()

	path := filepath.Join(tester.config.ImageRootDirectory, name)
	require.NoError(t, os.MkdirAll(path, 0755))
	return path
}

func (tester Tester) copyImageFile(t *testing.T, source, destination string) {
	t.Helper()

	_, err := copy(
		filepath.Join("testdata", source),
		filepath.Join(tester.config.ImageRootDirectory, destination),
	)
	require.NoError(t, err)
}

func (tester Tester) newFileBuilder() *fileBuilder {
	return &fileBuilder{
		staticFilePrefix: tester.staticFilePath,
		localFilePrefix:  tester.config.ImageRootDirectory,

		directories:        map[uint]Directory{},
		localDirectoryPath: map[uint]string{},
		imageFiles:         map[uint]ImageFile{},
	}
}
