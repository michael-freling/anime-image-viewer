package tag

import (
	"io"
	"log/slog"
	"testing"

	"github.com/michael-freling/anime-image-viewer/internal/config"
	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/michael-freling/anime-image-viewer/internal/image"
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

func (tester Tester) getFileService() *image.ImageFileService {
	return image.NewFileService(
		tester.logger,
		tester.dbClient,
		tester.getDirectoryReader(),
		tester.getImageFileConverter(),
	)
}

func (tester Tester) getDirectoryReader() *image.DirectoryReader {
	return image.NewDirectoryReader(tester.config, tester.dbClient)
}

func (tester Tester) getImageFileConverter() *image.ImageFileConverter {
	return image.NewImageFileConverter(tester.config)
}

func (tester Tester) getReader() *Reader {
	return NewReader(
		tester.dbClient,
		tester.getDirectoryReader(),
	)
}

type frontendServiceMocks struct {
	suggestionService *SuggestionService
}

func (tester Tester) getFrontendService(mocks frontendServiceMocks) *TagFrontendService {
	return NewFrontendService(
		tester.logger,
		tester.dbClient,
		tester.getReader(),
		mocks.suggestionService,
	)
}

func (tester Tester) getImageReader() *image.Reader {
	return image.NewReader(
		tester.dbClient,
		tester.getDirectoryReader(),
		tester.getImageFileConverter(),
	)
}

func (tester Tester) getTagSuggestionService(
	t *testing.T,
	setupMockClient func(*tag_suggestionv1.MockTagSuggestionServiceClient),
) *SuggestionService {
	t.Helper()

	if tester.mockController == nil {
		tester.mockController = gomock.NewController(t)
		t.Cleanup(tester.mockController.Finish)
	}
	mockSuggestionClient := tag_suggestionv1.NewMockTagSuggestionServiceClient(tester.mockController)
	setupMockClient(mockSuggestionClient)

	return NewSuggestionService(
		tester.dbClient,
		mockSuggestionClient,
		tester.getReader(),
		tester.getImageReader(),
	)
}

func (tester Tester) newFileCreator(t *testing.T) *image.FileCreator {
	return image.NewFileCreator(t, tester.config.ImageRootDirectory)
}
