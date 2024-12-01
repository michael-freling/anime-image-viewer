package image

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"slices"
	"sort"

	"github.com/michael-freling/anime-image-viewer/internal/config"
	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/wailsapp/wails/v3/pkg/application"
)

type Service struct {
	ctx      context.Context
	config   config.Config
	dbClient *db.Client
}

type Directory struct {
	ID       uint
	Name     string
	Path     string
	Children []Directory
}

func NewService(conf config.Config, dbClient *db.Client) *Service {
	return &Service{
		config:   conf,
		dbClient: dbClient,
	}
}

func (service *Service) OnStartup(ctx context.Context, options application.ServiceOptions) error {
	service.ctx = ctx
	return nil
}

func (service *Service) ReadInitialDirectory() string {
	return service.config.DefaultDirectory
}

func (service *Service) CreateTopDirectory(name string) (Directory, error) {
	directoryPath := path.Join(service.config.DefaultDirectory, name)
	_, err := os.Stat(directoryPath)
	if err == nil || !os.IsNotExist(err) {
		if err != nil {
			return Directory{}, fmt.Errorf("os.Stat: %w", err)
		}
		return Directory{}, fmt.Errorf("directory already exists: %s", name)
	}

	var directory db.Directory
	err = db.NewTransaction(service.dbClient, func(ormClient *db.ORMClient[db.Directory]) error {
		record, err := ormClient.FindByValue(&db.Directory{
			Name:     name,
			ParentID: 0,
		})
		if err != nil && err != db.ErrRecordNotFound {
			return fmt.Errorf("ormClient.FindByValue: %w", err)
		}
		if record.ID != 0 && record.ParentID == 0 {
			return fmt.Errorf("directory already exists: %s", name)
		}

		directory = db.Directory{
			Name: name,
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
		ID:   directory.ID,
		Name: directory.Name,
		Path: directoryPath,
	}, nil
}

func (service *Service) ReadChildDirectoriesRecursively(directoryID uint) ([]Directory, error) {
	// todo: cache the result of the list of directories
	allDirectories, err := db.GetAll[db.Directory](service.dbClient)
	if err != nil {
		return nil, fmt.Errorf("ormClient.GetAll: %w", err)
	}
	if len(allDirectories) == 0 {
		return nil, nil
	}

	childMap := make(map[uint][]Directory)
	for _, t := range allDirectories {
		if _, ok := childMap[t.ParentID]; ok {
			continue
		}
		childMap[t.ParentID] = make([]Directory, 0)
	}
	directoryMap := make(map[uint]Directory)
	for _, t := range allDirectories {
		directoryMap[t.ID] = Directory{
			ID:   t.ID,
			Name: t.Name,
		}

		childMap[t.ParentID] = append(childMap[t.ParentID], directoryMap[t.ID])
	}

	return createDirectoryTree(directoryMap, childMap, directoryID).Children, nil
}

func createDirectoryTree(directoryMap map[uint]Directory, childMap map[uint][]Directory, parentID uint) Directory {
	t := directoryMap[parentID]
	if _, ok := childMap[parentID]; !ok {
		return t
	}

	t.Children = make([]Directory, len(childMap[parentID]))
	for i, child := range childMap[parentID] {
		t.Children[i] = createDirectoryTree(directoryMap, childMap, child.ID)
	}
	sort.Slice(t.Children, func(i, j int) bool {
		return t.Children[i].Name < t.Children[j].Name
	})
	return t
}

type ImageFile struct {
	Name        string
	Path        string
	ContentType string
}

var (
	supportedContentTypes = []string{
		"image/jpeg",
		"image/png",
	}
)

func isSupportedImageFile(filePath string) (bool, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return false, fmt.Errorf("os.Open: %w", err)
	}
	defer file.Close()

	contentType, err := getContentType(file)
	if err != nil {
		return false, err
	}
	return slices.Contains(supportedContentTypes, contentType), nil
}

func getContentType(file *os.File) (string, error) {
	// https://stackoverflow.com/a/38175140
	data := make([]byte, 512)
	_, err := file.Read(data)
	if err != nil {
		return "", fmt.Errorf("file.Read: %w", err)
	}
	return http.DetectContentType(data), nil
}

func (service *Service) ReadImageFiles(directoryPath string) ([]ImageFile, error) {
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
