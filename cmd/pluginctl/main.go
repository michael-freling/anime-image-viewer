package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"

	"github.com/michael-freling/anime-image-viewer/internal/config"
	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/michael-freling/anime-image-viewer/internal/export"
	"github.com/spf13/cobra"
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
	rootCommand := cobra.Command{
		Use: "pluginctl",
	}

	var configPath string
	exportCommand := cobra.Command{
		Use:   "export [exportDirectory]",
		Short: "Export images and tags",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
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

			service := export.NewBatchImageExporter(logger, conf, dbClient)
			if err := service.ExportAll(context.Background(), exportDirectory); err != nil {
				return fmt.Errorf("service.ExportAll: %w", err)
			}
			logger.Info("Exported images and tags", "exportDirectory", exportDirectory)

			return nil
		},
	}
	exportCommand.Flags().StringVar(&configPath, "config", "", "path to the configuration file")
	rootCommand.AddCommand(&exportCommand)

	return rootCommand.Execute()
}
