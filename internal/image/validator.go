package image

import (
	"bufio"
	"errors"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"os"
)

var (
	ErrImageCorrupted = errors.New("image file is corrupted")
	ErrImageNotFound  = errors.New("image file not found")
	ErrImageEmpty     = errors.New("image file is empty")
)

// ValidateImageFile opens the file at path and attempts a full image.Decode.
// It returns nil when the file is a valid, decodable JPEG or PNG image.
// Possible errors:
//   - ErrImageNotFound: file does not exist on disk
//   - ErrImageEmpty: file exists but has zero bytes
//   - ErrImageCorrupted: file cannot be decoded as a valid image
func ValidateImageFile(path string) error {
	info, err := os.Stat(path)
	if err != nil {
		if os.IsNotExist(err) {
			return fmt.Errorf("%w: %s", ErrImageNotFound, path)
		}
		return fmt.Errorf("stat image file: %w", err)
	}

	if info.Size() == 0 {
		return fmt.Errorf("%w: %s", ErrImageEmpty, path)
	}

	file, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("open image file: %w", err)
	}
	defer file.Close()

	_, _, err = image.Decode(bufio.NewReader(file))
	if err != nil {
		return fmt.Errorf("%w: %s: %v", ErrImageCorrupted, path, err)
	}

	return nil
}
