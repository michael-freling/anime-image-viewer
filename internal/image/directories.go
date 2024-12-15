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
	"strings"

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
	ID              uint
	Name            string
	Path            string
	ParentID        uint
	Children        []Directory
	ChildImageFiles []ImageFile
}

func (directory Directory) toFile() File {
	return File{
		ID:       directory.ID,
		Name:     directory.Name,
		ParentID: directory.ParentID,
	}
}

func (directory Directory) toFlatIDMap() map[uint][]uint {
	result := make(map[uint][]uint, 0)

	ids := make([]uint, 0)
	for _, child := range directory.Children {
		for id, childIDs := range child.toFlatIDMap() {
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

func (parent Directory) getDescendants() []Directory {
	result := make([]Directory, 0)
	for _, child := range parent.Children {
		result = append(result, child)
		result = append(result, child.getDescendants()...)
	}
	return result
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

	imageFiles, err := service.dbClient.File().
		FindImageFilesByParentID(parentDirectory.ID)
	if err != nil {
		return nil, fmt.Errorf("db.FindByValue: %w", err)
	}

	imageFileErrors := make([]error, 0)
	result := make([]ImageFile, 0)
	for _, imageFile := range imageFiles {
		imageFile, err := service.convertImageFile(parentDirectory, imageFile)
		if err != nil {
			imageFileErrors = append(imageFileErrors, err)
			continue
		}

		result = append(result, imageFile)
	}
	if len(imageFileErrors) > 0 {
		return result, errors.Join(imageFileErrors...)
	}
	return result, nil
}

func (service *DirectoryService) convertImageFile(parentDirectory Directory, imageFile db.File) (ImageFile, error) {
	imageFilePath := filepath.Join(parentDirectory.Path, imageFile.Name)
	if _, err := os.Stat(imageFilePath); err != nil {
		return ImageFile{}, fmt.Errorf("os.Stat: %w", err)
	}
	file, err := os.Open(imageFilePath)
	if err != nil {
		return ImageFile{}, fmt.Errorf("os.Open: %w", err)
	}
	defer file.Close()
	contentType, err := getContentType(file)
	if err != nil {
		return ImageFile{}, err
	}
	if !slices.Contains(supportedContentTypes, contentType) {
		return ImageFile{}, fmt.Errorf("%w: %s", ErrUnsupportedImageFile, imageFilePath)
	}

	// from the frontend, use a path only under an image root directory for a wails
	imageFilePath = "/files" + strings.TrimPrefix(imageFilePath, service.ReadInitialDirectory())
	return ImageFile{
		ID:          imageFile.ID,
		Name:        imageFile.Name,
		Path:        imageFilePath,
		ContentType: contentType,
	}, nil
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

// readAncestors reads the ancestors of the given file IDs, including the file itself.
func (service *DirectoryService) readAncestors(fileIDs []uint) (map[uint][]Directory, error) {
	rootDirectory, err := service.readDirectoryTree()
	if err != nil {
		return nil, fmt.Errorf("service.readDirectoryTree: %w", err)
	}

	result := make(map[uint][]Directory, 0)
	for _, fileID := range fileIDs {
		ancestors := rootDirectory.findAncestors(fileID)
		if len(ancestors) <= 1 {
			// if a file id is for a top directory, it doesn't have any ancestors
			continue
		}
		result[fileID] = ancestors[1:]
	}
	return result, nil
}

func (service *DirectoryService) readDirectoryTree() (Directory, error) {
	// todo: cache the result of the list of directories
	result := Directory{}

	// todo: this query fetches both of directories and images
	allFiles, err := db.GetAll[db.File](service.dbClient)
	if err != nil {
		return result, fmt.Errorf("db.GetAll: %w", err)
	}
	if len(allFiles) == 0 {
		return result, ErrDirectoryNotFound
	}

	childDirectoryMap := make(map[uint][]Directory)
	childImageFileMap := make(map[uint][]ImageFile)
	for _, file := range allFiles {
		if _, ok := childDirectoryMap[file.ParentID]; ok {
			continue
		}
		if file.Type == db.FileTypeDirectory {
			childDirectoryMap[file.ParentID] = make([]Directory, 0)
		}
		if file.Type == db.FileTypeImage {
			if _, ok := childImageFileMap[file.ParentID]; !ok {
				childImageFileMap[file.ParentID] = make([]ImageFile, 0)
			}
		}
	}
	directoryMap := make(map[uint]Directory)
	directoryMap[db.RootDirectoryID] = Directory{
		ID:       db.RootDirectoryID,
		Name:     service.ReadInitialDirectory(),
		Path:     service.ReadInitialDirectory(),
		ParentID: 0,
	}
	for _, dbFile := range allFiles {
		if dbFile.Type == db.FileTypeDirectory {
			directoryMap[dbFile.ID] = Directory{
				ID:       dbFile.ID,
				Name:     dbFile.Name,
				ParentID: dbFile.ParentID,
			}
			childDirectoryMap[dbFile.ParentID] = append(childDirectoryMap[dbFile.ParentID], directoryMap[dbFile.ID])
		}
		if dbFile.Type == db.FileTypeImage {
			childImageFileMap[dbFile.ParentID] = append(childImageFileMap[dbFile.ParentID], ImageFile{
				ID:       dbFile.ID,
				Name:     dbFile.Name,
				ParentID: dbFile.ParentID,
			})
		}
	}

	rootDirectory := service.ReadInitialDirectory()
	return createDirectoryTree(directoryMap, childDirectoryMap, childImageFileMap, db.RootDirectoryID, rootDirectory), nil
}

func (service *DirectoryService) readDirectories(directoryIDs []uint) (map[uint]Directory, error) {
	directoryTree, err := service.readDirectoryTree()
	if err != nil {
		return nil, fmt.Errorf("service.readDirectoryTree: %w", err)
	}

	dirErrors := make([]error, 0)
	result := make(map[uint]Directory, 0)
	for _, directoryID := range directoryIDs {
		directory := directoryTree.findChildByID(directoryID)
		if directory.ID == 0 {
			dirErrors = append(dirErrors, fmt.Errorf("%w: %d", ErrDirectoryNotFound, directoryID))
		}
		result[directoryID] = directory
	}
	if len(dirErrors) > 0 {
		return result, errors.Join(dirErrors...)
	}
	return result, nil
}

func (service *DirectoryService) readDirectory(directoryID uint) (Directory, error) {
	directoryTree, err := service.readDirectoryTree()
	if err != nil {
		return Directory{}, fmt.Errorf("service.readDirectoryTree: %w", err)
	}
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
	childDirectoryMap map[uint][]Directory,
	childImageFileMap map[uint][]ImageFile,
	directoryID uint,
	directoryPath string,
) Directory {
	currentDirectory := directoryMap[directoryID]
	currentDirectory.Path = directoryPath
	if _, ok := childImageFileMap[directoryID]; ok {
		currentDirectory.ChildImageFiles = childImageFileMap[directoryID]
	}

	if _, ok := childDirectoryMap[directoryID]; !ok {
		return currentDirectory
	}
	currentDirectory.Children = make([]Directory, len(childDirectoryMap[directoryID]))
	for i, child := range childDirectoryMap[directoryID] {
		currentDirectory.Children[i] = createDirectoryTree(
			directoryMap,
			childDirectoryMap,
			childImageFileMap,
			child.ID,
			filepath.Join(directoryPath, child.Name),
		)
	}
	sort.Slice(currentDirectory.Children, func(i, j int) bool {
		return currentDirectory.Children[i].Name < currentDirectory.Children[j].Name
	})
	return currentDirectory
}
