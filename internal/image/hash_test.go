package image

import (
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestComputeFileHash(t *testing.T) {
	t.Run("computes correct sha256 hash", func(t *testing.T) {
		tmpDir := t.TempDir()
		content := []byte("hello world")
		filePath := filepath.Join(tmpDir, "test.txt")
		require.NoError(t, os.WriteFile(filePath, content, 0644))

		hash, err := ComputeFileHash(filePath)

		require.NoError(t, err)
		expected := sha256.Sum256(content)
		assert.Equal(t, hex.EncodeToString(expected[:]), hash)
	})

	t.Run("different content produces different hash", func(t *testing.T) {
		tmpDir := t.TempDir()
		file1 := filepath.Join(tmpDir, "a.txt")
		file2 := filepath.Join(tmpDir, "b.txt")
		require.NoError(t, os.WriteFile(file1, []byte("content A"), 0644))
		require.NoError(t, os.WriteFile(file2, []byte("content B"), 0644))

		hash1, err := ComputeFileHash(file1)
		require.NoError(t, err)
		hash2, err := ComputeFileHash(file2)
		require.NoError(t, err)

		assert.NotEqual(t, hash1, hash2)
	})

	t.Run("same content produces same hash", func(t *testing.T) {
		tmpDir := t.TempDir()
		content := []byte("identical content")
		file1 := filepath.Join(tmpDir, "a.txt")
		file2 := filepath.Join(tmpDir, "b.txt")
		require.NoError(t, os.WriteFile(file1, content, 0644))
		require.NoError(t, os.WriteFile(file2, content, 0644))

		hash1, err := ComputeFileHash(file1)
		require.NoError(t, err)
		hash2, err := ComputeFileHash(file2)
		require.NoError(t, err)

		assert.Equal(t, hash1, hash2)
	})

	t.Run("nonexistent file returns error", func(t *testing.T) {
		_, err := ComputeFileHash("/nonexistent/file.txt")
		assert.Error(t, err)
	})

	t.Run("empty file produces valid hash", func(t *testing.T) {
		tmpDir := t.TempDir()
		filePath := filepath.Join(tmpDir, "empty.txt")
		require.NoError(t, os.WriteFile(filePath, []byte{}, 0644))

		hash, err := ComputeFileHash(filePath)

		require.NoError(t, err)
		expected := sha256.Sum256([]byte{})
		assert.Equal(t, hex.EncodeToString(expected[:]), hash)
	})
}
