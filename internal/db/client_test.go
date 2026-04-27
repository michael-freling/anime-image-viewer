package db

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"testing"

	"github.com/michael-freling/anime-image-viewer/internal/config"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type Table struct {
	// gorm.Model
	ID        uint   `gorm:"primarykey"`
	Name      string `gorm:"unique"`
	CreatedAt int64
	UpdatedAt int64
}

// newIsolatedTableClient creates a fresh file-based SQLite client with the Table
// schema migrated, isolated from other tests.
func newIsolatedTableClient(t *testing.T) *Client {
	t.Helper()
	tmpDir := t.TempDir()
	dsn := DSNFromFilePath(tmpDir, "test.sqlite")
	client, err := NewClient(dsn, WithNopLogger())
	require.NoError(t, err)
	require.NoError(t, client.connection.AutoMigrate(&Table{}))
	t.Cleanup(func() {
		client.Close()
	})
	return client
}

func TestORMClient_FindByValue(t *testing.T) {
	dbClient := newIsolatedTableClient(t)

	values := []Table{
		{Name: "test"},
		{Name: "test 2"},
	}
	require.NoError(t, dbClient.connection.Create(&values).Error)

	type args struct {
		value Table
	}
	testCases := []struct {
		name    string
		args    args
		want    Table
		wantErr error
	}{
		{
			name: "Find a record",
			args: args{
				value: Table{
					ID: values[0].ID,
				},
			},
			want: values[0],
		},
		{
			name: "Find an unknown record",
			args: args{
				value: Table{
					ID: 999,
				},
			},
			wantErr: ErrRecordNotFound,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			ormClient := &ORMClient[Table]{
				connection: dbClient.connection,
			}
			ctx := context.Background()
			got, gotErr := ormClient.FindByValue(ctx, &Table{
				ID: tc.args.value.ID,
			})
			if tc.wantErr != nil {
				assert.ErrorIs(t, gotErr, tc.wantErr)
				return
			}
			assert.Equal(t, tc.want, got)
			assert.NoError(t, gotErr)
		})
	}
}

func TestORMClient_Create(t *testing.T) {
	dbClient := newIsolatedTableClient(t)

	type args struct {
		values []Table
	}

	testCases := []struct {
		name      string
		args      args
		wantCount int
		wantErr   bool
	}{
		{
			name: "Create a record",
			args: args{
				values: []Table{
					{Name: "test"},
				},
			},
			wantCount: 1,
		},
		{
			name: "Violate unique constraints",
			args: args{
				values: []Table{
					{Name: "test"},
					{Name: "test"},
				},
			},
			wantCount: 1,
			wantErr:   true,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			dbClient.Truncate(&Table{})

			var gotErr error
			for _, value := range tc.args.values {
				gotErr = Create(dbClient, &value)
				if tc.wantErr {
					continue
				}
				assert.NoError(t, gotErr)

				got, err := FindByValue(dbClient, &Table{
					ID: value.ID,
				})
				assert.Equal(t, value.Name, got.Name)
				assert.NoError(t, err)
			}
			if tc.wantErr {
				assert.Error(t, gotErr)
			}

			got, err := GetAll[Table](dbClient)
			assert.Len(t, got, tc.wantCount)
			assert.NoError(t, err)
		})
	}
}

// Tests for WithGormLogger
func TestWithGormLogger(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{
		Level: slog.LevelDebug,
	}))

	tmpDir := t.TempDir()
	dsn := DSNFromFilePath(tmpDir, "gorm_logger_test.sqlite")
	client, err := NewClient(dsn, WithGormLogger(logger))
	require.NoError(t, err)
	require.NotNil(t, client)
	require.NotNil(t, client.connection)
}

// Tests for DSNFromFilePath
func TestDSNFromFilePath(t *testing.T) {
	tests := []struct {
		name      string
		directory string
		filename  string
		want      DSN
	}{
		{
			name:      "basic path",
			directory: "/tmp/test",
			filename:  "db.sqlite",
			want:      DSN("file:/tmp/test/db.sqlite?cache=shared"),
		},
		{
			name:      "nested directory",
			directory: "/home/user/.config/app",
			filename:  "production_v1.sqlite",
			want:      DSN("file:/home/user/.config/app/production_v1.sqlite?cache=shared"),
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := DSNFromFilePath(tc.directory, tc.filename)
			assert.Equal(t, tc.want, got)
			// Also test String() method
			assert.Equal(t, string(tc.want), got.String())
		})
	}
}

