package frontend

import (
	"github.com/michael-freling/anime-image-viewer/internal/image"
)

type fileCreator struct {
	*image.FileCreator
}

func (builder fileCreator) buildFrontendImage(id uint) Image {
	image := builder.BuildImageFile(id)
	return Image{
		ID:   image.ID,
		Name: image.Name,
		Path: image.Path,
	}
}
