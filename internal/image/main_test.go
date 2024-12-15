package image

import (
	"log/slog"
	"os"
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
	directoryService := NewDirectoryService(cfg, dbClient, nil)
	return Tester{
		config:           cfg,
		dbClient:         dbClient,
		directoryService: directoryService,
		tagService:       NewTagService(dbClient, directoryService),

		staticFilePath: "/files",
	}
}

func (tester Tester) createDirectoryInFS(t *testing.T, name string) string {
	t.Helper()

	path := tester.config.ImageRootDirectory + "/" + name
	require.NoError(t, os.MkdirAll(path, 0755))
	return path
}

func (tester Tester) copyImageFile(t *testing.T, source, destination string) {
	t.Helper()

	_, err := copy("testdata/"+source, tester.config.ImageRootDirectory+"/"+destination)
	require.NoError(t, err)
}
