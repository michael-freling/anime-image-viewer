package image

import (
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
)

func Test_CopyImage(t *testing.T) {
	tempDir := t.TempDir()

	testCases := []struct {
		name    string
		src     string
		dst     string
		wantErr error
	}{
		{
			name: "copy image",
			src:  "testdata/image.jpg",
			dst:  tempDir + "/image.jpg",
		},
		{
			name:    "unsupported image file",
			src:     "testdata/image.txt",
			dst:     tempDir + "/image.txt",
			wantErr: ErrUnsupportedImageFile,
		},
		{
			name:    "file already exists",
			src:     "testdata/image.jpg",
			dst:     tempDir + "/image.jpg",
			wantErr: ErrFileAlreadyExists,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			gotErr := copyImage(tc.src, tc.dst)
			assert.ErrorIs(t, gotErr, tc.wantErr)

			if tc.wantErr != nil {
				return
			}
			got, err := os.Stat(tc.dst)
			assert.NoError(t, err)
			assert.True(t, got.Size() > 0)
		})
	}
}
