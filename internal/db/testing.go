package db

import (
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// deprecated. Use TestClient.Truncate instead
func (client *Client) Truncate(models ...interface{}) error {
	gotErrors := make([]error, 0)
	for _, model := range models {
		err := client.connection.Session(&gorm.Session{
			AllowGlobalUpdate: true,
		}).Delete(&model).Error
		if err != nil {
			gotErrors = append(gotErrors, err)
		}
	}
	return errors.Join(gotErrors...)
}

type TestClient struct {
	*Client
	mockNow time.Time
}

// The sqlite_sequence table is used by sqlite to store the autoincrement value for each table.
type SqliteSequence struct {
	Name string `gorm:"column:name"`
	Seq  int    `gorm:"column:seq"`
}

func (SqliteSequence) TableName() string {
	return "sqlite_sequence"
}

func NewTestClient(t *testing.T) TestClient {
	client, err := NewClient(DSNMemory, WithNopLogger())
	mockTime := time.Date(2021, 1, 1, 0, 0, 0, 0, time.UTC)

	require.NoError(t, err)
	t.Cleanup(func() {
		require.NoError(t, client.Close())
	})
	require.NoError(t, client.Migrate())
	// delete auto created records and reset auto increment values
	require.NoError(t, client.Truncate(Tag{}))
	client.Truncate(SqliteSequence{})

	client.connection = client.connection.Session(&gorm.Session{
		NowFunc: func() time.Time {
			return mockTime
		},
	})

	return TestClient{
		client,
		mockTime,
	}
}

func LoadTestData[Model any](t *testing.T, client TestClient, recordsInTables ...[]Model) {
	for _, records := range recordsInTables {
		if len(records) == 0 {
			continue
		}
		require.NoError(t, BatchCreate(client.Client, records))
	}
}

func MustGetAll[T any](t *testing.T, testClient TestClient) []T {
	result, err := GetAll[T](testClient.Client)
	require.NoError(t, err)
	if len(result) == 0 {
		return nil
	}
	return result
}

func (client *TestClient) Truncate(t *testing.T, models ...interface{}) {
	for _, model := range models {
		err := client.Client.connection.Session(&gorm.Session{
			AllowGlobalUpdate: true,
		}).Delete(&model).Error
		require.NoError(t, err)
	}
}

type FileBuilder struct {
	mockNow time.Time
	images  map[uint]File
}

func (client *TestClient) NewFileBuilder() *FileBuilder {
	return &FileBuilder{
		mockNow: client.mockNow,
		images:  make(map[uint]File),
	}
}

func (builder *FileBuilder) AddImage(t *testing.T, image File) *FileBuilder {
	require.NotEmpty(t, image.ID)

	image.Type = FileTypeImage
	if image.CreatedAt == 0 {
		image.CreatedAt = uint(builder.mockNow.Unix())
	}
	if image.UpdatedAt == 0 {
		image.UpdatedAt = uint(builder.mockNow.Unix())
	}
	builder.images[image.ID] = image
	return builder
}

func (builder FileBuilder) BuildImage(t *testing.T, id uint) File {
	require.Contains(t, builder.images, id)
	return builder.images[id]
}

type TagBuilder struct {
	tags     map[uint]Tag
	fileTags map[uint]map[uint]FileTag

	now time.Time
}

func (client *TestClient) NewTagBuilder() *TagBuilder {
	return &TagBuilder{
		tags:     make(map[uint]Tag),
		fileTags: make(map[uint]map[uint]FileTag),
		now:      client.mockNow,
	}
}

func (builder *TagBuilder) AddTag(t *testing.T, tag Tag) *TagBuilder {
	require.NotEmpty(t, tag.ID)

	if tag.CreatedAt == 0 {
		tag.CreatedAt = uint(builder.now.Unix())
	}
	if tag.UpdatedAt == 0 {
		tag.UpdatedAt = uint(builder.now.Unix())
	}
	builder.tags[tag.ID] = tag
	return builder
}

func (builder TagBuilder) Build(t *testing.T, id uint) Tag {
	require.Contains(t, builder.tags, id)
	return builder.tags[id]
}

func (builder *TagBuilder) BuildTags(t *testing.T, tags ...Tag) []Tag {
	result := make([]Tag, 0)
	for _, tag := range tags {
		builder.AddTag(t, tag)
		result = append(result, builder.tags[tag.ID])
	}
	return result
}

func (builder *TagBuilder) AddFileTag(t *testing.T, fileTag FileTag) *TagBuilder {
	require.NotEmpty(t, fileTag.FileID)
	require.NotEmpty(t, fileTag.TagID)
	if fileTag.CreatedAt == 0 {
		fileTag.CreatedAt = uint(builder.now.Unix())
	}

	if _, ok := builder.fileTags[fileTag.TagID]; !ok {
		builder.fileTags[fileTag.TagID] = make(map[uint]FileTag)
	}
	builder.fileTags[fileTag.TagID][fileTag.FileID] = fileTag
	return builder
}

func (builder TagBuilder) BuildFileTag(
	t *testing.T,
	fileID uint,
	tagID uint,
) FileTag {
	require.Contains(t, builder.fileTags, tagID)
	require.Contains(t, builder.fileTags[tagID], fileID)
	return builder.fileTags[tagID][fileID]
}
