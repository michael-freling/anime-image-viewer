package image

import (
	"bufio"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"strings"

	"github.com/michael-freling/anime-image-viewer/internal/config"
	"github.com/michael-freling/anime-image-viewer/internal/db"
)

type File struct {
	ID       uint   `json:"id"`
	Name     string `json:"name"`
	ParentID uint   `json:"-"`
}

type ImageFile struct {
	ID            uint   `json:"id"`
	Name          string `json:"name"`
	Path          string `json:"path"`
	LocalFilePath string `json:"-"`
	ParentID      uint   `json:"-"`
	ContentType   string `json:"-"`
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

func IsSupportedImageFile(filePath string) error {
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

type Reader struct {
	dbClient           *db.Client
	directoryReader    *DirectoryReader
	imageFileConverter *ImageFileConverter
}

func NewReader(
	dbClient *db.Client,
	directoryReader *DirectoryReader,
	imageFileConverter *ImageFileConverter,
) *Reader {
	return &Reader{
		dbClient:           dbClient,
		directoryReader:    directoryReader,
		imageFileConverter: imageFileConverter,
	}
}

type ImageFileList []ImageFile

func (list ImageFileList) ToMap() map[uint]ImageFile {
	imageFiles := make(map[uint]ImageFile, 0)
	for _, imageFile := range list {
		imageFiles[imageFile.ID] = imageFile
	}
	return imageFiles
}

func (reader Reader) ReadImagesByIDs(imageFileIDs []uint) (ImageFileList, error) {
	dbImageFiles, err := reader.dbClient.File().
		FindImageFilesByIDs(imageFileIDs)
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

	parentDirectories, err := reader.directoryReader.ReadDirectories(dbParentIDs)
	if err != nil && !errors.Is(err, ErrDirectoryNotFound) {
		return nil, fmt.Errorf("directoryReader.readDirectories: %w", err)
	}
	parentDirectoriesMap := make(map[uint]Directory, 0)
	for _, parentDirectory := range parentDirectories {
		parentDirectoriesMap[parentDirectory.ID] = parentDirectory
	}

	imageFiles := make(ImageFileList, len(dbImageFiles))
	for index, dbImageFile := range dbImageFiles {
		parentDirectory := parentDirectoriesMap[dbImageFile.ParentID]

		imageFile, err := reader.imageFileConverter.ConvertImageFile(parentDirectory, dbImageFile)
		if err != nil {
			return nil, fmt.Errorf("convertImageFile: %w", err)
		}
		imageFiles[index] = imageFile
	}
	return imageFiles, nil
}

type ImageFileService struct {
	logger   *slog.Logger
	dbClient *db.Client

	imageFileConverter *ImageFileConverter
}

func NewFileService(
	logger *slog.Logger,
	dbClient *db.Client,
	directoryReader *DirectoryReader,
	imageFileConverter *ImageFileConverter,
) *ImageFileService {
	return &ImageFileService{
		logger:   logger,
		dbClient: dbClient,

		imageFileConverter: imageFileConverter,
	}
}

type ImageFileConverter struct {
	config config.Config
}

func NewImageFileConverter(config config.Config) *ImageFileConverter {
	return &ImageFileConverter{
		config: config,
	}
}

func (converter ImageFileConverter) ConvertImageFile(parentDirectory Directory, imageFile db.File) (ImageFile, error) {
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
