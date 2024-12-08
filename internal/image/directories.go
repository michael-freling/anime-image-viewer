package image

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"slices"
	"sort"

	"github.com/michael-freling/anime-image-viewer/internal/config"
	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/michael-freling/anime-image-viewer/internal/xslices"
	"github.com/wailsapp/wails/v3/pkg/application"
)

var (
	ErrDirectoryNotFound      = errors.New("directory not found")
	ErrDirectoryAlreadyExists = errors.New("directory already exists")
	ErrInvalidArgument        = errors.New("invalid argument")
)

type Directory struct {
	ID       uint
	Name     string
	Path     string
	ParentID uint
	Children []Directory
}

func (parent Directory) findChildByID(ID uint) Directory {
	for _, child := range parent.Children {
		if child.ID == ID {
			return child
		}
		result := child.findChildByID(ID)
		if result.ID != 0 {
			return result
		}
	}
	return Directory{}
}

type DirectoryService struct {
	ctx              context.Context
	config           config.Config
	dbClient         *db.Client
	imageFileService *ImageFileService
}

func NewDirectoryService(conf config.Config, dbClient *db.Client, imageFileService *ImageFileService) *DirectoryService {
	return &DirectoryService{
		config:           conf,
		dbClient:         dbClient,
		imageFileService: imageFileService,
	}
}

func (service *DirectoryService) OnStartup(ctx context.Context, options application.ServiceOptions) error {
	service.ctx = ctx
	return nil
}

func (service *DirectoryService) ReadInitialDirectory() string {
	return service.config.ImageRootDirectory
}

func (service *DirectoryService) ImportImages(directoryID uint) error {
	directory, err := service.readDirectory(directoryID)
	if err != nil {
		return fmt.Errorf("service.ReadDirectory: %w", err)
	}

	paths, err := application.OpenFileDialog().
		// CanChooseFiles(true).
		// CanChooseDirectories(true).
		// AddFilter("Images", "*.jpg;*.jpeg;*.png").
		AttachToWindow(application.Get().CurrentWindow()).
		PromptForMultipleSelection()
	if err != nil {
		return fmt.Errorf("application.OpenFileDialog: %w", err)
	}
	if len(paths) == 0 {
		return nil
	}

	return service.imageFileService.importImageFiles(directory, paths)
}

func (service *DirectoryService) ReadImageFiles(parentDirectoryID uint) ([]ImageFile, error) {
	parentDirectory, err := service.readDirectory(parentDirectoryID)
	if err != nil {
		if errors.Is(err, ErrDirectoryNotFound) {
			return nil, err
		}

		return nil, fmt.Errorf("service.readDirectory: %w", err)
	}

	imageFiles, err := db.NewFileClient(service.dbClient).
		FindImageFilesByParentID(parentDirectory.ID)
	if err != nil {
		return nil, fmt.Errorf("db.FindByValue: %w", err)
	}

	imageFileErrors := make([]error, 0)
	result := make([]ImageFile, 0)
	for _, imageFile := range imageFiles {
		imageFilePath := filepath.Join(parentDirectory.Path, imageFile.Name)
		if _, err := os.Stat(imageFilePath); err != nil {
			imageFileErrors = append(imageFileErrors, fmt.Errorf("os.Stat: %w", err))
			continue
		}
		file, err := os.Open(imageFilePath)
		if err != nil {
			imageFileErrors = append(imageFileErrors, fmt.Errorf("os.Open: %w", err))
			continue
		}
		defer file.Close()
		contentType, err := getContentType(file)
		if err != nil {
			imageFileErrors = append(imageFileErrors, err)
			continue
		}
		if !slices.Contains(supportedContentTypes, contentType) {
			imageFileErrors = append(imageFileErrors, fmt.Errorf("%w: %s", ErrUnsupportedImageFile, imageFilePath))
			continue
		}

		result = append(result, ImageFile{
			ID:          imageFile.ID,
			Name:        imageFile.Name,
			Path:        imageFilePath,
			ContentType: contentType,
		})
	}
	if len(imageFileErrors) > 0 {
		return result, errors.Join(imageFileErrors...)
	}
	return result, nil
}

