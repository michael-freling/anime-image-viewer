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
	DirectoryID         uint `json:"directoryId,omitempty"`
	TagID               uint `json:"tagId,omitempty"`
	IsInvertedTagSearch bool `json:"isInvertedTagSearch,omitempty"`
}

type SearchImagesResponse struct {
	Images []Image `json:"images"`

	// tag ids to image ids
	TaggedImages map[uint][]uint `json:"taggedImages"`
}

func (service SearchService) validateSearchImagesRequest(request SearchImagesRequest) error {
	if request.DirectoryID == 0 && request.TagID == 0 {
		return fmt.Errorf("%w: either parentDirectoryId or tagId is required", xerrors.ErrInvalidArgument)
	}
	if request.IsInvertedTagSearch && request.DirectoryID == 0 {
		return fmt.Errorf("%w: parentDirectoryId is required for an inverted tag search", xerrors.ErrInvalidArgument)
	}
	return nil
}

func (service SearchService) SearchImages(
	ctx context.Context,
	request SearchImagesRequest,
) (SearchImagesResponse, error) {
	var imageFiles []image.ImageFile

	if err := service.validateSearchImagesRequest(request); err != nil {
		return SearchImagesResponse{}, err
	}

	var fileIDs []uint
	if request.DirectoryID != 0 && request.TagID == 0 {
		var err error
		imageFiles, err = service.directoryReader.ReadImageFiles(request.DirectoryID)
		if err != nil {
			return SearchImagesResponse{}, fmt.Errorf("service.directoryReader.ReadImageFiles: %w", err)
		}
		if len(imageFiles) == 0 {
			return SearchImagesResponse{}, nil
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
	tagFinder, err := service.searchRunner.SearchImages(
		ctx,
		request.TagID,
		request.IsInvertedTagSearch,
		request.DirectoryID,
	)
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
