package frontend

import (
	"context"
	"fmt"

	"github.com/michael-freling/anime-image-viewer/internal/image"
	"github.com/michael-freling/anime-image-viewer/internal/tag"
	"github.com/michael-freling/anime-image-viewer/internal/xerrors"
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

type SearchImagesRequest struct {
	parentDirectoryID uint `json:"parentDirectoryId"`
	tagID             uint `json:"tagId"`
}

type SearchImagesResponse struct {
	Images []Image `json:"images"`

	// tag ids to image ids
	TaggedImages map[uint][]uint `json:"taggedImages"`
}

func (service SearchService) SearchImages(
	ctx context.Context,
	request SearchImagesRequest,
) (SearchImagesResponse, error) {
	var imageFiles []image.ImageFile

	if request.parentDirectoryID == 0 && request.tagID == 0 {
		return SearchImagesResponse{}, fmt.Errorf("%w: either parentDirectoryId or tagId is required", xerrors.ErrInvalidArgument)
	}
	if request.parentDirectoryID == 0 {
		// if no parent directory id, search files by tag id
		tagFinder, err := service.tagReader.ReadImageFiles(request.tagID)
		if err != nil {
			return SearchImagesResponse{}, fmt.Errorf("service.tagReader.ReadImageFiles: %w", err)
		}

		images := make([]Image, 0, len(tagFinder.Images))
		for _, imageFile := range tagFinder.Images {
			images = append(images, newImageConverterFromImageFiles(imageFile).Convert())
		}
		if len(tagFinder.Images) == 0 {
			images = nil
		}

		return SearchImagesResponse{
			Images:       images,
			TaggedImages: tagFinder.TaggedImages,
		}, nil
	}

	var err error
	imageFiles, err = service.directoryReader.ReadImageFiles(request.parentDirectoryID)
	if err != nil {
		return SearchImagesResponse{}, fmt.Errorf("service.directoryReader.ReadImageFiles: %w", err)
	}
	if len(imageFiles) == 0 {
		return SearchImagesResponse{}, fmt.Errorf("no image files found in directory")
	}

	batchImageConverter := newBatchImageConverter(imageFiles)
	return SearchImagesResponse{
		Images: batchImageConverter.Convert(),
	}, nil
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
