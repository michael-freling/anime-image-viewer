package db

import (
	"context"
	"fmt"
	"log/slog"
	"path/filepath"

	"github.com/michael-freling/anime-image-viewer/internal/config"
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
	return DSN(
		fmt.Sprintf("file:%s?cache=shared",
			filepath.Join(directory, filename),
		),
	)
}

func (dsn DSN) String() string {
	return string(dsn)
}

const (
	DSNMemory DSN = "file::memory:?cache=shared"
)

func FromConfig(conf config.Config, logger *slog.Logger) (*Client, error) {
	dbFile := DSNFromFilePath(conf.ConfigDirectory,
		fmt.Sprintf("%s_v1.sqlite", conf.Environment),
	)
	logger.Info("Connecting to a DB", "dbFile", dbFile)

	if conf.Environment == config.EnvironmentDevelopment {
		return NewClient(dbFile, WithGormLogger(logger))
	}
	return NewClient(dbFile, WithNopLogger())
}

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
	if err := client.connection.AutoMigrate(
		&Tag{},
		&File{},
		&FileTag{},
		&Anime{},
		&Character{},
		&FileCharacter{},
	); err != nil {
		return fmt.Errorf("AutoMigrate: %w", err)
	}

	if err := client.migrateCharactersFromTags(); err != nil {
		return fmt.Errorf("migrateCharactersFromTags: %w", err)
	}

	return nil
}

// migrateCharactersFromTags migrates character data from the Tag/FileTag tables
// into the new Character/FileCharacter tables. It is idempotent: if no tags
// with category='character' exist, it is a no-op.
func (client *Client) migrateCharactersFromTags() error {
	var characterTags []Tag
	if err := client.connection.Where("category = ?", "character").Find(&characterTags).Error; err != nil {
		return fmt.Errorf("find character tags: %w", err)
	}
	if len(characterTags) == 0 {
		return nil
	}

	return client.connection.Transaction(func(tx *gorm.DB) error {
		// Build characters from tags and collect migrated tag IDs
		tagIDs := make([]uint, 0, len(characterTags))
		characters := make([]Character, 0, len(characterTags))
		for _, tag := range characterTags {
			if tag.AnimeID == nil {
				continue
			}
			tagIDs = append(tagIDs, tag.ID)
			characters = append(characters, Character{
				ID:        tag.ID,
				Name:      tag.Name,
				AnimeID:   *tag.AnimeID,
				CreatedAt: tag.CreatedAt,
				UpdatedAt: tag.UpdatedAt,
			})
		}

		if len(characters) > 0 {
			if err := tx.Create(&characters).Error; err != nil {
				return fmt.Errorf("create characters: %w", err)
			}
		}

		if len(tagIDs) == 0 {
			return nil
		}

		// Migrate FileTag rows for those tag IDs into FileCharacter rows
		var fileTags []FileTag
		if err := tx.Where("tag_id IN ?", tagIDs).Find(&fileTags).Error; err != nil {
			return fmt.Errorf("find file tags: %w", err)
		}

		if len(fileTags) > 0 {
			fileCharacters := make([]FileCharacter, 0, len(fileTags))
			for _, ft := range fileTags {
				fileCharacters = append(fileCharacters, FileCharacter{
					CharacterID: ft.TagID,
					FileID:      ft.FileID,
					AddedBy:     ft.AddedBy,
					CreatedAt:   ft.CreatedAt,
				})
			}
			if err := tx.Create(&fileCharacters).Error; err != nil {
				return fmt.Errorf("create file characters: %w", err)
			}
		}

		// Delete old FileTag and Tag rows
		if err := tx.Where("tag_id IN ?", tagIDs).Delete(&FileTag{}).Error; err != nil {
			return fmt.Errorf("delete file tags: %w", err)
		}
		if err := tx.Where("id IN ?", tagIDs).Delete(&Tag{}).Error; err != nil {
			return fmt.Errorf("delete character tags: %w", err)
		}

		return nil
	})
}

type ORMClient[Model any] struct {
	connection *gorm.DB
}

func FindByValue[Model any](client *Client, value Model) (Model, error) {
	var result Model
	err := client.connection.Take(&result, value).Error
	return result, err
}

func FindAllByValue[Model any](client *Client, value Model) ([]Model, error) {
	var result []Model
	err := client.connection.Find(&result, value).Error
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

func (ormClient *ORMClient[Model]) getTransaction(ctx context.Context) *gorm.DB {
	tx := transactionFromContext(ctx)
	if tx == nil {
		return ormClient.connection
	}
	return tx
}

func (ormClient *ORMClient[Model]) FindByValue(ctx context.Context, value *Model) (Model, error) {
	var result Model
	err := ormClient.getTransaction(ctx).
		Take(&result, *value).
		Error
	return result, err
}

func (ormClient *ORMClient[Model]) GetAll() ([]Model, error) {
	var values []Model
	err := ormClient.connection.Find(&values).Error
	return values, err
}

func (ormClient *ORMClient[Model]) Create(ctx context.Context, value *Model) error {
	return ormClient.getTransaction(ctx).
		Create(value).
		Error
}

func (ormClient *ORMClient[Model]) Update(ctx context.Context, value *Model) error {
	return ormClient.getTransaction(ctx).
		Save(value).
		Error
}

func (ormClient *ORMClient[Model]) BatchCreate(ctx context.Context, values []Model) error {
	return ormClient.getTransaction(ctx).
		Create(values).
		Error
}

func (ormClient *ORMClient[Model]) BatchDelete(ctx context.Context, values []Model) error {
	return ormClient.getTransaction(ctx).
		Delete(values).
		Error
}
