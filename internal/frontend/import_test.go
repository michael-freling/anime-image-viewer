package frontend

import (
	"io"
	"log/slog"
	"testing"

	"github.com/michael-freling/anime-image-viewer/internal/import_images"
	"github.com/stretchr/testify/assert"
)

func TestNewBatchImportImageService(t *testing.T) {
	tester := newTester(t)
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))

	batchImporter := import_images.NewBatchImageImporter(
		logger,
		tester.dbClient.Client,
		tester.getImageConverter(),
		tester.getTagReader(),
	)

	service := NewBatchImportImageService(
		logger,
		tester.getDirectoryReader(),
		batchImporter,
	)

	assert.NotNil(t, service)
	assert.NotNil(t, service.logger)
	assert.NotNil(t, service.directoryReader)
	assert.NotNil(t, service.batchImageImporter)
}
