package image

import (
	"errors"
	"log/slog"
	"path/filepath"

	"github.com/michael-freling/anime-image-viewer/internal/config"
	"github.com/michael-freling/anime-image-viewer/internal/db"
)

var (
	ErrDirectoryNotFound      = errors.New("directory not found")
	ErrDirectoryAlreadyExists = errors.New("directory already exists")
	ErrImageFileNotFound      = errors.New("image file not found")
)

type Directory struct {
	ID              uint         `json:"id"`
	Name            string       `json:"name"`
	ParentID        uint         `json:"parentId"`
	Children        []*Directory `json:"children"`
	ChildImageFiles []*ImageFile `json:"childImageFiles"`

	// Path is the absolute path to the directory
	Path string `json:"path"`

	// RelativePath is the path relative to the root directory of images
	RelativePath string `json:"-"`
}

func (directory *Directory) UpdateName(newName string) *Directory {
	directory.Name = newName
	directory.Path = filepath.Join(filepath.Dir(directory.Path), newName)
	if directory.ParentID == 0 {
		directory.RelativePath = newName
	} else {
		directory.RelativePath = filepath.Join(filepath.Dir(directory.RelativePath), newName)
	}

	return directory
}

func (directory Directory) toFile() File {
	return File{
		ID:       directory.ID,
		Name:     directory.Name,
		ParentID: directory.ParentID,
	}
}

func (directory Directory) ToFlatIDMap() map[uint][]uint {
	result := make(map[uint][]uint, 0)

	ids := make([]uint, 0)
	for _, child := range directory.Children {
		for id, childIDs := range child.ToFlatIDMap() {
			result[id] = childIDs
			ids = append(ids, childIDs...)
		}
	}
	for _, child := range directory.ChildImageFiles {
		ids = append(ids, child.ID)
	}
	ids = append(ids, directory.ID)
	result[directory.ID] = ids
	return result
}

func (source Directory) dropChildImageFiles() Directory {
	destination := Directory{
		ID:       source.ID,
		Name:     source.Name,
		Path:     source.Path,
		ParentID: source.ParentID,
		Children: make([]*Directory, len(source.Children)),
	}
	for i, child := range source.Children {
		c := child.dropChildImageFiles()
		destination.Children[i] = &c
	}
	return destination
}

func (directory Directory) findAncestors(fileID uint) []Directory {
	for _, child := range directory.Children {
		if child.ID == fileID {
			return []Directory{directory}
		}

		ancestors := child.findAncestors(fileID)
		if len(ancestors) > 0 {
			return append([]Directory{directory}, ancestors...)
		}
	}
	for _, child := range directory.ChildImageFiles {
		if child.ID == fileID {
			return []Directory{directory}
		}
	}
	return nil
}

func (parent Directory) FindChildByID(ID uint) Directory {
	for _, child := range parent.Children {
		if child.ID == ID {
			return *child
		}
		result := child.FindChildByID(ID)
		if result.ID != 0 {
			return result
		}
	}
	return Directory{}
}

func (parent Directory) GetDescendants() []Directory {
	result := make([]Directory, 0)
	for _, child := range parent.Children {
		result = append(result, *child)
		result = append(result, child.GetDescendants()...)
	}
	return result
}

type DirectoryService struct {
	logger   *slog.Logger
	config   config.Config
	dbClient *db.Client

	reader           *DirectoryReader
	imageFileService *ImageFileService
}

func NewDirectoryService(
	logger *slog.Logger,
	conf config.Config,
	dbClient *db.Client,
	imageFileService *ImageFileService,
	directoryReader *DirectoryReader,
) *DirectoryService {
	service := &DirectoryService{
		logger:           logger,
		config:           conf,
		dbClient:         dbClient,
		imageFileService: imageFileService,
		reader:           directoryReader,
	}
	return service
}

func (service DirectoryService) ReadImageFiles(parentDirectoryID uint) ([]ImageFile, error) {
	return service.reader.ReadImageFiles(parentDirectoryID)
}
