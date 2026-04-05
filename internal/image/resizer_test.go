package image

import (
	"bytes"
	"context"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewResizer(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))

	resizer := NewResizer(logger)

	assert.NotNil(t, resizer)
	assert.Equal(t, logger, resizer.logger)
}

func createTestJPEGFile(t *testing.T, dir string, name string, width, height int) string {
	t.Helper()
	filePath := filepath.Join(dir, name)
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			img.Set(x, y, color.RGBA{R: uint8(x % 256), G: uint8(y % 256), B: 100, A: 255})
		}
	}
	file, err := os.Create(filePath)
	require.NoError(t, err)
	defer file.Close()
	require.NoError(t, jpeg.Encode(file, img, nil))
	return filePath
}

func createTestPNGFile(t *testing.T, dir string, name string, width, height int) string {
	t.Helper()
	filePath := filepath.Join(dir, name)
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			img.Set(x, y, color.RGBA{R: uint8(x % 256), G: uint8(y % 256), B: 200, A: 255})
		}
	}
	file, err := os.Create(filePath)
	require.NoError(t, err)
	defer file.Close()
	require.NoError(t, png.Encode(file, img))
	return filePath
}

func TestResizer_ResizeImage(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	resizer := NewResizer(logger)
	ctx := context.Background()

	t.Run("resize jpeg image", func(t *testing.T) {
		tmpDir := t.TempDir()
		filePath := createTestJPEGFile(t, tmpDir, "test.jpg", 200, 100)

		encoder, err := resizer.ResizeImage(ctx, filePath, 100)

		require.NoError(t, err)
		require.NotNil(t, encoder)

		// Verify the encoder can write output
		var buf bytes.Buffer
		err = encoder.Encode(&buf)
		require.NoError(t, err)
		assert.Greater(t, buf.Len(), 0)

		// Verify the output is a valid JPEG with correct dimensions
		decodedImage, err := jpeg.Decode(&buf)
		require.NoError(t, err)
		bounds := decodedImage.Bounds()
		assert.Equal(t, 100, bounds.Max.X)
		assert.Equal(t, 50, bounds.Max.Y)
	})

	t.Run("resize png image", func(t *testing.T) {
		tmpDir := t.TempDir()
		filePath := createTestPNGFile(t, tmpDir, "test.png", 300, 150)

		encoder, err := resizer.ResizeImage(ctx, filePath, 150)

		require.NoError(t, err)
		require.NotNil(t, encoder)

		var buf bytes.Buffer
		err = encoder.Encode(&buf)
		require.NoError(t, err)
		assert.Greater(t, buf.Len(), 0)

		// Verify the output is a valid PNG with correct dimensions
		decodedImage, err := png.Decode(&buf)
		require.NoError(t, err)
		bounds := decodedImage.Bounds()
		assert.Equal(t, 150, bounds.Max.X)
		assert.Equal(t, 75, bounds.Max.Y)
	})

	t.Run("file does not exist", func(t *testing.T) {
		_, err := resizer.ResizeImage(ctx, "/nonexistent/image.jpg", 100)
		assert.Error(t, err)
	})

	t.Run("unsupported image format", func(t *testing.T) {
		tmpDir := t.TempDir()
		// Create a file with invalid image content
		filePath := filepath.Join(tmpDir, "not_an_image.bmp")
		err := os.WriteFile(filePath, []byte("not an image"), 0644)
		require.NoError(t, err)

		_, err = resizer.ResizeImage(ctx, filePath, 100)
		assert.Error(t, err)
	})
}

func TestJpegEncoder_Encode(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 10, 10))
	for y := 0; y < 10; y++ {
		for x := 0; x < 10; x++ {
			img.Set(x, y, color.RGBA{R: 255, G: 0, B: 0, A: 255})
		}
	}

	encoder := JpegEncoder{image: img}

	var buf bytes.Buffer
	err := encoder.Encode(&buf)

	require.NoError(t, err)
	assert.Greater(t, buf.Len(), 0)

	// Decode and verify
	decoded, err := jpeg.Decode(&buf)
	require.NoError(t, err)
	assert.Equal(t, 10, decoded.Bounds().Max.X)
	assert.Equal(t, 10, decoded.Bounds().Max.Y)
}

func TestPngEncoder_Encode(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 10, 10))
	for y := 0; y < 10; y++ {
		for x := 0; x < 10; x++ {
			img.Set(x, y, color.RGBA{R: 0, G: 255, B: 0, A: 255})
		}
	}

	encoder := PngEncoder{image: img}

	var buf bytes.Buffer
	err := encoder.Encode(&buf)

	require.NoError(t, err)
	assert.Greater(t, buf.Len(), 0)

	// Decode and verify
	decoded, err := png.Decode(&buf)
	require.NoError(t, err)
	assert.Equal(t, 10, decoded.Bounds().Max.X)
	assert.Equal(t, 10, decoded.Bounds().Max.Y)
}

func TestResizer_ResizeImage_withTestData(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	resizer := NewResizer(logger)
	ctx := context.Background()

	t.Run("resize testdata jpeg", func(t *testing.T) {
		filePath := filepath.Join("..", "..", "testdata", "image.jpg")
		if _, err := os.Stat(filePath); os.IsNotExist(err) {
			t.Skip("testdata/image.jpg not found")
		}

		encoder, err := resizer.ResizeImage(ctx, filePath, 50)

		require.NoError(t, err)
		require.NotNil(t, encoder)

		var buf bytes.Buffer
		err = encoder.Encode(&buf)
		require.NoError(t, err)
		assert.Greater(t, buf.Len(), 0)
	})

	t.Run("resize testdata png", func(t *testing.T) {
		filePath := filepath.Join("..", "..", "testdata", "image.png")
		if _, err := os.Stat(filePath); os.IsNotExist(err) {
			t.Skip("testdata/image.png not found")
		}

		encoder, err := resizer.ResizeImage(ctx, filePath, 50)

		require.NoError(t, err)
		require.NotNil(t, encoder)

		var buf bytes.Buffer
		err = encoder.Encode(&buf)
		require.NoError(t, err)
		assert.Greater(t, buf.Len(), 0)
	})
}