// Tests for FromConfig
func TestFromConfig(t *testing.T) {
	// We cannot set Config.Environment directly because its type is unexported.
	// When constructed manually (not via ReadConfig), Config.Environment is zero-value.
	// FromConfig still works; it just takes the non-development branch.
	// We test that FromConfig creates a valid client and the DB file appears on disk.
	t.Run("creates client and database file", func(t *testing.T) {
		tmpDir := t.TempDir()
		conf := config.Config{
			ConfigDirectory: tmpDir,
		}
		logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{
			Level: slog.LevelDebug,
		}))

		client, err := FromConfig(conf, logger)
		require.NoError(t, err)
		require.NotNil(t, client)

		// Run a migration and write data so the file is created on disk
		require.NoError(t, client.Migrate())
		require.NoError(t, client.connection.Create(&Tag{ID: 1, Name: "t"}).Error)

		err = client.Close()
		assert.NoError(t, err)

		// Verify a sqlite file was created in the config directory
		entries, err := os.ReadDir(tmpDir)
		require.NoError(t, err)
		found := false
		for _, e := range entries {
			if filepath.Ext(e.Name()) == ".sqlite" {
				found = true
				break
			}
		}
		assert.True(t, found, "expected a .sqlite file in %s, got entries: %v", tmpDir, entries)
	})

	// Test with a config obtained from ReadConfig, which sets Environment properly.
	// In non-production builds, Environment is "development", so the WithGormLogger
	// branch is taken.
	t.Run("development config uses gorm logger", func(t *testing.T) {
		tmpDir := t.TempDir()
		// Use ReadConfig with a non-existent config file path so it returns defaults
		// with the runtime environment set.
		conf, err := config.ReadConfig("")
		require.NoError(t, err)

		// Override the config directory to our temp dir
		conf.ConfigDirectory = tmpDir
		logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{
			Level: slog.LevelDebug,
		}))

		client, err := FromConfig(conf, logger)
		require.NoError(t, err)
		require.NotNil(t, client)

		// Migrate and write so the file materializes
		require.NoError(t, client.Migrate())
		require.NoError(t, client.connection.Create(&Tag{ID: 1, Name: "dev-test"}).Error)

		err = client.Close()
		assert.NoError(t, err)

		// Verify the expected DB file exists
		expectedFile := filepath.Join(tmpDir, fmt.Sprintf("%s_v1.sqlite", conf.Environment))
		_, err = os.Stat(expectedFile)
		assert.NoError(t, err)
	})
}

// Tests for Close
func TestClose(t *testing.T) {
	tmpDir := t.TempDir()
	dsn := DSNFromFilePath(tmpDir, "close_test.sqlite")
	client, err := NewClient(dsn, WithNopLogger())
	require.NoError(t, err)

	err = client.Close()
	assert.NoError(t, err)
}

// Tests for Migrate
func TestMigrate(t *testing.T) {
	tmpDir := t.TempDir()
	dsn := DSNFromFilePath(tmpDir, "migrate_test.sqlite")
	client, err := NewClient(dsn, WithNopLogger())
	require.NoError(t, err)

	err = client.Migrate()
	assert.NoError(t, err)

	// Verify that the tables exist by inserting data
	tag := Tag{ID: 1, Name: "test-tag"}
	err = client.connection.Create(&tag).Error
	assert.NoError(t, err)

	file := File{ID: 1, ParentID: 0, Name: "test-file", Type: FileTypeDirectory}
	err = client.connection.Create(&file).Error
	assert.NoError(t, err)

	fileTag := FileTag{TagID: 1, FileID: 1, AddedBy: FileTagAddedByUser}
	err = client.connection.Create(&fileTag).Error
	assert.NoError(t, err)
}