func (service *DirectoryService) CreateDirectory(name string, parentID uint) (Directory, error) {
	rootDirectory := service.ReadInitialDirectory()
	if parentID != 0 {
		currentDirectory, err := service.readDirectory(parentID)
		if err != nil {
			return Directory{}, fmt.Errorf("service.readDirectory: %w", err)
		}
		if currentDirectory.ID == 0 {
			return Directory{}, fmt.Errorf("%w: parent id %d", ErrDirectoryNotFound, parentID)
		}
		rootDirectory = currentDirectory.Path
	}

	directoryPath := path.Join(rootDirectory, name)
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

func (service *DirectoryService) CreateTopDirectory(name string) (Directory, error) {
	return service.CreateDirectory(name, db.RootDirectoryID)
}

func (service *DirectoryService) UpdateName(id uint, name string) (Directory, error) {
	directory, err := service.readDirectory(id)
	if err != nil {
		return Directory{}, fmt.Errorf("service.readDirectory: %w", err)
	}
	if directory.ID == 0 {
		return Directory{}, fmt.Errorf("%w for id: %d", ErrDirectoryNotFound, id)
	}
	if directory.Name == name {
		return directory, fmt.Errorf("%w: directory name hasn't been changed: %s", ErrInvalidArgument, name)
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

	directory.Name = name
	directory.Path = newDirectoryPath
	return directory, nil
}

func (service *DirectoryService) ReadChildDirectoriesRecursively(directoryID uint) ([]Directory, error) {
	directory, err := service.readDirectory(directoryID)
	if err != nil {
		return nil, fmt.Errorf("service.ReadDirectory: %w", err)
	}
	return directory.Children, nil
}

func (service *DirectoryService) readDirectory(directoryID uint) (Directory, error) {
	// todo: cache the result of the list of directories
	result := Directory{}

	// todo: this query fetches both of directories and images
	allDirectories, err := db.GetAll[db.File](service.dbClient)
	if err != nil {
		return result, fmt.Errorf("db.GetAll: %w", err)
	}
	allDirectories = xslices.Filter(allDirectories, func(directory db.File) bool {
		return directory.Type == db.FileTypeDirectory
	})
	if len(allDirectories) == 0 {
		return result, ErrDirectoryNotFound
	}

	childMap := make(map[uint][]Directory)
	for _, t := range allDirectories {
		if _, ok := childMap[t.ParentID]; ok {
			continue
		}
		childMap[t.ParentID] = make([]Directory, 0)
	}
	directoryMap := make(map[uint]Directory)
	directoryMap[db.RootDirectoryID] = Directory{
		ID:   db.RootDirectoryID,
		Name: service.ReadInitialDirectory(),
		Path: service.ReadInitialDirectory(),
	}
	for _, dbDirectory := range allDirectories {
		directoryMap[dbDirectory.ID] = Directory{
			ID:       dbDirectory.ID,
			Name:     dbDirectory.Name,
			ParentID: dbDirectory.ParentID,
		}

		childMap[dbDirectory.ParentID] = append(childMap[dbDirectory.ParentID], directoryMap[dbDirectory.ID])
	}

	rootDirectory := service.ReadInitialDirectory()
	directoryTree := createDirectoryTree(directoryMap, childMap, db.RootDirectoryID, rootDirectory)
	if directoryID == db.RootDirectoryID {
		return directoryTree, nil
	}
	dir := directoryTree.findChildByID(directoryID)
	if dir.ID == 0 {
		return Directory{}, ErrDirectoryNotFound
	}
	return dir, nil
}

func createDirectoryTree(
	directoryMap map[uint]Directory,
	childMap map[uint][]Directory,
	directoryID uint,
	directoryPath string,
) Directory {
	currentDirectory := directoryMap[directoryID]
	currentDirectory.Path = directoryPath
	if _, ok := childMap[directoryID]; !ok {
		return currentDirectory
	}

	currentDirectory.Children = make([]Directory, len(childMap[directoryID]))
	for i, child := range childMap[directoryID] {
		currentDirectory.Children[i] = createDirectoryTree(directoryMap, childMap, child.ID, path.Join(directoryPath, child.Name))
	}
	sort.Slice(currentDirectory.Children, func(i, j int) bool {
		return currentDirectory.Children[i].Name < currentDirectory.Children[j].Name
	})
	return currentDirectory
}
