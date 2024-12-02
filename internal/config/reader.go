package config

import (
	"fmt"
	"io"
	"os"
	"path"

	"github.com/BurntSushi/toml"
)

type Config struct {
	DefaultDirectory string `toml:"default_directory"`
	ConfigDirectory  string `toml:"config_directory"`
}

func ReadConfig() (Config, error) {
	var conf Config

	homeDir, err := os.UserHomeDir()
	if err != nil {
		return conf, fmt.Errorf("os.UserHomeDir: %w", err)
	}
	configDir := path.Join(homeDir, ".config", "anime-image-viewer")
	if err = os.MkdirAll(configDir, 0755); err != nil {
		return conf, fmt.Errorf("os.MkdirAll: %w", err)
	}

	configFile := path.Join(configDir, "default.toml")
	if _, err := os.Stat(configFile); os.IsNotExist(err) {
		return Config{
			DefaultDirectory: homeDir + "/Pictures/anime-image-viewer",
			ConfigDirectory:  configDir,
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

	return conf, nil
}
