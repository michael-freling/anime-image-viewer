package image

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"strings"

	"github.com/michael-freling/anime-image-viewer/internal/config"
	"github.com/michael-freling/anime-image-viewer/internal/db"
)

type ImageFile struct {
	ID            uint
	Name          string
	Path          string
	LocalFilePath string
	ParentID      uint
	ContentType   string
}

func (imageFile ImageFile) toFile() File {
	return File{
		ID:       imageFile.ID,
		Name:     imageFile.Name,
		ParentID: imageFile.ParentID,
	}
}

var (
	supportedContentTypes = []string{
		"image/jpeg",
		"image/png",
	}
)

func Copy(sourceFilePath, destinationFilePath string) (int64, error) {
	source, err := os.Open(sourceFilePath)
	if err != nil {
		return 0, fmt.Errorf("os.Open > %W", err)
	}
	defer source.Close()

	destination, err := os.Create(destinationFilePath)
	if err != nil {
		return 0, fmt.Errorf("os.Create > %w", err)
	}
	defer destination.Close()

	bufferWriter := bufio.NewWriter(destination)
	nBytes, err := io.Copy(bufferWriter, bufio.NewReader(source))
	if err != nil {
		return nBytes, fmt.Errorf("io.Copy: %w", err)
	}
	if err = bufferWriter.Flush(); err != nil {
		return nBytes, fmt.Errorf("bufferWriter.Flush: %w", err)
	}
	return nBytes, nil
}

var (
	ErrUnsupportedImageFile = errors.New("unsupported image file")
	ErrFileAlreadyExists    = errors.New("file already exists")
)

