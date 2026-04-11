package image

import (
	"encoding/binary"
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

	t.Run("png with invalid CRC is not treated as corrupted", func(t *testing.T) {
		tmpDir := t.TempDir()
		filePath := createTestPNGFile(t, tmpDir, "bad_crc.png", 100, 100)

		// Read the valid PNG, then zero out CRC bytes on a chunk to
		// simulate the kind of file produced by some screen capture tools.
		data, err := os.ReadFile(filePath)
		require.NoError(t, err)

		// PNG structure: 8-byte signature, then chunks.
		// Each chunk: 4-byte length (big-endian) | 4-byte type | <length> bytes data | 4-byte CRC.
		// We skip the signature and walk chunks until we find IDAT, then
		// zero out its CRC.
		offset := 8 // skip PNG signature
		crcZeroed := false
		for offset+8 <= len(data) {
			chunkLen := int(binary.BigEndian.Uint32(data[offset : offset+4]))
			chunkType := string(data[offset+4 : offset+8])
			crcStart := offset + 8 + chunkLen
			if crcStart+4 > len(data) {
				break
			}
			if chunkType == "IDAT" {
				// Zero out the 4-byte CRC
				data[crcStart] = 0
				data[crcStart+1] = 0
				data[crcStart+2] = 0
				data[crcStart+3] = 0
				crcZeroed = true
				break
			}
			offset = crcStart + 4
		}
		require.True(t, crcZeroed, "failed to find and zero IDAT CRC in test PNG")
		require.NoError(t, os.WriteFile(filePath, data, 0644))

		// The image has a bad CRC but is otherwise structurally valid.
		// ValidateImageFile should treat it as NOT corrupted.
		err = ValidateImageFile(filePath)
		assert.NoError(t, err)
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
