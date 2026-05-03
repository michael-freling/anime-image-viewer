package db

import (
	"context"
	"fmt"
	"log/slog"
	"path/filepath"
	"strings"

	"github.com/michael-freling/anime-image-viewer/internal/config"
	slogGorm "github.com/orandin/slog-gorm"
	"gorm.io/driver/sqlite" // Sqlite driver based on CGO
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
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
// with category='character' exist, it is a no-op. Uses ON CONFLICT DO NOTHING
// so that pre-existing Character/FileCharacter rows from a previous partial
// migration do not cause errors.
//
// For orphaned character tags (AnimeID is nil), the migration attempts to derive
// the AnimeID by walking up the file tree from associated FileTag rows. If all
// files resolve to the same anime, that anime is used. If the anime cannot be
// determined (no file associations, or files resolve to multiple anime), the
// migration FAILS with a descriptive error so the app cannot start with
// unresolvable character data.
func (client *Client) migrateCharactersFromTags() error {
	var characterTags []Tag
	if err := client.connection.Where("category = ?", "character").Find(&characterTags).Error; err != nil {
		return fmt.Errorf("find character tags: %w", err)
	}
	if len(characterTags) == 0 {
		return nil
	}

	slog.Info("migrateCharactersFromTags: found character tags to migrate", "count", len(characterTags))

	return client.connection.Transaction(func(tx *gorm.DB) error {
		// Separate tags into migratable (have AnimeID) and orphaned (no AnimeID)
		tagIDs := make([]uint, 0, len(characterTags))
		orphanedTags := make([]Tag, 0)
		characters := make([]Character, 0, len(characterTags))
		for _, tag := range characterTags {
			if tag.AnimeID == nil {
				orphanedTags = append(orphanedTags, tag)
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

		// Try to derive AnimeID for orphaned character tags from file associations
		if len(orphanedTags) > 0 {
			var unresolvedNames []string
			for _, tag := range orphanedTags {
				var fileTags []FileTag
				if err := tx.Where("tag_id = ?", tag.ID).Find(&fileTags).Error; err != nil {
					return fmt.Errorf("find file tags for orphaned tag %d (%s): %w", tag.ID, tag.Name, err)
				}

				if len(fileTags) == 0 {
					unresolvedNames = append(unresolvedNames, fmt.Sprintf("%s (id=%d, no file associations)", tag.Name, tag.ID))
					continue
				}

				animeIDs := map[uint]bool{}
				for _, ft := range fileTags {
					animeID := walkUpForAnime(tx, ft.FileID)
					if animeID != 0 {
						animeIDs[animeID] = true
					}
				}

				if len(animeIDs) == 1 {
					// All files resolve to the same anime — derive it
					var derivedAnimeID uint
					for id := range animeIDs {
						derivedAnimeID = id
					}
					slog.Info("migrateCharactersFromTags: derived AnimeID for orphaned character tag",
						"tagID", tag.ID, "name", tag.Name, "animeID", derivedAnimeID)
					tagIDs = append(tagIDs, tag.ID)
					characters = append(characters, Character{
						ID:        tag.ID,
						Name:      tag.Name,
						AnimeID:   derivedAnimeID,
						CreatedAt: tag.CreatedAt,
						UpdatedAt: tag.UpdatedAt,
					})
				} else if len(animeIDs) == 0 {
					unresolvedNames = append(unresolvedNames, fmt.Sprintf("%s (id=%d, files have no anime in parent chain)", tag.Name, tag.ID))
				} else {
					unresolvedNames = append(unresolvedNames, fmt.Sprintf("%s (id=%d, files resolve to multiple anime)", tag.Name, tag.ID))
				}
			}

			if len(unresolvedNames) > 0 {
				return fmt.Errorf("cannot migrate character tags without AnimeID: [%s]. "+
					"These characters have no anime association. Please assign them to an anime using the tag management UI, "+
					"or delete them manually with: sqlite3 <db-path> \"DELETE FROM tags WHERE name IN ('%s')\"",
					strings.Join(unresolvedNames, ", "),
					strings.Join(extractNames(unresolvedNames), "', '"))
			}
		}

		// Create characters with ON CONFLICT DO NOTHING to handle duplicate IDs
		// from a previous partial migration
		if len(characters) > 0 {
			if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&characters).Error; err != nil {
				return fmt.Errorf("create characters: %w", err)
			}
			slog.Info("migrateCharactersFromTags: created character rows", "count", len(characters))
		}

		// Migrate FileTag rows for those tag IDs into FileCharacter rows
		if len(tagIDs) > 0 {
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
				if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&fileCharacters).Error; err != nil {
					return fmt.Errorf("create file characters: %w", err)
				}
				slog.Info("migrateCharactersFromTags: created file_character rows", "count", len(fileCharacters))
			}

			// Delete old FileTag and Tag rows for migrated characters
			if err := tx.Where("tag_id IN ?", tagIDs).Delete(&FileTag{}).Error; err != nil {
				return fmt.Errorf("delete file tags: %w", err)
			}
			if err := tx.Where("id IN ?", tagIDs).Delete(&Tag{}).Error; err != nil {
				return fmt.Errorf("delete character tags: %w", err)
			}
			slog.Info("migrateCharactersFromTags: deleted migrated character tags", "count", len(tagIDs))
		}

		return nil
	})
}

// walkUpForAnime walks up the file tree from the given file ID until it finds
// a directory with AnimeID set, and returns that AnimeID. Returns 0 if no
// anime is found or an error occurs.
func walkUpForAnime(tx *gorm.DB, fileID uint) uint {
	currentID := fileID
	for {
		var file File
		if err := tx.Select("id, parent_id, anime_id").Take(&file, currentID).Error; err != nil {
			return 0
		}
		if file.AnimeID != nil {
			return *file.AnimeID
		}
		if file.ParentID == 0 || file.ParentID == file.ID {
			return 0 // reached root
		}
		currentID = file.ParentID
	}
}

// extractNames extracts just the character name portion from unresolved name
// strings formatted as "Name (id=N, reason)".
func extractNames(unresolvedNames []string) []string {
	names := make([]string, 0, len(unresolvedNames))
	for _, entry := range unresolvedNames {
		if idx := strings.Index(entry, " (id="); idx > 0 {
			names = append(names, entry[:idx])
		} else {
			names = append(names, entry)
		}
	}
	return names
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
