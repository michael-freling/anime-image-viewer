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
	"go.uber.org/mock/gomock"
)

type Tester struct {
	logger         *slog.Logger
	config         config.Config
	dbClient       db.TestClient
	mockController *gomock.Controller
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

	dbClient := db.NewTestClient(t)

	cfg := config.Config{
		ImageRootDirectory: t.TempDir(),
	}

	return Tester{
		logger:         logger,
		config:         cfg,
		dbClient:       dbClient,
		staticFilePath: "/files",
	}
}

func (tester Tester) getFileService() *ImageFileService {
	return NewFileService(
		tester.logger,
		tester.dbClient.Client,
		tester.getDirectoryReader(),
		tester.getImageFileConverter(),
	)
}

func (tester Tester) getDirectoryService() *DirectoryService {
	fileService := tester.getFileService()
	return NewDirectoryService(
		tester.logger,
		tester.config,
		tester.dbClient.Client,
		fileService,
		tester.getDirectoryReader(),
	)
}

func (tester Tester) getDirectoryReader() *DirectoryReader {
	return NewDirectoryReader(tester.config, tester.dbClient.Client)
}

func (tester Tester) getImageFileConverter() *ImageFileConverter {
	return NewImageFileConverter(tester.config)
}

func (tester Tester) createDirectoryInFS(t *testing.T, name string) string {
	t.Helper()

	path := filepath.Join(tester.config.ImageRootDirectory, name)
	require.NoError(t, os.MkdirAll(path, 0755))
	return path
}

func (tester Tester) getTestFilePath(filePath string) string {
	return filepath.Join("..", "..", "testdata", filePath)
}

func (tester Tester) copyImageFile(t *testing.T, source, destination string) {
	t.Helper()

	destination = filepath.Join(tester.config.ImageRootDirectory, destination)
	require.NoError(t, os.MkdirAll(filepath.Dir(destination), 0755))

	_, err := Copy(
		filepath.Join("..", "..", "testdata", source),
		destination,
	)
	require.NoError(t, err)
}

func (tester Tester) newFileBuilder() *FileBuilder {
	return &FileBuilder{
		staticFilePrefix: tester.staticFilePath,
		localFilePrefix:  tester.config.ImageRootDirectory,

		directories:        map[uint]Directory{},
		localDirectoryPath: map[uint]string{},
		imageFiles:         map[uint]ImageFile{},
	}
}
