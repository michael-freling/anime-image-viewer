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
	BackupDirectory         string `toml:"backup_directory"`
	RetentionCount          int    `toml:"retention_count"`
	IdleBackupEnabled       bool   `toml:"idle_backup_enabled"`
	IdleBackupIncludeImages bool   `toml:"idle_backup_include_images"`
	IdleMinutes             int    `toml:"idle_minutes"`
}

type Config struct {
	ImageRootDirectory string       `toml:"image_root_directory"`
	ConfigDirectory    string       `toml:"config_directory"`
	LogDirectory       string       `toml:"log_directory"`
	Backup             BackupConfig `toml:"backup"`
	Environment        env
}

// WriteConfig writes the config to a TOML file.
// If configFile is empty, the default path (~/.config/anime-image-viewer/config.toml) is used.
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
		configFile = filepath.Join(configDir, "config.toml")
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

// decodeConfigFile reads and decodes a TOML file into the given Config struct.
// Fields present in the file overwrite existing values; fields absent from the
// file are left untouched. Returns true if the file was found and decoded.
func decodeConfigFile(path string, conf *Config) (bool, error) {
	file, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			return false, nil
		}
		return false, fmt.Errorf("os.OpenFile: %w", err)
	}
	defer file.Close()

	contents, err := io.ReadAll(file)
	if err != nil {
		return false, fmt.Errorf("io.ReadAll: %w", err)
	}

	if _, err := toml.Decode(string(contents), conf); err != nil {
		return false, fmt.Errorf("toml.Decode: %w", err)
	}
	return true, nil
}

func ReadConfig(configFile string) (Config, error) {
	// When an explicit config file is provided, use the original single-file behavior.
	if configFile != "" {
		if _, err := os.Stat(configFile); os.IsNotExist(err) {
			return Config{}, fmt.Errorf("config file %s does not exist", configFile)
		}

		var conf Config
		if _, err := decodeConfigFile(configFile, &conf); err != nil {
			return conf, err
		}
		conf.Environment = runtimeEnv
		applyBackupDefaults(&conf)
		return conf, nil
	}

	// No explicit file: use layered config (base + environment overlay).
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return Config{}, fmt.Errorf("os.UserHomeDir: %w", err)
	}

	configDir := filepath.Join(homeDir, ".config", "anime-image-viewer")
	if err = os.MkdirAll(configDir, 0755); err != nil {
		return Config{}, fmt.Errorf("os.MkdirAll: %w", err)
	}

	tempDir := os.TempDir()

	// Start with non-backup defaults. Backup defaults are applied after
	// all config files are decoded so that BackupDirectory can be derived
	// from the final ConfigDirectory value.
	conf := Config{
		ImageRootDirectory: defaultImageRootDirectory(homeDir),
		ConfigDirectory:    configDir,
		LogDirectory:       filepath.Join(tempDir, "anime-image-viewer", "logs"),
		Environment:        runtimeEnv,
	}

	// 1. Decode base config: config.toml (fall back to default.toml for
	//    backward compatibility with older setups).
	basePath := filepath.Join(configDir, "config.toml")
	anyFileFound := false
	baseFound, err := decodeConfigFile(basePath, &conf)
	if err != nil {
		return conf, err
	}
	anyFileFound = anyFileFound || baseFound
	if !baseFound {
		// Backward compat: try the legacy filename.
		legacyPath := filepath.Join(configDir, "default.toml")
		legacyFound, err := decodeConfigFile(legacyPath, &conf)
		if err != nil {
			return conf, err
		}
		anyFileFound = anyFileFound || legacyFound
	}

	// 2. Decode environment-specific overlay (e.g. config.development.toml).
	//    If the file does not exist this is silently skipped.
	overlayPath := filepath.Join(configDir, fmt.Sprintf("config.%s.toml", runtimeEnv))
	overlayFound, err := decodeConfigFile(overlayPath, &conf)
	if err != nil {
		return conf, err
	}
	anyFileFound = anyFileFound || overlayFound

	if !anyFileFound {
		// No config files found at all — use full defaults including backup booleans.
		conf.Backup = defaultBackupConfig(configDir)
	} else {
		applyBackupDefaults(&conf)
	}

	conf.Environment = runtimeEnv
	return conf, nil
}

// DefaultConfig returns the default configuration values.
func DefaultConfig() (Config, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return Config{}, fmt.Errorf("os.UserHomeDir: %w", err)
	}
	configDir := filepath.Join(homeDir, ".config", "anime-image-viewer")
	tempDir := os.TempDir()
	return Config{
		ImageRootDirectory: defaultImageRootDirectory(homeDir),
		ConfigDirectory:    configDir,
		LogDirectory:       filepath.Join(tempDir, "anime-image-viewer", "logs"),
		Backup:             defaultBackupConfig(configDir),
		Environment:        runtimeEnv,
	}, nil
}

func defaultImageRootDirectory(homeDir string) string {
	base := filepath.Join(homeDir, "Pictures", "anime-image-viewer")
	if runtimeEnv == EnvironmentDevelopment {
		return filepath.Join(base, string(runtimeEnv))
	}
	return base
}

func defaultBackupConfig(configDirectory string) BackupConfig {
	return BackupConfig{
		BackupDirectory:         filepath.Join(configDirectory, "backups"),
		RetentionCount:          7,
		IdleBackupEnabled:       runtimeEnv == EnvironmentProduction,
		IdleBackupIncludeImages: true,
		IdleMinutes:             30,
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
