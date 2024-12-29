package frontend

import (
	"context"

	"github.com/michael-freling/anime-image-viewer/internal/image"
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
	return service.imageReader.ReadImagesByIDs(imageIDs)
}

type Image struct {
	ID   uint   `json:"id"`
	Name string `json:"name"`
	Path string `json:"path"`

	// legacy fields: May not necessary
	parentID uint
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

			parentID: imageFile.ParentID,
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