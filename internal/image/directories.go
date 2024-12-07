package image

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"os"
	"path"
	"path/filepath"
	"slices"
	"sort"

	"github.com/michael-freling/anime-image-viewer/internal/config"
	"github.com/michael-freling/anime-image-viewer/internal/db"
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
	ctx      context.Context
	config   config.Config
	dbClient *db.Client
}

func NewDirectoryService(conf config.Config, dbClient *db.Client) *DirectoryService {
	return &DirectoryService{
		config:   conf,
		dbClient: dbClient,
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

	unsupportedFiles := make([]string, 0)
	existedFiles := make([]string, 0)
	for _, sourceFilePath := range paths {
		fileName := filepath.Base(sourceFilePath)
		destinationFilePath := path.Join(directory.Path, fileName)
		if err := copyImage(sourceFilePath, destinationFilePath); err != nil {
			if errors.Is(err, ErrUnsupportedImageFile) {
				unsupportedFiles = append(unsupportedFiles, sourceFilePath)
				continue
			}
			if errors.Is(err, ErrFileAlreadyExists) {
				existedFiles = append(existedFiles, destinationFilePath)
				continue
			}
			return fmt.Errorf("copyImage: %w", err)
		}
	}
	logger := application.Get().Logger
	logger.InfoContext(service.ctx, "copy complete",
		"directory", directory,
		"unsupportedFiles", unsupportedFiles,
		"existedFiles", existedFiles,
		"paths", paths,
	)

	return nil
}

func (service *DirectoryService) ReadImageFiles(directoryId uint) ([]ImageFile, error) {
	directory, err := service.readDirectory(directoryId)
	if err != nil {
		if errors.Is(err, ErrDirectoryNotFound) {
			return nil, err
		}

		return nil, fmt.Errorf("service.readDirectory: %w", err)
	}

	directoryPath := directory.Path
	entries, err := os.ReadDir(directoryPath)
	if err != nil {
		return nil, fmt.Errorf("os.ReadDir: %w", err)
	}

	errors := make([]error, 0)
	result := make([]ImageFile, 0, len(entries))
	for _, entry := range entries {
		filename := entry.Name()
		if entry.IsDir() {
			continue
		}
		filePath := filepath.Join(directoryPath, filename)
		file, err := os.Open(filePath)
		if err != nil {
			errors = append(errors, fmt.Errorf("os.Open: %w", err))
			continue
		}
		defer file.Close()

		contentType, err := getContentType(file)
		if err != nil {
			errors = append(errors, err)
			continue
		}
		slog.DebugContext(service.ctx,
			"the content type of a file",
			"contentType", contentType,
			"filePath", filePath,
		)
		if !slices.Contains(supportedContentTypes, contentType) {
			continue
		}

		result = append(result, ImageFile{
			Name:        filename,
			Path:        filePath,
			ContentType: contentType,
		})
	}
	if len(errors) > 0 {
		return result, fmt.Errorf("failed to read some image files: %v", errors)
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

	var directory db.Directory
	err := db.NewTransaction(service.dbClient, func(ormClient *db.ORMClient[db.Directory]) error {
		record, err := ormClient.FindByValue(&db.Directory{
			Name:     name,
			ParentID: parentID,
		})
		if err != nil && err != db.ErrRecordNotFound {
			return fmt.Errorf("ormClient.FindByValue: %w", err)
		}
		if record.ID != 0 && record.ParentID == parentID {
			return fmt.Errorf("%w: %s", ErrDirectoryAlreadyExists, record.Name)
		}

		directory = db.Directory{
			Name:     name,
			ParentID: parentID,
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

	_, err = db.FindByValue(service.dbClient, db.Directory{
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

	err = db.NewTransaction(service.dbClient, func(ormClient *db.ORMClient[db.Directory]) error {
		record, err := ormClient.FindByValue(&db.Directory{
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

	allDirectories, err := db.GetAll[db.Directory](service.dbClient)
	if err != nil {
		return result, fmt.Errorf("ormClient.GetAll: %w", err)
	}
	if len(allDirectories) == 0 {
		return result, nil
	}

	childMap := make(map[uint][]Directory)
	for _, t := range allDirectories {
		if _, ok := childMap[t.ParentID]; ok {
			continue
		}
		childMap[t.ParentID] = make([]Directory, 0)
	}
	directoryMap := make(map[uint]Directory)
	directoryMap[0] = Directory{
		ID:   0,
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
	directoryTree := createDirectoryTree(directoryMap, childMap, 0, rootDirectory)
	if directoryID == 0 {
		return directoryTree, nil
	}
	return directoryTree.findChildByID(directoryID), nil
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
