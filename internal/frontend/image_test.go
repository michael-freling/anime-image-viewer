package frontend

import (
	"github.com/michael-freling/anime-image-viewer/internal/image"
)

type fileBuilder struct {
	*image.FileBuilder
}

func (builder fileBuilder) buildFrontendImage(id uint) Image {
	image := builder.BuildImageFile(id)
	return Image{
		ID:   image.ID,
		Name: image.Name,
		Path: image.Path,
	}
}
