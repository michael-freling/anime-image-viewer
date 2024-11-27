package image

import (
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"strings"

	"github.com/wailsapp/wails/v3/pkg/application"
)

func AssetMiddleware(logger *slog.Logger) application.Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
			if strings.HasPrefix(request.URL.Path, "/wails") {
				// wails internal API
				next.ServeHTTP(response, request)
				return
			}

			ctx := request.Context()
			logger.InfoContext(ctx, "asset middleware",
				"path", request.URL.Path,
				"scheme", request.URL.Scheme)

			ok, err := isSupportedImageFile(request.URL.Path)
			if !ok || err != nil {
				next.ServeHTTP(response, request)
				return
			}

			fileData, err := os.ReadFile(request.URL.Path)
			if err != nil {
				response.WriteHeader(http.StatusBadRequest)
				response.Write([]byte(fmt.Sprintf("Could not load file %s", request.URL.Path)))
			}

			response.Write(fileData)
		})
	}
}
