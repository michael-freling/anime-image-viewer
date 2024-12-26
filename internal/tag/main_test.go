package tag

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
		tester.getImageFileConverter(),
	)
}

func (tester Tester) getFrontendService() *TagFrontendService {
	return NewFrontendService(
		tester.logger,
		tester.dbClient,
		tester.getReader(),
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

	return NewSuggestionService(
		mockSuggestionClient,
		tester.getFileService(),
		tester.getReader(),
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

	_, err := image.Copy(
		filepath.Join("..", "..", "testdata", source),
		destination,
	)
	require.NoError(t, err)
}

// todo: consolidate fileBuilder with internal/image/files_test.go
func (tester Tester) newFileBuilder() *fileBuilder {
	return &fileBuilder{
		staticFilePrefix: tester.staticFilePath,
		localFilePrefix:  tester.config.ImageRootDirectory,

		directories:        map[uint]image.Directory{},
		localDirectoryPath: map[uint]string{},
		imageFiles:         map[uint]image.ImageFile{},
	}
}

type fileBuilder struct {
	staticFilePrefix string
	localFilePrefix  string

	directories        map[uint]image.Directory
	localDirectoryPath map[uint]string
	imageFiles         map[uint]image.ImageFile
}

func (builder *fileBuilder) addDirectory(directory image.Directory) *fileBuilder {
	if directory.ParentID != 0 {
		parent := builder.directories[directory.ParentID]
		directory.Path = filepath.Join(parent.Path, directory.Name)

		parentLocalFilePath := builder.localDirectoryPath[directory.ParentID]
		builder.localDirectoryPath[directory.ID] = filepath.Join(parentLocalFilePath, directory.Name)
	} else {
		directory.Path = filepath.Join(builder.localFilePrefix, directory.Name)
		builder.localDirectoryPath[directory.ID] = filepath.Join(builder.localFilePrefix, directory.Name)
	}

	builder.directories[directory.ID] = directory
	return builder
}

func (builder *fileBuilder) addImageFile(imageFile image.ImageFile) *fileBuilder {
	if imageFile.ParentID != 0 {
		parentLocalFilePath := builder.localDirectoryPath[imageFile.ParentID]
		imageFile.LocalFilePath = filepath.Join(parentLocalFilePath, imageFile.Name)

		// todo: workaround
		imageFile.Path = "/files" + strings.TrimPrefix(imageFile.LocalFilePath, builder.localFilePrefix)
		// filepath.Join(parent.Path, imageFile.Name)
	}

	builder.imageFiles[imageFile.ID] = imageFile
	return builder
}

func (builder fileBuilder) buildDirectory(id uint) image.Directory {
	return builder.directories[id]
}

func (builder fileBuilder) buildImageFile(id uint) image.ImageFile {
	return builder.imageFiles[id]
}
