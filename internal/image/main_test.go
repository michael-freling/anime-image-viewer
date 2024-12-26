package image

import (
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"testing"

	"github.com/michael-freling/anime-image-viewer/internal/config"
	"github.com/michael-freling/anime-image-viewer/internal/db"
	tag_suggestionv1 "github.com/michael-freling/anime-image-viewer/plugins/plugins-protos/gen/go/tag_suggestion/v1"
	"github.com/stretchr/testify/require"
	"go.uber.org/mock/gomock"
)

type Tester struct {
	logger         *slog.Logger
	config         config.Config
	dbClient       *db.Client
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

	dbClient, err := db.NewClient(db.DSNMemory, defaultOption.gormLoggerOption)
	require.NoError(t, err)
	t.Cleanup(func() {
		dbClient.Close()
	})
	dbClient.Migrate()

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
	// todo: currently, file service sets a pointer to a directory service
	// in NewDirectoryService and has a inter dependency
	// Fix it in the future
	return NewFileService(
		tester.logger,
		tester.dbClient,
		tester.getDirectoryReader(),
		tester.getImageFileConverter(),
	)
}

func (tester Tester) getDirectoryService() *DirectoryService {
	fileService := tester.getFileService()
	return NewDirectoryService(
		tester.logger,
		tester.config,
		tester.dbClient,
		fileService,
		tester.getDirectoryReader(),
	)
}

func (tester Tester) getDirectoryReader() *DirectoryReader {
	return NewDirectoryReader(tester.config, tester.dbClient)
}

func (tester Tester) getImageFileConverter() *ImageFileConverter {
	return NewImageFileConverter(tester.config)
}

func (tester Tester) getTagService() *TagService {
	return NewTagService(
		tester.logger,
		tester.dbClient,
		tester.getDirectoryReader(),
		tester.getImageFileConverter(),
	)
}

func (tester Tester) getTagSuggestionService(
	t *testing.T,
	setupMockClient func(*tag_suggestionv1.MockTagSuggestionServiceClient),
) *TagSuggestionService {
	t.Helper()

	if tester.mockController == nil {
		tester.mockController = gomock.NewController(t)
		t.Cleanup(tester.mockController.Finish)
	}
	mockSuggestionClient := tag_suggestionv1.NewMockTagSuggestionServiceClient(tester.mockController)
	setupMockClient(mockSuggestionClient)

	return NewTagSuggestionService(
		mockSuggestionClient,
		tester.getFileService(),
		tester.getTagService(),
	)
}

func (tester Tester) createDirectoryInFS(t *testing.T, name string) string {
	t.Helper()

	path := filepath.Join(tester.config.ImageRootDirectory, name)
	require.NoError(t, os.MkdirAll(path, 0755))
	return path
}

func (tester Tester) copyImageFile(t *testing.T, source, destination string) {
	t.Helper()

	destination = filepath.Join(tester.config.ImageRootDirectory, destination)
	if err := os.MkdirAll(filepath.Dir(destination), 0755); err != nil {
		t.Fatal(err)
	}

	_, err := Copy(
		filepath.Join("testdata", source),
		destination,
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
