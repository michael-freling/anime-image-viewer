package frontend

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path"
	"path/filepath"

	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/michael-freling/anime-image-viewer/internal/image"
	"github.com/michael-freling/anime-image-viewer/internal/tag"
	"github.com/michael-freling/anime-image-viewer/internal/xerrors"
)

type Directory struct {
	ID       uint        `json:"id"`
	Name     string      `json:"name"`
	Path     string      `json:"path"`
	Children []Directory `json:"children"`
}

type directoryConverter struct {
}

func newDirectoryConverter() directoryConverter {
	return directoryConverter{}
}

func (converter directoryConverter) convertDirectory(directory image.Directory) Directory {
	var children []Directory
	if len(directory.Children) > 0 {
		children = make([]Directory, 0, len(directory.Children))
		for _, child := range directory.Children {
			children = append(children, converter.convertDirectory(*child))
		}
	}

	return Directory{
		ID:       directory.ID,
		Name:     directory.Name,
		Path:     directory.Path,
		Children: children,
	}
}

type DirectoryService struct {
	dbClient *db.Client

	reader    *image.DirectoryReader
	tagReader *tag.Reader
}

func NewDirectoryService(
	dbClient *db.Client,
	directoryReader *image.DirectoryReader,
	tagReader *tag.Reader,
) *DirectoryService {
	return &DirectoryService{
		dbClient:  dbClient,
		reader:    directoryReader,
		tagReader: tagReader,
	}
}

type ReadDirectoryTreeResponse struct {
	RootDirectory Directory `json:"rootDirectory"`

	// TagMap is a map of tag id to directory id, which doesn't include a parent-child relationships of
	// directories and tags.
	TagMap map[uint][]uint `json:"tagMap"`
}

func (service DirectoryService) ReadDirectoryTree(ctx context.Context) (ReadDirectoryTreeResponse, error) {
	directory, err := service.reader.ReadDirectoryTree()
	if err != nil {
		return ReadDirectoryTreeResponse{}, fmt.Errorf("service.directoryReader.ReadDirectoryTree: %w", err)
	}
	fileTags, err := service.tagReader.ReadDirectoryTags(ctx, directory)
	if err != nil {
		return ReadDirectoryTreeResponse{}, fmt.Errorf("service.tagReader.ReadDirectoryTags: %w", err)
	}
	resultTagMap := make(map[uint][]uint)
	for _, fileTag := range fileTags {
		if _, ok := resultTagMap[fileTag.FileID]; !ok {
			resultTagMap[fileTag.FileID] = make([]uint, 0)
		}
		resultTagMap[fileTag.FileID] = append(resultTagMap[fileTag.FileID], fileTag.TagID)
	}
	if len(resultTagMap) == 0 {
		resultTagMap = nil
	}

	return ReadDirectoryTreeResponse{
		RootDirectory: newDirectoryConverter().convertDirectory(directory),
		TagMap:        resultTagMap,
	}, nil
}

func (service DirectoryService) CreateDirectory(ctx context.Context, name string, parentID uint) (Directory, error) {
	rootDirectory := service.reader.ReadInitialDirectory()
	if parentID != 0 {
		currentDirectory, err := service.reader.ReadDirectory(parentID)
		if err != nil {
			return Directory{}, fmt.Errorf("service.readDirectory: %w", err)
		}
		if currentDirectory.ID == 0 {
			return Directory{}, fmt.Errorf("%w: parent id %d", image.ErrDirectoryNotFound, parentID)
		}
		rootDirectory = currentDirectory.Path
	}

	directoryPath := filepath.Join(rootDirectory, name)
	if _, err := os.Stat(directoryPath); err == nil {
		return Directory{}, fmt.Errorf("%w: %s", image.ErrDirectoryAlreadyExists, name)
	} else if !errors.Is(err, fs.ErrNotExist) {
		return Directory{}, fmt.Errorf("os.Stat: %w", err)
	}

	var directory db.File
	err := db.NewTransaction(ctx, service.dbClient, func(ctx context.Context) error {
		ormClient := service.dbClient.File()
		record, err := ormClient.FindByValue(ctx, &db.File{
			Name:     name,
			ParentID: parentID,
		})
		if err != nil && err != db.ErrRecordNotFound {
			return fmt.Errorf("ormClient.FindByValue: %w", err)
		}
		if record.ID != 0 && record.ParentID == parentID {
			return fmt.Errorf("%w: %s", image.ErrDirectoryAlreadyExists, record.Name)
		}

		directory = db.File{
			Name:     name,
			ParentID: parentID,
			Type:     db.FileTypeDirectory,
		}
		if err := ormClient.Create(ctx, &directory); err != nil {
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
		ID:   directory.ID,
		Name: directory.Name,
		Path: directoryPath,
	}, nil
}

func (service DirectoryService) UpdateName(ctx context.Context, id uint, name string) (Directory, error) {
	directory, err := service.reader.ReadDirectory(id)
	if err != nil {
		return Directory{}, fmt.Errorf("service.readDirectory: %w %d", err, id)
	}
	if directory.ID == 0 {
		return Directory{}, fmt.Errorf("%w for id: %d", image.ErrDirectoryNotFound, id)
	}
	if directory.Name == name {
		return Directory{}, fmt.Errorf("%w: directory name hasn't been changed: %s", xerrors.ErrInvalidArgument, name)
	}
	if _, err := os.Stat(directory.Path); err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return Directory{}, fmt.Errorf("%w in %s", image.ErrDirectoryNotFound, directory.Path)
		}
		return Directory{}, fmt.Errorf("os.Stat: %w", err)
	}

	_, err = db.FindByValue(service.dbClient, db.File{
		Name:     name,
		ParentID: directory.ParentID,
	})
	if err == nil && directory.ID != 0 {
		return Directory{}, fmt.Errorf("%w for %s under parent directory id %d", image.ErrDirectoryAlreadyExists, name, directory.ParentID)
	} else if !errors.Is(err, db.ErrRecordNotFound) {
		return Directory{}, fmt.Errorf("db.FindValue: (%w)", err)
	}

	newDirectoryPath := path.Join(filepath.Dir(directory.Path), name)
	if _, err := os.Stat(newDirectoryPath); err == nil {
		return Directory{}, fmt.Errorf("%w for a path: %s", image.ErrDirectoryAlreadyExists, newDirectoryPath)
	} else if !errors.Is(err, fs.ErrNotExist) {
		return Directory{}, fmt.Errorf("os.Stat: %w", err)
	}

	err = db.NewTransaction(ctx, service.dbClient, func(ctx context.Context) error {
		ormClient := service.dbClient.File()
		record, err := ormClient.FindByValue(ctx, &db.File{
			ID: id,
		})
		if err != nil {
			return fmt.Errorf("ormClient.FindByValue: %w", err)
		}

		record.Name = name
		if err := ormClient.Update(ctx, &record); err != nil {
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

	directory.UpdateName(name)
	return newDirectoryConverter().convertDirectory(directory), nil
}
