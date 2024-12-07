package image

import (
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"slices"
)

type ImageFile struct {
	ID          uint
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

func copy(sourceFilePath, destinationFilePath string) (int64, error) {
	source, err := os.Open(sourceFilePath)
	if err != nil {
		return 0, err
	}
	defer source.Close()

	destination, err := os.Create(destinationFilePath)
	if err != nil {
		return 0, err
	}
	defer destination.Close()
	nBytes, err := io.Copy(destination, source)
	return nBytes, err
}

var (
	ErrUnsupportedImageFile = errors.New("unsupported image file")
	ErrFileAlreadyExists    = errors.New("file already exists")
)

func copyImage(sourceFilePath string, destinationFilePath string) error {
	pathStat, _ := os.Stat(sourceFilePath)
	if pathStat.IsDir() {
		// if it's a directory, import it recursively
		// todo
		return nil
	}
	if err := isSupportedImageFile(sourceFilePath); err != nil {
		return err
	}

	if _, err := os.Stat(destinationFilePath); err == nil {
		return ErrFileAlreadyExists
	} else if !errors.Is(err, fs.ErrNotExist) {
		return fmt.Errorf("os.Stat: %w", err)
	}

	if _, err := copy(sourceFilePath, destinationFilePath); err != nil {
		return fmt.Errorf("copy: %w", err)
	}

	return nil
}

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