// Tests for migrateCharactersFromTags
func TestMigrateCharactersFromTags(t *testing.T) {
	t.Run("migrates character tags to character table", func(t *testing.T) {
		tmpDir := t.TempDir()
		dsn := DSNFromFilePath(tmpDir, "migrate_char_test.sqlite")
		client, err := NewClient(dsn, WithNopLogger())
		require.NoError(t, err)
		t.Cleanup(func() { client.Close() })

		// Migrate to create tables
		require.NoError(t, client.Migrate())

		// Insert character tags (with category="character" and AnimeID set)
		animeID1 := uint(100)
		animeID2 := uint(200)
		tags := []Tag{
			{ID: 501, Name: "Hitori", Category: "character", AnimeID: &animeID1, CreatedAt: 1000, UpdatedAt: 1001},
			{ID: 502, Name: "Nijika", Category: "character", AnimeID: &animeID1, CreatedAt: 2000, UpdatedAt: 2001},
			{ID: 503, Name: "Ryo", Category: "character", AnimeID: &animeID2, CreatedAt: 3000, UpdatedAt: 3001},
			{ID: 504, Name: "action", Category: "", CreatedAt: 4000, UpdatedAt: 4001}, // not a character, should be ignored
		}
		require.NoError(t, client.connection.Create(&tags).Error)

		// Insert FileTags for the character tags
		fileTags := []FileTag{
			{TagID: 501, FileID: 10, AddedBy: FileTagAddedByUser, CreatedAt: 1100},
			{TagID: 501, FileID: 20, AddedBy: FileTagAddedByImport, CreatedAt: 1200},
			{TagID: 502, FileID: 10, AddedBy: FileTagAddedByUser, CreatedAt: 2100},
			{TagID: 504, FileID: 30, AddedBy: FileTagAddedByUser, CreatedAt: 4100}, // for non-character tag
		}
		require.NoError(t, client.connection.Create(&fileTags).Error)

		// Run migration again (it should pick up the character tags)
		require.NoError(t, client.Migrate())

		// Verify Character rows were created
		var characters []Character
		require.NoError(t, client.connection.Find(&characters).Error)
		assert.Len(t, characters, 3)

		charMap := make(map[uint]Character)
		for _, c := range characters {
			charMap[c.ID] = c
		}
		assert.Equal(t, "Hitori", charMap[501].Name)
		assert.Equal(t, uint(100), charMap[501].AnimeID)
		assert.Equal(t, uint(1000), charMap[501].CreatedAt)
		assert.Equal(t, "Nijika", charMap[502].Name)
		assert.Equal(t, uint(100), charMap[502].AnimeID)
		assert.Equal(t, "Ryo", charMap[503].Name)
		assert.Equal(t, uint(200), charMap[503].AnimeID)

		// Verify FileCharacter rows were created
		var fileCharacters []FileCharacter
		require.NoError(t, client.connection.Find(&fileCharacters).Error)
		assert.Len(t, fileCharacters, 3) // 2 for tag 501, 1 for tag 502

		fcMap := make(map[uint][]FileCharacter)
		for _, fc := range fileCharacters {
			fcMap[fc.CharacterID] = append(fcMap[fc.CharacterID], fc)
		}
		assert.Len(t, fcMap[501], 2)
		assert.Len(t, fcMap[502], 1)

		// Verify old character Tag rows were deleted
		var remainingTags []Tag
		require.NoError(t, client.connection.Where("category = ?", "character").Find(&remainingTags).Error)
		assert.Empty(t, remainingTags)

		// Verify old FileTags for character tags were deleted
		var remainingFileTags []FileTag
		require.NoError(t, client.connection.Where("tag_id IN ?", []uint{501, 502, 503}).Find(&remainingFileTags).Error)
		assert.Empty(t, remainingFileTags)

		// Verify non-character tag and its FileTag still exist
		var normalTags []Tag
		require.NoError(t, client.connection.Where("id = ?", 504).Find(&normalTags).Error)
		assert.Len(t, normalTags, 1)
		assert.Equal(t, "action", normalTags[0].Name)

		var normalFileTags []FileTag
		require.NoError(t, client.connection.Where("tag_id = ?", 504).Find(&normalFileTags).Error)
		assert.Len(t, normalFileTags, 1)
	})

	t.Run("idempotent - running again is a no-op", func(t *testing.T) {
		tmpDir := t.TempDir()
		dsn := DSNFromFilePath(tmpDir, "migrate_idem_test.sqlite")
		client, err := NewClient(dsn, WithNopLogger())
		require.NoError(t, err)
		t.Cleanup(func() { client.Close() })

		// First migration: create tables and seed character tags
		require.NoError(t, client.Migrate())

		animeID := uint(100)
		tags := []Tag{
			{ID: 601, Name: "Bocchi", Category: "character", AnimeID: &animeID, CreatedAt: 5000, UpdatedAt: 5001},
		}
		require.NoError(t, client.connection.Create(&tags).Error)

		fileTags := []FileTag{
			{TagID: 601, FileID: 10, AddedBy: FileTagAddedByUser, CreatedAt: 5100},
		}
		require.NoError(t, client.connection.Create(&fileTags).Error)

		// Run migration to migrate character tags
		require.NoError(t, client.Migrate())

		// Verify character was created
		var characters []Character
		require.NoError(t, client.connection.Find(&characters).Error)
		assert.Len(t, characters, 1)

		// Run migration again - should be a no-op since no more character tags exist
		require.NoError(t, client.Migrate())

		// Verify character count is still 1 (no duplicates)
		require.NoError(t, client.connection.Find(&characters).Error)
		assert.Len(t, characters, 1)
	})

	t.Run("no-op when no character tags exist", func(t *testing.T) {
		tmpDir := t.TempDir()
		dsn := DSNFromFilePath(tmpDir, "migrate_noop_test.sqlite")
		client, err := NewClient(dsn, WithNopLogger())
		require.NoError(t, err)
		t.Cleanup(func() { client.Close() })

		require.NoError(t, client.Migrate())

		// Insert only non-character tags
		tags := []Tag{
			{ID: 701, Name: "action", Category: ""},
		}
		require.NoError(t, client.connection.Create(&tags).Error)

		// Migration should succeed and not touch anything
		require.NoError(t, client.Migrate())

		// Tag should still exist
		var remaining []Tag
		require.NoError(t, client.connection.Find(&remaining).Error)
		assert.Len(t, remaining, 1)
	})

	t.Run("character tags without AnimeID are skipped", func(t *testing.T) {
		tmpDir := t.TempDir()
		dsn := DSNFromFilePath(tmpDir, "migrate_no_anime_test.sqlite")
		client, err := NewClient(dsn, WithNopLogger())
		require.NoError(t, err)
		t.Cleanup(func() { client.Close() })

		require.NoError(t, client.Migrate())

		// Create a character tag without AnimeID
		tags := []Tag{
			{ID: 801, Name: "OrphanChar", Category: "character", AnimeID: nil},
		}
		require.NoError(t, client.connection.Create(&tags).Error)

		require.NoError(t, client.Migrate())

		// No character should be created (AnimeID was nil)
		var characters []Character
		require.NoError(t, client.connection.Find(&characters).Error)
		assert.Empty(t, characters)
	})
}

