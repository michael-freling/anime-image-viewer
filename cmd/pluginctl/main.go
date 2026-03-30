package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"

	"github.com/michael-freling/anime-image-viewer/internal/backup"
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

type exportCLIOptions struct {
	configPath             string
	isDirectoryTagExcluded bool
}

func runMain(logger *slog.Logger) error {
	rootCommand := cobra.Command{
		Use: "pluginctl",
	}

	var exportOptions exportCLIOptions
	exportCommand := cobra.Command{
		Use:   "export [exportDirectory]",
		Short: "Export images and tags",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			exportDirectory := args[0]

			fmt.Printf("configPath: %s\n", exportOptions.configPath)
			conf, err := config.ReadConfig(exportOptions.configPath)
			if err != nil {
				return fmt.Errorf("config.ReadConfig: %w", err)
			}
			fmt.Printf("%+v\n", conf)
			dbClient, err := db.FromConfig(conf, logger)
			if err != nil {
				return fmt.Errorf("db.FromConfig: %w", err)
			}

			service := export.NewBatchImageExporter(logger, conf, dbClient, export.BatchImageExporterOptions{
				IsDirectoryTagExcluded: exportOptions.isDirectoryTagExcluded,
			})
			if err := service.Export(context.Background(), exportDirectory); err != nil {
				return fmt.Errorf("service.ExportAll: %w", err)
			}
			logger.Info("Exported images and tags", "exportDirectory", exportDirectory)

			return nil
		},
	}
	exportFlags := exportCommand.Flags()
	exportFlags.StringVar(&exportOptions.configPath, "config", "", "path to the configuration file")
	exportFlags.BoolVar(
		&exportOptions.isDirectoryTagExcluded,
		"exclude-directory-tag",
		true,
		"Exclude directory tags. If this is true, images without their own tags and tags from directories are NOT exported. default: true",
	)
	rootCommand.AddCommand(&exportCommand)

	var backupOptions struct {
		configPath    string
		includeImages bool
	}
	backupCommand := cobra.Command{
		Use:   "backup [outputDirectory]",
		Short: "Back up the database and optionally images",
		Args:  cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			conf, err := config.ReadConfig(backupOptions.configPath)
			if err != nil {
				return fmt.Errorf("config.ReadConfig: %w", err)
			}

			destDir := conf.Backup.BackupDirectory
			if len(args) > 0 {
				destDir = args[0]
			}

			service := backup.NewBackupService(logger, conf)
			backupDir, err := service.Backup(context.Background(), destDir, backupOptions.includeImages)
			if err != nil {
				return fmt.Errorf("service.Backup: %w", err)
			}
			logger.Info("Backup completed", "backupDirectory", backupDir)

			return nil
		},
	}
	backupFlags := backupCommand.Flags()
	backupFlags.StringVar(&backupOptions.configPath, "config", "", "path to the configuration file")
	backupFlags.BoolVar(&backupOptions.includeImages, "include-images", false, "include images in backup")
	rootCommand.AddCommand(&backupCommand)

	var restoreOptions struct {
		configPath    string
		restoreImages bool
	}
	restoreCommand := cobra.Command{
		Use:   "restore <backupDirectory>",
		Short: "Restore from a backup",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			backupDir := args[0]

			conf, err := config.ReadConfig(restoreOptions.configPath)
			if err != nil {
				return fmt.Errorf("config.ReadConfig: %w", err)
			}

			service := backup.NewRestoreService(logger, conf)
			if err := service.Restore(context.Background(), backupDir, restoreOptions.restoreImages); err != nil {
				return fmt.Errorf("service.Restore: %w", err)
			}
			logger.Info("Restore completed", "backupDirectory", backupDir)

			return nil
		},
	}
	restoreFlags := restoreCommand.Flags()
	restoreFlags.StringVar(&restoreOptions.configPath, "config", "", "path to the configuration file")
	restoreFlags.BoolVar(&restoreOptions.restoreImages, "restore-images", false, "restore images from backup")
	rootCommand.AddCommand(&restoreCommand)

	return rootCommand.Execute()
}