func isSupportedImageFile(filePath string) error {
	file, err := os.Open(filePath)
	if err != nil {
		return fmt.Errorf("os.Open: %w", err)
	}
	defer file.Close()

	contentType, err := getContentType(file)
	if err != nil {
		return err
	}
	if !slices.Contains(supportedContentTypes, contentType) {
		return fmt.Errorf("%w: %s", ErrUnsupportedImageFile, contentType)
	}
	return nil
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

type ImageFileService struct {
	logger             *slog.Logger
	dbClient           *db.Client
	directoryReader    *DirectoryReader
	imageFileConverter *ImageFileConverter
}

func NewFileService(
	logger *slog.Logger,
	dbClient *db.Client,
	directoryReader *DirectoryReader,
	imageFileConverter *ImageFileConverter,
) *ImageFileService {
	return &ImageFileService{
		logger:             logger,
		dbClient:           dbClient,
		directoryReader:    directoryReader,
		imageFileConverter: imageFileConverter,
	}
}

func (service *ImageFileService) readImagesByIDs(ctx context.Context, imageFileIDs []uint) (map[uint]ImageFile, error) {
	dbImageFiles, err := service.dbClient.File().FindImageFilesByIDs(imageFileIDs)
	if err != nil {
		return nil, fmt.Errorf("FindImageFilesByIDs: %w", err)
	}
	dbParentIDs := make([]uint, 0)
	directoryFound := make(map[uint]bool, 0)
	for _, dbImageFile := range dbImageFiles {
		if _, ok := directoryFound[dbImageFile.ParentID]; ok {
			continue
		}
		directoryFound[dbImageFile.ParentID] = true
		dbParentIDs = append(dbParentIDs, dbImageFile.ParentID)
	}

	parentDirectories, err := service.directoryReader.readDirectories(dbParentIDs)
	if err != nil && !errors.Is(err, ErrDirectoryNotFound) {
		return nil, fmt.Errorf("directoryReader.readDirectories: %w", err)
	}
	parentDirectoriesMap := make(map[uint]Directory, 0)
	for _, parentDirectory := range parentDirectories {
		parentDirectoriesMap[parentDirectory.ID] = parentDirectory
	}

	imageFiles := make(map[uint]ImageFile, 0)
	for _, dbImageFile := range dbImageFiles {
		parentDirectory := parentDirectoriesMap[dbImageFile.ParentID]

		imageFile, err := service.imageFileConverter.convertImageFile(parentDirectory, dbImageFile)
		if err != nil {
			return nil, fmt.Errorf("convertImageFile: %w", err)
		}
		imageFiles[imageFile.ID] = imageFile
	}
	return imageFiles, nil
}

func (service *ImageFileService) validateImportImageFile(sourceFilePath string, destinationDirectory Directory) error {
	fileName := filepath.Base(sourceFilePath)
	destinationFilePath := filepath.Join(destinationDirectory.Path, fileName)

	if err := isSupportedImageFile(sourceFilePath); err != nil {
		return fmt.Errorf("%w: %s", ErrUnsupportedImageFile, sourceFilePath)
	}

	if _, err := os.Stat(destinationFilePath); err == nil {
		return fmt.Errorf("%w: %s", ErrFileAlreadyExists, destinationFilePath)
	} else if !errors.Is(err, fs.ErrNotExist) {
		return fmt.Errorf("os.Stat: %w: %s", err, destinationFilePath)
	}

	record, err := db.FindByValue(service.dbClient, &db.File{
		Name:     fileName,
		ParentID: destinationDirectory.ID,
	})
	if err != nil && !errors.Is(err, db.ErrRecordNotFound) {
		return fmt.Errorf("db.FindByValue: %w: %s/%s in DB", err, destinationDirectory.Path, fileName)
	}
	if record.ID != 0 {
		return fmt.Errorf("%w: %s/%s in DB", ErrFileAlreadyExists, destinationDirectory.Path, fileName)
	}

	return nil
}

func (service *ImageFileService) importImageFiles(ctx context.Context, destinationParentDirectory Directory, paths []string) ([]ImageFile, error) {
	imageErrors := make([]error, 0)
	newImages := make([]db.File, 0)
	newImagePaths := make([]string, 0)
	for _, sourceFilePath := range paths {
		fileName := filepath.Base(sourceFilePath)
		pathStat, err := os.Stat(sourceFilePath)
		if err != nil {
			imageErrors = append(imageErrors, fmt.Errorf("os.Stat: %w: %s", err, sourceFilePath))
			continue
		}
		if pathStat.IsDir() {
			// if it's a directory, import it recursively
			// todo
			continue
		}
		if err := service.validateImportImageFile(sourceFilePath, destinationParentDirectory); err != nil {
			imageErrors = append(imageErrors, err)
			continue
		}

		newImages = append(newImages, db.File{
			Name:     fileName,
			ParentID: destinationParentDirectory.ID,
			Type:     db.FileTypeImage,
		})
		newImagePaths = append(newImagePaths, sourceFilePath)
	}
	service.logger.DebugContext(ctx, "importImageFiles",
		"directory", destinationParentDirectory,
		"paths", paths,
		"newImages", newImages,
		"imageErrors", imageErrors,
	)
	if len(newImages) == 0 {
		return nil, errors.Join(imageErrors...)
	}

	if err := db.BatchCreate(service.dbClient, newImages); err != nil {
		imageErrors = append(imageErrors, fmt.Errorf("BatchCreate: %w", err))
		return nil, errors.Join(imageErrors...)
	}

	resultImageFiles := make([]ImageFile, 0)
	for index, image := range newImages {
		sourceFilePath := newImagePaths[index]
		destinationFilePath := filepath.Join(destinationParentDirectory.Path, image.Name)
		if _, err := Copy(sourceFilePath, destinationFilePath); err != nil {
			imageErrors = append(imageErrors, fmt.Errorf("copy: %w", err))
			continue
		}
		resultImage, err := service.imageFileConverter.convertImageFile(destinationParentDirectory, image)
		if err != nil {
			imageErrors = append(imageErrors, fmt.Errorf("convertImageFile: %w", err))
			continue
		}
		resultImageFiles = append(resultImageFiles, resultImage)
	}
	if len(imageErrors) > 0 {
		return resultImageFiles, errors.Join(imageErrors...)
	}

	return resultImageFiles, nil
}

type StaticFileService struct {
	rootDirectory string
	fileServer    http.Handler
	logger        *slog.Logger
}

func NewStaticFileService(
	logger *slog.Logger,
	conf config.Config,
) *StaticFileService {
	return &StaticFileService{
		rootDirectory: conf.ImageRootDirectory,
		fileServer:    http.FileServer(http.Dir(conf.ImageRootDirectory)),
		logger:        logger,
	}
}

func (service *StaticFileService) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	service.logger.Debug("StaticFileService.ServeHTTP",
		"r.URL.Path", r.URL.Path,
	)
	service.fileServer.ServeHTTP(w, r)
}

type ImageFileConverter struct {
	config config.Config
}

func NewImageFileConverter(config config.Config) *ImageFileConverter {
	return &ImageFileConverter{
		config: config,
	}
}

func (converter ImageFileConverter) convertImageFile(parentDirectory Directory, imageFile db.File) (ImageFile, error) {
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

	return ImageFile{
		ID:   imageFile.ID,
		Name: imageFile.Name,
		// from the frontend, use a path only under an image root directory for a wails
		Path:          "/files" + strings.TrimPrefix(imageFilePath, converter.config.ImageRootDirectory),
		LocalFilePath: imageFilePath,
		ParentID:      imageFile.ParentID,
		ContentType:   contentType,
	}, nil
}