// Tests for FindAllByValue (generic)
func TestFindAllByValue(t *testing.T) {
	client := newIsolatedTableClient(t)

	values := []Table{
		{Name: "alpha"},
		{Name: "beta"},
		{Name: "gamma"},
	}
	require.NoError(t, client.connection.Create(&values).Error)

	t.Run("find all records with empty filter", func(t *testing.T) {
		got, err := FindAllByValue(client, Table{})
		assert.NoError(t, err)
		assert.Len(t, got, 3)
	})

	t.Run("find records by name", func(t *testing.T) {
		got, err := FindAllByValue(client, Table{Name: "alpha"})
		assert.NoError(t, err)
		assert.Len(t, got, 1)
		assert.Equal(t, "alpha", got[0].Name)
	})

	t.Run("find no records", func(t *testing.T) {
		got, err := FindAllByValue(client, Table{Name: "nonexistent"})
		assert.NoError(t, err)
		assert.Empty(t, got)
	})
}

// Tests for BatchCreate (generic)
func TestBatchCreate(t *testing.T) {
	client := newIsolatedTableClient(t)

	t.Run("batch create multiple records", func(t *testing.T) {
		values := []Table{
			{Name: "batch1"},
			{Name: "batch2"},
			{Name: "batch3"},
		}
		err := BatchCreate(client, values)
		assert.NoError(t, err)

		all, err := GetAll[Table](client)
		assert.NoError(t, err)
		assert.Len(t, all, 3)
	})
}

