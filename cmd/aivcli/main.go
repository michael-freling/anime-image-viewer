package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"

	"github.com/michael-freling/anime-image-viewer/internal/backup"
	"github.com/michael-freling/anime-image-viewer/internal/config"
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
		Use: "aivcli",
	}

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
		targetDir     string
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
			opts := backup.RestoreOptions{
				RestoreImages:   restoreOptions.restoreImages,
				TargetDirectory: restoreOptions.targetDir,
			}
			if err := service.Restore(context.Background(), backupDir, opts); err != nil {
				return fmt.Errorf("service.Restore: %w", err)
			}
			logger.Info("Restore completed", "backupDirectory", backupDir)

			return nil
		},
	}
	restoreFlags := restoreCommand.Flags()
	restoreFlags.StringVar(&restoreOptions.configPath, "config", "", "path to the configuration file")
	restoreFlags.BoolVar(&restoreOptions.restoreImages, "restore-images", false, "restore images from backup")
	restoreFlags.StringVar(&restoreOptions.targetDir, "target-dir", "", "restore database and images to this directory instead of the defaults")
	rootCommand.AddCommand(&restoreCommand)

	return rootCommand.Execute()
}
