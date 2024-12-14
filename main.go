package main

import (
	"embed"
	_ "embed"
	"log"
	"log/slog"
	"os"

	"github.com/michael-freling/anime-image-viewer/internal/config"
	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/michael-freling/anime-image-viewer/internal/image"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// Wails uses Go's `embed` package to embed the frontend files into the binary.
// Any files in the frontend/dist folder will be embedded into the binary and
// made available to the frontend.
// See https://pkg.go.dev/embed for more information.

//go:embed frontend/dist
var assets embed.FS

// main function serves as the application's entry point. It initializes the application, creates a window,
// and starts a goroutine that emits a time-based event every second. It subsequently runs the application and
// logs any error that might occur.
func main() {
	// todo: change a config based on an environment
	logLevel := slog.LevelDebug
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: logLevel,
	}))
	slog.SetDefault(logger)

	conf, err := config.ReadConfig()
	if err != nil {
		logger.Error("config.NewReader", "error", err)
		return
	}
	configService, err := config.NewService(conf)
	if err != nil {
		logger.Error("config.NewService", "error", err)
		return
	}

	dbFile := db.DSNFromFilePath(conf.ConfigDirectory, "db_v1.sqlite")
	logger.Info("Connecting to a DB", "dbFile", dbFile)
	dbClient, err := db.NewClient(dbFile, db.WithGormLogger(logger))
	if err != nil {
		logger.Error("db.NewClient", "error", err)
		return
	}
	dbClient.Migrate()

	imageFileService := image.NewFileService(dbClient)
	directoryServie := image.NewDirectoryService(conf, dbClient, imageFileService)

	// Create a new Wails application by providing the necessary options.
	// Variables 'Name' and 'Description' are for application metadata.
	// 'Assets' configures the asset server with the 'FS' variable pointing to the frontend files.
	// 'Bind' is a list of Go struct instances. The frontend has access to the methods of these instances.
	// 'Mac' options tailor the application when running an macOS.
	app := application.New(application.Options{
		Name:        "anime-image-viewer",
		Description: "A demo of using raw HTML & CSS",
		Services: []application.Service{
			application.NewService(imageFileService),
			application.NewService(directoryServie),
			application.NewService(image.NewTagService(dbClient, directoryServie)),
			application.NewService(configService),
		},
		Assets: application.AssetOptions{
			Handler:    application.AssetFileServerFS(assets),
			Middleware: image.AssetMiddleware(logger),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
		PanicHandler: func(v any) {
			logger.Error("panic happens", "v", v)
		},
		OnShutdown: func() {
			dbClient.Close()
		},
	})

	// Create a new window with the necessary options.
	// 'Title' is the title of the window.
	// 'Mac' options tailor the window when running on macOS.
	// 'BackgroundColour' is the background colour of the window.
	// 'URL' is the URL that will be loaded into the webview.
	app.NewWebviewWindowWithOptions(application.WebviewWindowOptions{
		Title: "Window 1",
		Mac: application.MacWindow{
			InvisibleTitleBarHeight: 50,
			Backdrop:                application.MacBackdropTranslucent,
			TitleBar:                application.MacTitleBarHiddenInset,
		},
		BackgroundColour: application.NewRGB(27, 38, 54),
		URL:              "/",
	})

	// Run the application. This blocks until the application has been exited.
	// If an error occurred while running the application, log it and exit.
	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
