package db

import (
	"fmt"

	"gorm.io/driver/sqlite" // Sqlite driver based on CGO
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

type Client struct {
	connection *gorm.DB
}

type clientOptions struct {
	gormLogger logger.Interface
}

type ClientOption func(*clientOptions)

func WithNopLogger() ClientOption {
	return func(c *clientOptions) {
		c.gormLogger = logger.New(nil, logger.Config{})
	}
}

func WithGormLogger(l logger.Interface) ClientOption {
	return func(c *clientOptions) {
		c.gormLogger = l
	}
}

type DSN string

func (dsn DSN) String() string {
	return string(dsn)
}

const (
	DSNMemory DSN = "file::memory:?cache=shared"
)

func NewClient(dsn DSN, options ...ClientOption) (*Client, error) {
	opts := clientOptions{}
	for _, option := range options {
		option(&opts)
	}

	connection, err := gorm.Open(sqlite.Open(dsn.String()), &gorm.Config{
		Logger:                                   opts.gormLogger,
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		return nil, fmt.Errorf("gorm.Open: %w", err)
	}

	return &Client{
		connection: connection,
	}, nil
}

func (client *Client) Close() error {
	// no close method provided by gorm
	return nil
}

type ORMClient[Model any] struct {
	connection *gorm.DB
}

func NewNoTransaction[Model any](client *Client, f func(*ORMClient[Model]) error) error {
	return f(&ORMClient[Model]{
		connection: client.connection,
	})
}

func NewTransaction[Model any](client *Client, f func(*ORMClient[Model]) error) error {
	return client.connection.Transaction(func(tx *gorm.DB) error {
		return f(&ORMClient[Model]{
			connection: tx,
		})
	})
}

func (ormClient *ORMClient[Model]) FindByValue(value *Model) (Model, error) {
	err := ormClient.connection.Take(&value).Error
	return *value, err
}

func (ormClient *ORMClient[Model]) Create(value *Model) error {
	return ormClient.connection.Create(value).Error
}

func (ormClient *ORMClient[Model]) GetAll() ([]Model, error) {
	var values []Model
	err := ormClient.connection.Find(&values).Error
	return values, err
}
