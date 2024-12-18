package config

import (
	"fmt"
	"io"
	"os"
	"path/filepath"

	"github.com/BurntSushi/toml"
)

type env string

const (
	EnvironmentProduction  = "production"
	EnvironmentDevelopment = "development"
)

type Config struct {
	ImageRootDirectory string `toml:"image_root_directory"`
	ConfigDirectory    string `toml:"config_directory"`
	LogDirectory       string `toml:"log_directory"`
	Environment        env
}

func ReadConfig() (Config, error) {
	var conf Config

	homeDir, err := os.UserHomeDir()
	if err != nil {
		return conf, fmt.Errorf("os.UserHomeDir: %w", err)
	}
	configDir := filepath.Join(homeDir, ".config", "anime-image-viewer")
	if err = os.MkdirAll(configDir, 0755); err != nil {
		return conf, fmt.Errorf("os.MkdirAll: %w", err)
	}

	tempDir := os.TempDir()
	configFile := filepath.Join(configDir, "default.toml")
	if _, err := os.Stat(configFile); os.IsNotExist(err) {
		return Config{
			ImageRootDirectory: filepath.Join(homeDir, "Pictures", "anime-image-viewer", string(runtimeEnv)),
			ConfigDirectory:    configDir,
			LogDirectory:       filepath.Join(tempDir, "anime-image-viewer", "logs"),
			Environment:        runtimeEnv,
		}, nil
	}

	file, err := os.OpenFile(configFile, os.O_CREATE|os.O_RDWR, 0644)
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
	return conf, nil
}
