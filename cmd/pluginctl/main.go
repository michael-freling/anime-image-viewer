package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"os"

	"github.com/michael-freling/anime-image-viewer/internal/config"
	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/michael-freling/anime-image-viewer/internal/image"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)
	if err := runMain(logger); err != nil {
		logger.Error("runMain", "error", err)
		os.Exit(1)
	}
	os.Exit(0)
}

func runMain(logger *slog.Logger) error {
	var configPath string
	flag.StringVar(&configPath, "config", "", "path to the configuration file")
	flag.Parse()
	args := flag.Args()

	if len(args) < 1 {
		return fmt.Errorf("no arguments provided: %+v", args)
	}
	exportDirectory := args[0]

	fmt.Printf("configPath: %s\n", configPath)
	conf, err := config.ReadConfig(configPath)
	if err != nil {
		return fmt.Errorf("config.ReadConfig: %w", err)
	}
	fmt.Printf("%+v\n", conf)
	dbClient, err := db.FromConfig(conf, logger)
	if err != nil {
		return fmt.Errorf("db.FromConfig: %w", err)
	}

	service := image.NewExportService(logger, conf, dbClient)
	if err := service.ExportAll(context.Background(), exportDirectory); err != nil {
		return fmt.Errorf("service.ExportAll: %w", err)
	}
	logger.Info("Exported images and tags", "exportDirectory", exportDirectory)

	return nil
}
