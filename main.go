package main

import (
	"context"
	"embed"
	"fmt"
	"io"
	"log"
	"log/slog"
	"os"
	"path/filepath"
	"time"

	"github.com/michael-freling/anime-image-viewer/internal/anilist"
	"github.com/michael-freling/anime-image-viewer/internal/anime"
	"github.com/michael-freling/anime-image-viewer/internal/backup"
	"github.com/michael-freling/anime-image-viewer/internal/config"
	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/michael-freling/anime-image-viewer/internal/frontend"
	"github.com/michael-freling/anime-image-viewer/internal/image"
	"github.com/michael-freling/anime-image-viewer/internal/import_images"
	"github.com/michael-freling/anime-image-viewer/internal/search"
	"github.com/michael-freling/anime-image-viewer/internal/tag"
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
	conf, err := config.ReadConfig("")
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
	startTotal := time.Now()

	startPhase := time.Now()
	dbClient, err := db.FromConfig(conf, logger)
	if err != nil {
		return fmt.Errorf("db.NewClient: %w", err)
	}
	logger.Info("startup: db connection", "elapsed", time.Since(startPhase))

	startPhase = time.Now()
	if err := dbClient.Migrate(); err != nil {
		return fmt.Errorf("db.Migrate: %w", err)
	}
	logger.Info("startup: db migrate", "elapsed", time.Since(startPhase))

	startPhase = time.Now()
	imageFileConverter := image.NewImageFileConverter(conf)
	directoryReader := image.NewDirectoryReader(conf, dbClient)
	tagReader := tag.NewReader(dbClient, directoryReader)
	imageReader := image.NewReader(dbClient, directoryReader, imageFileConverter)
	imageService := frontend.NewImageService(imageReader, dbClient)
	directoryService := frontend.NewDirectoryService(
		dbClient,
		directoryReader,
		tagReader,
	)
	tagService := frontend.NewTagService(tagReader)
	legacyTagFrontendService := tag.NewFrontendService(
		logger,
		dbClient,
		tagReader,
		nil,
	)
	searchService := frontend.NewSearchService(
		search.NewSearchRunner(
			logger,
			dbClient,
			directoryReader,
			imageReader,
			tagReader,
			imageFileConverter,
		),
		directoryReader,
	)

	restoreService := backup.NewRestoreService(logger, conf)

	scanner := image.NewBackgroundScanner(logger, dbClient, conf, restoreService)
	appCtx, appCancel := context.WithCancel(context.Background())
	defer appCancel()
	scanner.Start(appCtx)
	logger.Info("startup: service construction", "elapsed", time.Since(startPhase))

	backupFrontendService := frontend.NewBackupFrontendService(logger, conf)
	configFrontendService := frontend.NewConfigFrontendService(logger, conf)

	anilistClient := anilist.NewHTTPClient()
	animeCoreService := anime.NewService(dbClient, directoryReader, conf, anilistClient)
	animeFrontendService := frontend.NewAnimeService(
		animeCoreService,
		dbClient,
		directoryReader,
		tagReader,
		imageReader,
	)
	characterFrontendService := frontend.NewCharacterService(dbClient)

	startPhase = time.Now()
	title := "anime-image-viewer"
	app := application.New(application.Options{
		Name:        title,
		Description: "A simple image collection for anime images",
		Logger:      logger,
		Services: []application.Service{
			application.NewService(imageService),
			application.NewService(directoryService),
			application.NewService(tagService),
			application.NewService(legacyTagFrontendService),
			application.NewService(
				frontend.NewStaticFileService(logger, conf, restoreService),
				application.ServiceOptions{
					Route: "/files/",
				},
			),
			application.NewService(searchService),
			application.NewService(frontend.NewBatchImportImageService(
				logger,
				directoryReader,
				import_images.NewBatchImageImporter(
					logger,
					dbClient,
					imageFileConverter,
					tagReader,
				),
			)),
			application.NewService(backupFrontendService),
			application.NewService(configFrontendService),
			application.NewService(animeFrontendService),
			application.NewService(characterFrontendService),
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
			appCancel()
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

	logger.Info("startup: wails app creation", "elapsed", time.Since(startPhase))
	logger.Info("startup: total before app.Run", "elapsed", time.Since(startTotal))
	if err := app.Run(); err != nil {
		return fmt.Errorf("app.Run: %w", err)
	}
	return nil
}
