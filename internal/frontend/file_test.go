package frontend

import (
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
)

func (tester tester) getStaticFileService() *StaticFileService {
	return NewStaticFileService(
		tester.logger,
		tester.config,
	)
}

func TestStaticFileService_ServeHTTP(t *testing.T) {
	tester := newTester(t)
	tester.logger = slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{
		Level: slog.LevelDebug,
	}))

	for _, file := range []string{"image.jpg", "image.png", "image.txt"} {
		tester.copyImageFile(t, file, file)
	}

	testCases := []struct {
		name         string
		fileFullPath string
		wantCode     int
		wantErr      bool
	}{
		// test without any raw query string
		// {
		// 	name:         "wails url test",
		// 	fileFullPath: "wails://localhost:9245/files/image.jpg?width=1",
		// 	wantCode:     http.StatusOK,
		// },

		{
			name:         "a jpeg file",
			fileFullPath: "image.jpg?width=1",
			wantCode:     http.StatusOK,
		},
		{
			name:         "a png file",
			fileFullPath: "image.png?width=1",
			wantCode:     http.StatusOK,
		},
		{
			name:         "unsupported image file. It shouldn't be stored in the first place",
			fileFullPath: "image.txt?width=1",
			wantCode:     http.StatusInternalServerError,
			wantErr:      true,
		},
		{
			name:         "invalid width parameter",
			fileFullPath: "image.txt?width=100%",
			wantCode:     http.StatusBadRequest,
			wantErr:      true,
		},
		{
			name:         "no width parameter",
			fileFullPath: "image.txt",
			wantCode:     http.StatusBadRequest,
			wantErr:      true,
		},
		{
			name:         "file path is not under the image directory",
			fileFullPath: "../../image.jpg?width=1",
			wantCode:     http.StatusBadRequest,
			wantErr:      true,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			service := tester.getStaticFileService()

			w := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodGet, "/"+tc.fileFullPath, nil)
			service.ServeHTTP(
				w,
				req,
			)
			assert.Equal(t, tc.wantCode, w.Code, w.Body.String())
		})
	}
}
