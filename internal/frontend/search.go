package frontend

import (
	"context"
	"fmt"

	"github.com/michael-freling/anime-image-viewer/internal/image"
	"github.com/michael-freling/anime-image-viewer/internal/search"
	"github.com/michael-freling/anime-image-viewer/internal/xerrors"
)

var (
	ErrImageNotFound = fmt.Errorf("directory not found")
)

type SearchService struct {
	searchRunner    *search.SearchImageRunner
	directoryReader *image.DirectoryReader
}

func NewSearchService(
	searchRunner *search.SearchImageRunner,
	directoryReader *image.DirectoryReader,
) *SearchService {
	return &SearchService{
		searchRunner:    searchRunner,
		directoryReader: directoryReader,
	}
}

type SearchImagesRequest struct {
	ParentDirectoryID uint `json:"parentDirectoryId,omitempty"`
	TagID             uint `json:"tagId,omitempty"`
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

	if request.ParentDirectoryID == 0 && request.TagID == 0 {
		return SearchImagesResponse{}, fmt.Errorf("%w: either parentDirectoryId or tagId is required", xerrors.ErrInvalidArgument)
	}

	var fileIDs []uint
	if request.ParentDirectoryID != 0 && request.TagID == 0 {
		var err error
		imageFiles, err = service.directoryReader.ReadImageFiles(request.ParentDirectoryID)
		if err != nil {
			return SearchImagesResponse{}, fmt.Errorf("service.directoryReader.ReadImageFiles: %w", err)
		}
		if len(imageFiles) == 0 {
			return SearchImagesResponse{}, fmt.Errorf("%w: no image files found in directory: %d", ErrImageNotFound, request.ParentDirectoryID)
		}
		for _, imageFile := range imageFiles {
			fileIDs = append(fileIDs, imageFile.ID)
		}

		batchImageConverter := newBatchImageConverter(imageFiles)
		return SearchImagesResponse{
			Images: batchImageConverter.Convert(),
		}, nil
	}

	// if there is no directory search, search files by tag id
	tagFinder, err := service.searchRunner.SearchImages(request.TagID, request.ParentDirectoryID)
	if err != nil {
		return SearchImagesResponse{}, fmt.Errorf("service.searchRunner.ReadImageFiles: %w", err)
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
