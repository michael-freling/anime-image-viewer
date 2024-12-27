package frontend

import (
	"context"
	"fmt"

	"github.com/michael-freling/anime-image-viewer/internal/image"
	"github.com/michael-freling/anime-image-viewer/internal/tag"
)

type SearchService struct {
	directoryReader *image.DirectoryReader
	tagReader       *tag.Reader
}

func NewSearchService(
	directoryReader *image.DirectoryReader,
	tagReader *tag.Reader,
) *SearchService {
	return &SearchService{
		directoryReader: directoryReader,
		tagReader:       tagReader,
	}
}

type Image struct {
	ID   uint   `json:"id"`
	Name string `json:"name"`
	Path string `json:"path"`

	TagIDs []uint `json:"tagIds"`
}

type SearchImageFilesInDirectoryResponse struct {
	Images []Image `json:"images"`
}

func (service SearchService) SearchImageFilesInDirectory(
	ctx context.Context,
	parentDirectoryID uint,
) (SearchImageFilesInDirectoryResponse, error) {
	imageFiles, err := service.directoryReader.ReadImageFiles(parentDirectoryID)
	if err != nil {
		return SearchImageFilesInDirectoryResponse{}, fmt.Errorf("service.directoryReader.ReadImageFiles: %w", err)
	}
	if len(imageFiles) == 0 {
		return SearchImageFilesInDirectoryResponse{}, fmt.Errorf("no image files found in directory")
	}

	batchImageConverter := newBatchImageConverter(imageFiles)
	return SearchImageFilesInDirectoryResponse{
		Images: batchImageConverter.Convert(),
	}, nil
}
