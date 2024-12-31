package image

import (
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"os"
	"path"
	"path/filepath"

	"github.com/michael-freling/anime-image-viewer/internal/config"
	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/michael-freling/anime-image-viewer/internal/xerrors"
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

func (directory *Directory) updateName(newName string) *Directory {
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

func (service DirectoryService) ReadInitialDirectory() string {
	return service.config.ImageRootDirectory
}

func (service DirectoryService) ReadImageFiles(parentDirectoryID uint) ([]ImageFile, error) {
	return service.reader.ReadImageFiles(parentDirectoryID)
}

func (service DirectoryService) ReadChildDirectoriesRecursively(directoryID uint) ([]Directory, error) {
	return service.reader.ReadChildDirectoriesRecursively(directoryID)
}

func (service DirectoryService) CreateDirectory(name string, parentID uint) (Directory, error) {
	rootDirectory := service.ReadInitialDirectory()
	if parentID != 0 {
		currentDirectory, err := service.reader.ReadDirectory(parentID)
		if err != nil {
			return Directory{}, fmt.Errorf("service.readDirectory: %w", err)
		}
		if currentDirectory.ID == 0 {
			return Directory{}, fmt.Errorf("%w: parent id %d", ErrDirectoryNotFound, parentID)
		}
		rootDirectory = currentDirectory.Path
	}

	directoryPath := filepath.Join(rootDirectory, name)
	if _, err := os.Stat(directoryPath); err == nil {
		return Directory{}, fmt.Errorf("%w: %s", ErrDirectoryAlreadyExists, name)
	} else if !errors.Is(err, fs.ErrNotExist) {
		return Directory{}, fmt.Errorf("os.Stat: %w", err)
	}

	var directory db.File
	err := db.NewTransaction(service.dbClient, func(ormClient *db.ORMClient[db.File]) error {
		record, err := ormClient.FindByValue(&db.File{
			Name:     name,
			ParentID: parentID,
		})
		if err != nil && err != db.ErrRecordNotFound {
			return fmt.Errorf("ormClient.FindByValue: %w", err)
		}
		if record.ID != 0 && record.ParentID == parentID {
			return fmt.Errorf("%w: %s", ErrDirectoryAlreadyExists, record.Name)
		}

		directory = db.File{
			Name:     name,
			ParentID: parentID,
			Type:     db.FileTypeDirectory,
		}
		if err := ormClient.Create(&directory); err != nil {
			return fmt.Errorf("ormClient.Create: %w", err)
		}

		// trying to create a directory
		if err := os.Mkdir(directoryPath, 0755); err != nil {
			return fmt.Errorf("os.Mkdir: %w", err)
		}
		return nil
	})
	if err != nil {
		return Directory{}, fmt.Errorf("db.NewTransaction: %w", err)
	}

	return Directory{
		ID:       directory.ID,
		Name:     directory.Name,
		Path:     directoryPath,
		ParentID: directory.ParentID,
	}, nil
}

func (service DirectoryService) CreateTopDirectory(name string) (Directory, error) {
	return service.CreateDirectory(name, db.RootDirectoryID)
}

func (service DirectoryService) UpdateName(id uint, name string) (Directory, error) {
	directory, err := service.reader.ReadDirectory(id)
	if err != nil {
		return Directory{}, fmt.Errorf("service.readDirectory: %w %d", err, id)
	}
	if directory.ID == 0 {
		return Directory{}, fmt.Errorf("%w for id: %d", ErrDirectoryNotFound, id)
	}
	if directory.Name == name {
		return directory, fmt.Errorf("%w: directory name hasn't been changed: %s", xerrors.ErrInvalidArgument, name)
	}
	if _, err := os.Stat(directory.Path); err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return Directory{}, fmt.Errorf("%w in %s", ErrDirectoryNotFound, directory.Path)
		}
		return Directory{}, fmt.Errorf("os.Stat: %w", err)
	}

	_, err = db.FindByValue(service.dbClient, db.File{
		Name:     name,
		ParentID: directory.ParentID,
	})
	if err == nil && directory.ID != 0 {
		return Directory{}, fmt.Errorf("%w for %s under parent directory id %d", ErrDirectoryAlreadyExists, name, directory.ParentID)
	} else if !errors.Is(err, db.ErrRecordNotFound) {
		return Directory{}, fmt.Errorf("db.FindValue: (%w)", err)
	}

	newDirectoryPath := path.Join(filepath.Dir(directory.Path), name)
	if _, err := os.Stat(newDirectoryPath); err == nil {
		return Directory{}, fmt.Errorf("%w for a path: %s", ErrDirectoryAlreadyExists, newDirectoryPath)
	} else if !errors.Is(err, fs.ErrNotExist) {
		return Directory{}, fmt.Errorf("os.Stat: %w", err)
	}

	err = db.NewTransaction(service.dbClient, func(ormClient *db.ORMClient[db.File]) error {
		record, err := ormClient.FindByValue(&db.File{
			ID: id,
		})
		if err != nil {
			return fmt.Errorf("ormClient.FindByValue: %w", err)
		}

		record.Name = name
		if err := ormClient.Update(&record); err != nil {
			return fmt.Errorf("ormClient.Save: %w", err)
		}

		// trying to create a directory
		if err := os.Rename(directory.Path, newDirectoryPath); err != nil {
			return fmt.Errorf("os.Rename: %w", err)
		}
		return nil
	})
	if err != nil {
		return Directory{}, fmt.Errorf("db.NewTransaction: %w", err)
	}

	directory.updateName(name)
	return directory, nil
}
