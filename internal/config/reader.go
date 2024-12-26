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
	return conf, nil
}
