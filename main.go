package main

import (
	"embed"
	"fmt"
	"io"
	"log"
	"log/slog"
	"os"
	"path/filepath"

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

func newLogger(conf config.Config) (*slog.Logger, error) {
	if err := os.MkdirAll(conf.LogDirectory, 0755); err != nil {
		return nil, fmt.Errorf("os.MkdirAll: %w", err)
	}

	logDirectory := filepath.Join(conf.LogDirectory, string(conf.Environment)+".log")
	fmt.Printf("log is output in a directory: %s\n", logDirectory)
	file, err := os.OpenFile(
		logDirectory,
		os.O_RDWR|os.O_APPEND|os.O_CREATE,
		0644,
	)
	if err != nil {
		return nil, fmt.Errorf("os.OpenFile: %w", err)
	}
	var slogHandler slog.Handler
	if conf.Environment == config.EnvironmentDevelopment {
		slogHandler = slog.NewJSONHandler(
			io.MultiWriter(os.Stdout, file),
			&slog.HandlerOptions{
				Level: slog.LevelDebug,
			},
		)
	}
	if conf.Environment == config.EnvironmentProduction {
		// -H windowgui disables an output on stdout
		slogHandler = slog.NewJSONHandler(
			file,
			&slog.HandlerOptions{
				Level: slog.LevelInfo,
			},
		)
	}
	logger := slog.New(slogHandler)
	slog.SetDefault(logger)
	return logger, nil
}

// main function serves as the application's entry point. It initializes the application, creates a window,
// and starts a goroutine that emits a time-based event every second. It subsequently runs the application and
// logs any error that might occur.
func main() {
	conf, err := config.ReadConfig()
	if err != nil {
		log.Fatalf("config.ReadConfig: %v", err)
	}
	logger, err := newLogger(conf)
	if err != nil {
		log.Fatalf("newLogger: %v", err)
	}

	if err := runMain(conf, logger); err != nil {
		logger.Error("runMain", "error", err)
		os.Exit(1)
	}
	os.Exit(0)
}

func runMain(conf config.Config, logger *slog.Logger) error {
	configService, err := config.NewService(conf)
	if err != nil {
		return fmt.Errorf("config.NewService: %w", err)
	}

	dbFile := db.DSNFromFilePath(conf.ConfigDirectory,
		fmt.Sprintf("%s_v1.sqlite", conf.Environment),
	)
	logger.Info("Connecting to a DB", "dbFile", dbFile)

	var dbClient *db.Client
	if conf.Environment == config.EnvironmentDevelopment {
		dbClient, err = db.NewClient(dbFile, db.WithGormLogger(logger))
	} else {
		dbClient, err = db.NewClient(dbFile, db.WithNopLogger())
	}
	if err != nil {
		return fmt.Errorf("db.NewClient: %w", err)
	}
	dbClient.Migrate()

	imageFileService := image.NewFileService(logger, dbClient)
	directoryService := image.NewDirectoryService(
		logger,
		conf,
		dbClient,
		imageFileService,
	)

	title := "anime-image-viewer"
	// Create a new Wails application by providing the necessary options.
	// Variables 'Name' and 'Description' are for application metadata.
	// 'Assets' configures the asset server with the 'FS' variable pointing to the frontend files.
	// 'Bind' is a list of Go struct instances. The frontend has access to the methods of these instances.
	// 'Mac' options tailor the application when running an macOS.
	app := application.New(application.Options{
		Name:        title,
		Description: "A simple image collection for anime images",
		Logger:      logger,
		Services: []application.Service{
			application.NewService(imageFileService),
			application.NewService(directoryService),
			application.NewService(image.NewTagService(
				logger,
				dbClient,
				directoryService,
			)),
			application.NewService(configService),
			application.NewService(
				image.NewStaticFileService(logger, conf),
				application.ServiceOptions{
					Route: "/files/",
				},
			),
		},
		Assets: application.AssetOptions{
			Handler:        application.AssetFileServerFS(assets),
			DisableLogging: conf.Environment == config.EnvironmentProduction,
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
		Title: title,
		Mac: application.MacWindow{
			InvisibleTitleBarHeight: 50,
			Backdrop:                application.MacBackdropTranslucent,
			TitleBar:                application.MacTitleBarHiddenInset,
		},
		BackgroundColour: application.NewRGB(27, 38, 54),
		URL:              "/",
	})

	logger.Info("Starting an application")
	// Run the application. This blocks until the application has been exited.
	// If an error occurred while running the application, log it and exit.
	if err := app.Run(); err != nil {
		return fmt.Errorf("app.Run: %w", err)
	}
	return nil
}
