package image

import (
	"bufio"
	"context"
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
	Width         uint   `json:"width"`
	Height        uint   `json:"height"`
	LocalFilePath string `json:"-"`
	ParentID      uint   `json:"-"`
	ContentType   string `json:"-"`
}

var (
	supportedContentTypes = []string{
		"image/jpeg",
		"image/png",
	}
)

func Copy(sourceFilePath, destinationFilePath string) (int64, error) {
	sourceMeta, err := os.Stat(sourceFilePath)
	if err != nil {
		return 0, fmt.Errorf("os.Stat: %w", err)
	}

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

	// Copy a permission of a source
	if err = os.Chmod(destinationFilePath, sourceMeta.Mode()); err != nil {
		return 0, fmt.Errorf("os.Chmod: %w", err)
	}
	// Copy a access time and modification time of a source
	// todo: this cannot be compiled with mingw (windows)
	// detailedSourceStat := sourceMeta.Sys().(*syscall.Stat_t)
	// atime := time.Unix(detailedSourceStat.Atim.Sec, detailedSourceStat.Atim.Nsec)

	if err = os.Chtimes(destinationFilePath, sourceMeta.ModTime(), sourceMeta.ModTime()); err != nil {
		return 0, fmt.Errorf("os.Chtimes: %w", err)
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

	imageFiles := make(ImageFileList, 0, len(dbImageFiles))
	staleCandidates := make([]MissingFileCandidate, 0)
	for _, dbImageFile := range dbImageFiles {
		parentDirectory := parentDirectoriesMap[dbImageFile.ParentID]

		imageFile, err := reader.imageFileConverter.ConvertImageFile(parentDirectory, dbImageFile)
		if err != nil {
			// The DB record can become stale when the underlying file is
			// removed or moved outside the app. Skip such files instead of
			// failing the entire batch, which would otherwise break pages
			// that list many images (e.g. an anime page).
			if errors.Is(err, os.ErrNotExist) {
				slog.Warn("image file missing from disk",
					"id", dbImageFile.ID,
					"name", dbImageFile.Name,
					"error", err,
				)
				staleCandidates = append(staleCandidates, MissingFileCandidate{
					ID:         dbImageFile.ID,
					ParentPath: parentDirectory.Path,
				})
				continue
			}
			return nil, fmt.Errorf("convertImageFile: %w", err)
		}
		imageFiles = append(imageFiles, imageFile)
	}
	DeleteImageRecordsForDeletedFiles(reader.dbClient, staleCandidates)
	return imageFiles, nil
}

// MissingFileCandidate identifies an image DB record whose file was not found
// on disk, along with the on-disk path of its parent directory.
type MissingFileCandidate struct {
	ID         uint
	ParentPath string
}

// DeleteImageRecordsForDeletedFiles removes DB records (and their tag and
// character associations) for image files that were deleted from disk.
//
// It is best-effort: errors are logged rather than returned, since it runs as
// a side effect of reads. As a safety measure it only deletes a record when
// the file's parent directory still exists on disk. This distinguishes a file
// the user actually deleted (its folder remains) from a whole storage location
// being unavailable — e.g. a wrong ImageRootDirectory or an unmounted drive,
// where every file looks missing — which must NOT wipe the database.
func DeleteImageRecordsForDeletedFiles(dbClient *db.Client, candidates []MissingFileCandidate) {
	if len(candidates) == 0 {
		return
	}

	staleIDs := make([]uint, 0, len(candidates))
	for _, candidate := range candidates {
		if directoryExistsOnDisk(candidate.ParentPath) {
			staleIDs = append(staleIDs, candidate.ID)
			continue
		}
		slog.Warn("keeping image record; parent directory is unavailable, file may not be truly deleted",
			"id", candidate.ID,
			"parentPath", candidate.ParentPath,
		)
	}
	if len(staleIDs) == 0 {
		return
	}

	ctx := context.Background()
	// Delete the file records and their tag/character associations together.
	// All three run inside the transaction; any error rolls the whole thing
	// back, leaving the records intact for a later retry.
	if err := db.NewTransaction(ctx, dbClient, func(txCtx context.Context) error {
		return errors.Join(
			dbClient.FileTag().DeleteByFileIDs(txCtx, staleIDs),
			dbClient.FileCharacter().DeleteByFileIDs(txCtx, staleIDs),
			dbClient.File().DeleteByIDs(txCtx, staleIDs),
		)
	}); err != nil {
		slog.Warn("failed to delete stale image records", "ids", staleIDs, "error", err)
		return
	}
	slog.Info("deleted stale image records for files removed from disk", "ids", staleIDs)
}

// directoryExistsOnDisk reports whether path exists on disk and is a directory.
func directoryExistsOnDisk(path string) bool {
	if path == "" {
		return false
	}
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
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

	var w, h uint
	if imageFile.ImageWidth != nil {
		w = *imageFile.ImageWidth
	}
	if imageFile.ImageHeight != nil {
		h = *imageFile.ImageHeight
	}

	return ImageFile{
		ID:   imageFile.ID,
		Name: imageFile.Name,
		// from the frontend, use a path only under an image root directory for a wails
		Path:          "/files" + strings.TrimPrefix(imageFilePath, converter.config.ImageRootDirectory),
		Width:         w,
		Height:        h,
		LocalFilePath: imageFilePath,
		ParentID:      imageFile.ParentID,
		ContentType:   contentType,
	}, nil
}
