package image

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"image"
	"image/jpeg"
	"image/png"
	"io"
	"log/slog"
	"os"

	"golang.org/x/image/draw"
)

type Resizer struct {
	logger *slog.Logger
}

func NewResizer(logger *slog.Logger) *Resizer {
	return &Resizer{
		logger: logger,
	}
}

func (service *Resizer) ResizeImage(
	ctx context.Context,
	localImageFilePath string,
	width int,
) (Encoder, error) {
	originalFile, err := os.Open(localImageFilePath)
	if err != nil {
		return nil, fmt.Errorf("os.Open: %w", err)
	}
	defer originalFile.Close()

	sourceImage, imageFormat, err := image.Decode(bufio.NewReader(originalFile))
	service.logger.DebugContext(ctx, "image file format",
		"format", imageFormat,
		"local file path", localImageFilePath,
	)
	if err != nil {
		if errors.Is(err, image.ErrFormat) {
			service.logger.ErrorContext(ctx, "an uploaded image file was not supported",
				"local file path", localImageFilePath,
			)
			return nil, fmt.Errorf("unsupported image file: %w", err)
		}
		return nil, fmt.Errorf("image.Decode: %w", err)
	}

	// Resize: https://stackoverflow.com/a/67678654
	sourceSize := sourceImage.Bounds().Max
	// aspectRatio := float64(srcRectangle.X) / float64(srcRectangle.Y)
	// height := int(float64(width) / aspectRatio)
	height := (width * sourceSize.Y) / sourceSize.X
	destImage := image.NewRGBA(image.Rect(
		0,
		0,
		width,
		height,
	))
	draw.ApproxBiLinear.Scale(
		destImage,
		destImage.Rect,
		sourceImage,
		sourceImage.Bounds(),
		draw.Over,
		nil,
	)

	encoders := map[string]func(image.Image) Encoder{
		"jpeg": func(image image.Image) Encoder {
			return JpegEncoder{image: image}
		},
		"png": func(image image.Image) Encoder {
			return PngEncoder{image: image}
		},
	}
	encodeFunc, ok := encoders[imageFormat]
	if !ok {
		return nil, fmt.Errorf("unsupported image format for an encoder: %s", imageFormat)
	}
	return encodeFunc(destImage), nil
}

type Encoder interface {
	Encode(w io.Writer) error
}

var (
	_ Encoder = (*JpegEncoder)(nil)
	_ Encoder = (*PngEncoder)(nil)
)

type JpegEncoder struct {
	image image.Image
}

func (j JpegEncoder) Encode(w io.Writer) error {
	return jpeg.Encode(w, j.image, nil)
}

type PngEncoder struct {
	image image.Image
}

func (p PngEncoder) Encode(w io.Writer) error {
	return png.Encode(w, p.image)
}
