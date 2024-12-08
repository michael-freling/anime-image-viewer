package db

import (
	"fmt"
	"log/slog"

	slogGorm "github.com/orandin/slog-gorm"
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

func WithGormLogger(l *slog.Logger) ClientOption {
	return func(c *clientOptions) {
		c.gormLogger = slogGorm.New(
			slogGorm.WithHandler(l.Handler()),
			slogGorm.WithTraceAll(), // trace all messages
		)
	}
}

type DSN string

func DSNFromFilePath(directory string, filename string) DSN {
	return DSN(fmt.Sprintf("file://%s/%s?cache=shared", directory, filename))
}

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

func (client *Client) Migrate() error {
	return client.connection.AutoMigrate(
		&Tag{},
		&File{},
	)
}

type ORMClient[Model any] struct {
	connection *gorm.DB
}

func FindByValue[Model any](client *Client, value Model) (Model, error) {
	var result Model
	err := client.connection.Take(&result, value).Error
	return result, err
}

func GetAll[Model any](client *Client) ([]Model, error) {
	var values []Model
	err := client.connection.Find(&values).Error
	return values, err
}

func Create[Model any](client *Client, value Model) error {
	return client.connection.Create(value).Error
}

func BatchCreate[Model any](client *Client, values []Model) error {
	return client.connection.Create(values).Error
}

func NewTransaction[Model any](client *Client, f func(*ORMClient[Model]) error) error {
	return client.connection.Transaction(func(tx *gorm.DB) error {
		return f(&ORMClient[Model]{
			connection: tx,
		})
	})
}

func (ormClient *ORMClient[Model]) FindByValue(value *Model) (Model, error) {
	var result Model
	err := ormClient.connection.Take(&result, *value).Error
	return result, err
}

func (ormClient *ORMClient[Model]) GetAll() ([]Model, error) {
	var values []Model
	err := ormClient.connection.Find(&values).Error
	return values, err
}

func (ormClient *ORMClient[Model]) Create(value *Model) error {
	return ormClient.connection.Create(value).Error
}

func (ormClient *ORMClient[Model]) Update(value *Model) error {
	return ormClient.connection.Save(value).Error
}
