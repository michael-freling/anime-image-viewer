package frontend

import (
	"context"
	"fmt"

	"github.com/michael-freling/anime-image-viewer/internal/image"
	"github.com/wailsapp/wails/v3/pkg/application"
)

type ImageService struct {
	imageReader *image.Reader
}

func NewImageService(imageReader *image.Reader) *ImageService {
	return &ImageService{
		imageReader: imageReader,
	}
}

func (service *ImageService) ReadImagesByIDs(ctx context.Context, imageIDs []uint) (map[uint]image.ImageFile, error) {
	list, err := service.imageReader.ReadImagesByIDs(imageIDs)
	if err != nil {
		return nil, err
	}
	return list.ToMap(), nil
}

func (service *ImageService) OpenImageInOS(ctx context.Context, imageID uint) error {
	imageFiles, err := service.imageReader.ReadImagesByIDs([]uint{imageID})
	if err != nil {
		return fmt.Errorf("ReadImagesByIDs: %w", err)
	}
	if len(imageFiles) == 0 {
		return fmt.Errorf("image not found: %d", imageID)
	}

	app := application.Get()
	return app.BrowserOpenFile(imageFiles[0].LocalFilePath)
}

// ShowImageInExplorer opens the system file explorer with the image's file
// selected. On Windows this uses `explorer /select,`, on macOS `open -R`,
// and on Linux `xdg-open` on the parent directory.
func (service *ImageService) ShowImageInExplorer(ctx context.Context, imageID uint) error {
	imageFiles, err := service.imageReader.ReadImagesByIDs([]uint{imageID})
	if err != nil {
		return fmt.Errorf("ReadImagesByIDs: %w", err)
	}
	if len(imageFiles) == 0 {
		return fmt.Errorf("image not found: %d", imageID)
	}

	return showInExplorer(imageFiles[0].LocalFilePath)
}

type Image struct {
	ID   uint   `json:"id"`
	Name string `json:"name"`
	Path string `json:"path"`
}

type imageConverter struct {
	converted Image
}

func newImageConverterFromImageFiles(imageFile image.ImageFile) *imageConverter {
	return &imageConverter{
		converted: Image{
			ID:   imageFile.ID,
			Name: imageFile.Name,
			Path: imageFile.Path,
		},
	}
}

func (converter *imageConverter) Convert() Image {
	return converter.converted
}

type batchImageConverter struct {
	imageFiles []image.ImageFile
}

func newBatchImageConverter(imageFiles []image.ImageFile) *batchImageConverter {
	return &batchImageConverter{
		imageFiles: imageFiles,
	}
}

func (converter batchImageConverter) Convert() []Image {
	images := make([]Image, len(converter.imageFiles))
	for i, imageFile := range converter.imageFiles {
		images[i] = newImageConverterFromImageFiles(imageFile).
			Convert()
	}
	return images
}