// Tests for ORMClient.GetAll
func TestORMClient_GetAll(t *testing.T) {
	testClient := NewTestClient(t)
	testClient.Truncate(t, Tag{})

	tags := []Tag{
		{ID: 10001, Name: "getall-tag1"},
		{ID: 10002, Name: "getall-tag2"},
	}
	LoadTestData(t, testClient, tags)

	tagClient := testClient.Tag()
	got, err := tagClient.GetAll()
	assert.NoError(t, err)
	assert.Len(t, got, 2)

	testClient.Truncate(t, Tag{})
}

// Tests for ORMClient.Create (method version, via TagClient)
func TestORMClient_CreateMethod(t *testing.T) {
	testClient := NewTestClient(t)
	testClient.Truncate(t, Tag{})

	tagClient := testClient.Tag()
	ctx := context.Background()

	tag := Tag{ID: 10010, Name: "new-tag"}
	err := tagClient.Create(ctx, &tag)
	assert.NoError(t, err)

	got, err := tagClient.GetAll()
	assert.NoError(t, err)
	assert.Len(t, got, 1)
	assert.Equal(t, "new-tag", got[0].Name)

	testClient.Truncate(t, Tag{})
}

// Tests for ORMClient.Update
func TestORMClient_Update(t *testing.T) {
	testClient := NewTestClient(t)
	testClient.Truncate(t, Tag{})

	tags := []Tag{
		{ID: 10020, Name: "original"},
	}
	LoadTestData(t, testClient, tags)

	tagClient := testClient.Tag()
	ctx := context.Background()

	updatedTag := Tag{ID: 10020, Name: "updated"}
	err := tagClient.Update(ctx, &updatedTag)
	assert.NoError(t, err)

	got, err := tagClient.FindByValue(ctx, &Tag{ID: 10020})
	assert.NoError(t, err)
	assert.Equal(t, "updated", got.Name)

	testClient.Truncate(t, Tag{})
}

// Tests for ORMClient.BatchCreate (method version)
func TestORMClient_BatchCreateMethod(t *testing.T) {
	testClient := NewTestClient(t)
	testClient.Truncate(t, Tag{})

	tagClient := testClient.Tag()
	ctx := context.Background()

	tags := []Tag{
		{ID: 10030, Name: "batch-tag1"},
		{ID: 10031, Name: "batch-tag2"},
		{ID: 10032, Name: "batch-tag3"},
	}
	err := tagClient.BatchCreate(ctx, tags)
	assert.NoError(t, err)

	got, err := tagClient.GetAll()
	assert.NoError(t, err)
	assert.Len(t, got, 3)

	testClient.Truncate(t, Tag{})
}

// Tests for ORMClient.BatchDelete (method version)
func TestORMClient_BatchDeleteMethod(t *testing.T) {
	testClient := NewTestClient(t)
	testClient.Truncate(t, Tag{})

	tags := []Tag{
		{ID: 10040, Name: "del-tag1"},
		{ID: 10041, Name: "del-tag2"},
		{ID: 10042, Name: "del-tag3"},
	}
	LoadTestData(t, testClient, tags)

	tagClient := testClient.Tag()
	ctx := context.Background()

	toDelete := []Tag{
		{ID: 10040},
		{ID: 10041},
	}
	err := tagClient.BatchDelete(ctx, toDelete)
	assert.NoError(t, err)

	got, err := tagClient.GetAll()
	assert.NoError(t, err)
	assert.Len(t, got, 1)
	assert.Equal(t, uint(10042), got[0].ID)

	testClient.Truncate(t, Tag{})
}
