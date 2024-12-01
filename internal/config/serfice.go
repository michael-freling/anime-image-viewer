package config

import (
	"context"
	"fmt"
	"os"

	"github.com/wailsapp/wails/v3/pkg/application"
)

type Service struct {
	config Config
	ctx    context.Context
}

func NewService(config Config) (*Service, error) {
	// Ensure the default directory exists.
	_, err := os.Stat(config.DefaultDirectory)
	if os.IsNotExist(err) {
		if err := os.MkdirAll(config.DefaultDirectory, 0755); err != nil {
			return nil, fmt.Errorf("os.MkdirAll: %w", err)
		}
	}

	return &Service{
		config: config,
	}, nil
}

func (service *Service) OnStartup(ctx context.Context, options application.ServiceOptions) error {
	service.ctx = ctx
	return nil
}
