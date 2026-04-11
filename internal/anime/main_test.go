package anime

import (
	"testing"

	"github.com/michael-freling/anime-image-viewer/internal/config"
	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/michael-freling/anime-image-viewer/internal/image"
)

type tester struct {
	dbClient db.TestClient
	config   config.Config
}

func newTester(t *testing.T) tester {
	t.Helper()
	dbClient := db.NewTestClient(t)
	dbClient.Truncate(t, db.File{}, db.Tag{}, db.Anime{}, db.FileTag{})
	cfg := config.Config{
		ImageRootDirectory: t.TempDir(),
	}
	return tester{
		dbClient: dbClient,
		config:   cfg,
	}
}

func (te tester) directoryReader() *image.DirectoryReader {
	return image.NewDirectoryReader(te.config, te.dbClient.Client)
}

func (te tester) service() *Service {
	return NewService(te.dbClient.Client, te.directoryReader(), te.config)
}
