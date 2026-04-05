package config

import (
	"fmt"
	"io"
	"os"
	"path/filepath"

	"github.com/BurntSushi/toml"
)

// writableConfig contains only user-editable fields (excludes Environment).
type writableConfig struct {
	ImageRootDirectory string       `toml:"image_root_directory"`
	ConfigDirectory    string       `toml:"config_directory"`
	LogDirectory       string       `toml:"log_directory"`
	Backup             BackupConfig `toml:"backup"`
}

type env string

const (
	EnvironmentProduction  = "production"
	EnvironmentDevelopment = "development"
)

type BackupConfig struct {
	BackupDirectory   string `toml:"backup_directory"`
	RetentionCount    int    `toml:"retention_count"`
	IdleBackupEnabled bool   `toml:"idle_backup_enabled"`
	IdleMinutes       int    `toml:"idle_minutes"`
}

type Config struct {
	ImageRootDirectory string       `toml:"image_root_directory"`
	ConfigDirectory    string       `toml:"config_directory"`
	LogDirectory       string       `toml:"log_directory"`
	Backup             BackupConfig `toml:"backup"`
	Environment        env
}

// WriteConfig writes the config to a TOML file.
// If configFile is empty, the default path (~/.config/anime-image-viewer/default.toml) is used.
func WriteConfig(configFile string, conf Config) error {
	if configFile == "" {
		homeDir, err := os.UserHomeDir()
		if err != nil {
			return fmt.Errorf("os.UserHomeDir: %w", err)
		}
		configDir := filepath.Join(homeDir, ".config", "anime-image-viewer")
		if err = os.MkdirAll(configDir, 0755); err != nil {
			return fmt.Errorf("os.MkdirAll: %w", err)
		}
		configFile = filepath.Join(configDir, "default.toml")
	}

	file, err := os.Create(configFile)
	if err != nil {
		return fmt.Errorf("os.Create: %w", err)
	}
	defer file.Close()

	writable := writableConfig{
		ImageRootDirectory: conf.ImageRootDirectory,
		ConfigDirectory:    conf.ConfigDirectory,
		LogDirectory:       conf.LogDirectory,
		Backup:             conf.Backup,
	}
	encoder := toml.NewEncoder(file)
	if err := encoder.Encode(writable); err != nil {
		return fmt.Errorf("toml.Encode: %w", err)
	}
	return nil
}

func ReadConfig(configFile string) (Config, error) {
	var conf Config

	if configFile != "" {
		if _, err := os.Stat(configFile); os.IsNotExist(err) {
			return conf, fmt.Errorf("config file %s does not exist", configFile)
		}
	} else {
		homeDir, err := os.UserHomeDir()
		if err != nil {
			return conf, fmt.Errorf("os.UserHomeDir: %w", err)
		}

		configDir := filepath.Join(homeDir, ".config", "anime-image-viewer")
		if err = os.MkdirAll(configDir, 0755); err != nil {
			return conf, fmt.Errorf("os.MkdirAll: %w", err)
		}

		configFile = filepath.Join(configDir, "default.toml")
		if _, err := os.Stat(configFile); os.IsNotExist(err) {
			tempDir := os.TempDir()
			return Config{
				ImageRootDirectory: filepath.Join(homeDir, "Pictures", "anime-image-viewer", string(runtimeEnv)),
				ConfigDirectory:    configDir,
				LogDirectory:       filepath.Join(tempDir, "anime-image-viewer", "logs"),
				Backup:             defaultBackupConfig(configDir),
				Environment:        runtimeEnv,
			}, nil
		}
	}

	file, err := os.Open(configFile)
	if err != nil {
		return conf, fmt.Errorf("os.OpenFile: %w", err)
	}
	defer file.Close()

	contents, err := io.ReadAll(file)
	if err != nil {
		return conf, fmt.Errorf("io.ReadAll: %w", err)
	}

	if _, err := toml.Decode(string(contents), &conf); err != nil {
		return conf, fmt.Errorf("toml.Decode: %w", err)
	}

	conf.Environment = runtimeEnv
	applyBackupDefaults(&conf)
	return conf, nil
}

func defaultBackupConfig(configDirectory string) BackupConfig {
	return BackupConfig{
		BackupDirectory:   filepath.Join(configDirectory, "backups"),
		RetentionCount:    7,
		IdleBackupEnabled: runtimeEnv == EnvironmentProduction,
		IdleMinutes:       30,
	}
}

func applyBackupDefaults(conf *Config) {
	defaults := defaultBackupConfig(conf.ConfigDirectory)
	if conf.Backup.BackupDirectory == "" {
		conf.Backup.BackupDirectory = defaults.BackupDirectory
	}
	if conf.Backup.RetentionCount == 0 {
		conf.Backup.RetentionCount = defaults.RetentionCount
	}
	if conf.Backup.IdleMinutes == 0 {
		conf.Backup.IdleMinutes = defaults.IdleMinutes
	}
	// IdleBackupEnabled is a bool; its zero value (false) is a valid setting,
	// so we cannot distinguish "not set" from "explicitly false" via TOML decoding
	// into a plain bool. The default is applied only through defaultBackupConfig
	// (used when no config file exists). When a config file is present, the decoded
	// value is kept as-is.
}
