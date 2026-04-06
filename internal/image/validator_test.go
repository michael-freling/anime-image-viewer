package image

import (
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestValidateImageFile(t *testing.T) {
	t.Run("valid jpeg file", func(t *testing.T) {
		tmpDir := t.TempDir()
		filePath := createTestJPEGFile(t, tmpDir, "valid.jpg", 100, 100)

		err := ValidateImageFile(filePath)
		assert.NoError(t, err)
	})

	t.Run("valid png file", func(t *testing.T) {
		tmpDir := t.TempDir()
		filePath := createTestPNGFile(t, tmpDir, "valid.png", 100, 100)

		err := ValidateImageFile(filePath)
		assert.NoError(t, err)
	})

	t.Run("file not found", func(t *testing.T) {
		err := ValidateImageFile("/nonexistent/path/image.jpg")

		assert.Error(t, err)
		assert.True(t, errors.Is(err, ErrImageNotFound), "expected ErrImageNotFound, got: %v", err)
	})

	t.Run("zero-byte file", func(t *testing.T) {
		tmpDir := t.TempDir()
		filePath := filepath.Join(tmpDir, "empty.jpg")
		require.NoError(t, os.WriteFile(filePath, []byte{}, 0644))

		err := ValidateImageFile(filePath)

		assert.Error(t, err)
		assert.True(t, errors.Is(err, ErrImageEmpty), "expected ErrImageEmpty, got: %v", err)
	})

	t.Run("corrupted file with invalid content", func(t *testing.T) {
		tmpDir := t.TempDir()
		filePath := filepath.Join(tmpDir, "corrupted.jpg")
		require.NoError(t, os.WriteFile(filePath, []byte("this is not an image"), 0644))

		err := ValidateImageFile(filePath)

		assert.Error(t, err)
		assert.True(t, errors.Is(err, ErrImageCorrupted), "expected ErrImageCorrupted, got: %v", err)
	})

	t.Run("truncated jpeg file", func(t *testing.T) {
		tmpDir := t.TempDir()
		// Create a valid JPEG, then truncate it
		filePath := createTestJPEGFile(t, tmpDir, "truncated.jpg", 100, 100)
		data, err := os.ReadFile(filePath)
		require.NoError(t, err)
		// Write only the first half of the file
		require.NoError(t, os.WriteFile(filePath, data[:len(data)/2], 0644))

		err = ValidateImageFile(filePath)

		assert.Error(t, err)
		assert.True(t, errors.Is(err, ErrImageCorrupted), "expected ErrImageCorrupted, got: %v", err)
	})

	t.Run("stat error other than not found", func(t *testing.T) {
		tmpDir := t.TempDir()
		// Create a directory with no execute permission so that stat on a
		// file inside it returns a permission error, not a not-found error.
		noExecDir := filepath.Join(tmpDir, "noperm")
		require.NoError(t, os.MkdirAll(noExecDir, 0755))
		filePath := filepath.Join(noExecDir, "image.jpg")
		require.NoError(t, os.WriteFile(filePath, []byte("data"), 0644))
		require.NoError(t, os.Chmod(noExecDir, 0000))
		t.Cleanup(func() {
			os.Chmod(noExecDir, 0755)
		})

		err := ValidateImageFile(filePath)

		assert.Error(t, err)
		assert.False(t, errors.Is(err, ErrImageNotFound), "should not be ErrImageNotFound")
		assert.Contains(t, err.Error(), "stat image file")
	})

	t.Run("file with only jpeg header", func(t *testing.T) {
		tmpDir := t.TempDir()
		filePath := filepath.Join(tmpDir, "header_only.jpg")
		// JPEG SOI marker followed by garbage
		require.NoError(t, os.WriteFile(filePath, []byte{0xFF, 0xD8, 0xFF, 0x00}, 0644))

		err := ValidateImageFile(filePath)

		assert.Error(t, err)
		assert.True(t, errors.Is(err, ErrImageCorrupted), "expected ErrImageCorrupted, got: %v", err)
	})
}
