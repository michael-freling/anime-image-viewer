package image

import (
	"errors"
	"fmt"
	"path/filepath"
	"sort"

	"github.com/michael-freling/anime-image-viewer/internal/config"
	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/michael-freling/anime-image-viewer/internal/xslices"
)

type DirectoryReader struct {
	dbClient *db.Client
	config   config.Config

	converter *ImageFileConverter
}

func NewDirectoryReader(config config.Config, dbClient *db.Client) *DirectoryReader {
	return &DirectoryReader{
		dbClient:  dbClient,
		config:    config,
		converter: NewImageFileConverter(config),
	}
}

func (service DirectoryReader) readInitialDirectory() string {
	return service.config.ImageRootDirectory
}

func (service DirectoryReader) ReadImageFiles(parentDirectoryID uint) ([]ImageFile, error) {
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
		imageFile, err := service.converter.ConvertImageFile(parentDirectory, imageFile)
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

func (service DirectoryReader) ReadImageFilesRecursively(directory Directory) ([]ImageFile, error) {
	imageFiles, err := service.ReadImageFiles(directory.ID)
	if err != nil {
		return nil, fmt.Errorf("service.ReadImageFiles: %w", err)
	}
	for _, childDirectory := range directory.Children {
		childImageFiles, err := service.ReadImageFilesRecursively(*childDirectory)
		if err != nil {
			return nil, fmt.Errorf("service.readImageFilesRecursively: %w", err)
		}
		imageFiles = append(imageFiles, childImageFiles...)
	}
	return imageFiles, nil
}

func (service DirectoryReader) ReadChildDirectoriesRecursively(directoryID uint) ([]Directory, error) {
	directory, err := service.readDirectory(directoryID)
	if err != nil {
		return nil, fmt.Errorf("service.ReadDirectory: %w", err)
	}
	return xslices.Map(directory.dropChildImageFiles().Children, func(dir *Directory) Directory {
		return *dir
	}), nil
}

// ReadAncestors reads the ancestors of the given file IDs, including the file itself.
func (service DirectoryReader) ReadAncestors(fileIDs []uint) (map[uint][]Directory, error) {
	rootDirectory, err := service.ReadDirectoryTree()
	if err != nil {
		return nil, fmt.Errorf("service.ReadDirectoryTree: %w", err)
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

func (service DirectoryReader) ReadDirectoryTree() (Directory, error) {
	// todo: cache the result of the list of directories
	result := Directory{}

	// todo: this query fetches both of directories and images
	allFiles, err := db.GetAll[db.File](service.dbClient)
	if err != nil {
		return result, fmt.Errorf("db.GetAll: %w", err)
	}
	if len(allFiles) == 0 {
		return result, fmt.Errorf("db.GetAll: %w", ErrDirectoryNotFound)
	}

	childDirectoryMap := make(map[uint][]*Directory)
	childImageFileMap := make(map[uint][]*ImageFile)
	for _, file := range allFiles {
		if _, ok := childDirectoryMap[file.ParentID]; ok {
			continue
		}
		if file.Type == db.FileTypeDirectory {
			childDirectoryMap[file.ParentID] = make([]*Directory, 0)
		}
		if file.Type == db.FileTypeImage {
			if _, ok := childImageFileMap[file.ParentID]; !ok {
				childImageFileMap[file.ParentID] = make([]*ImageFile, 0)
			}
		}
	}
	directoryMap := make(map[uint]*Directory)
	directoryMap[db.RootDirectoryID] = &Directory{
		ID:       db.RootDirectoryID,
		Name:     service.readInitialDirectory(),
		Path:     service.readInitialDirectory(),
		ParentID: 0,
	}
	for _, dbFile := range allFiles {
		if dbFile.Type == db.FileTypeDirectory {
			directoryMap[dbFile.ID] = &Directory{
				ID:       dbFile.ID,
				Name:     dbFile.Name,
				ParentID: dbFile.ParentID,
			}
			childDirectoryMap[dbFile.ParentID] = append(childDirectoryMap[dbFile.ParentID], directoryMap[dbFile.ID])
		}
		if dbFile.Type == db.FileTypeImage {
			childImageFileMap[dbFile.ParentID] = append(childImageFileMap[dbFile.ParentID], &ImageFile{
				ID:       dbFile.ID,
				Name:     dbFile.Name,
				ParentID: dbFile.ParentID,
			})
		}
	}

	rootDirectoryPath := service.readInitialDirectory()
	root := createDirectoryTree(directoryMap, childDirectoryMap, childImageFileMap, db.RootDirectoryID, rootDirectoryPath)
	return *root, nil
}

func (service DirectoryReader) ReadDirectories(directoryIDs []uint) (map[uint]Directory, error) {
	directoryTree, err := service.ReadDirectoryTree()
	if err != nil {
		return nil, fmt.Errorf("service.readDirectoryTree: %w", err)
	}

	dirErrors := make([]error, 0)
	result := make(map[uint]Directory, 0)
	for _, directoryID := range directoryIDs {
		directory := directoryTree.FindChildByID(directoryID)
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

func (service DirectoryReader) readDirectory(directoryID uint) (Directory, error) {
	directoryTree, err := service.ReadDirectoryTree()
	if err != nil {
		return Directory{}, fmt.Errorf("service.readDirectoryTree: %w", err)
	}
	if directoryID == db.RootDirectoryID {
		return directoryTree, nil
	}
	dir := directoryTree.FindChildByID(directoryID)
	if dir.ID == 0 {
		return Directory{}, ErrDirectoryNotFound
	}
	return dir, nil
}

func createDirectoryTree(
	directoryMap map[uint]*Directory,
	childDirectoryMap map[uint][]*Directory,
	childImageFileMap map[uint][]*ImageFile,
	directoryID uint,
	directoryPath string,
) *Directory {
	currentDirectory := directoryMap[directoryID]
	currentDirectory.Path = directoryPath
	if _, ok := childImageFileMap[directoryID]; ok {
		currentDirectory.ChildImageFiles = childImageFileMap[directoryID]
	}

	if _, ok := childDirectoryMap[directoryID]; !ok {
		return currentDirectory
	}
	currentDirectory.Children = make([]*Directory, len(childDirectoryMap[directoryID]))
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
