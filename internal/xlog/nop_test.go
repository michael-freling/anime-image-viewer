package xlog

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestNop(t *testing.T) {
	logger := Nop()
	assert.NotNil(t, logger)
	assert.NotNil(t, logger.Handler())

	// Verify the logger can be used without panicking
	logger.Info("test message")
	logger.Warn("test warning", "key", "value")
	logger.Error("test error", "err", "some error")
}
