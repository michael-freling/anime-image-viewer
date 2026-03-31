package db

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewTestClient(t *testing.T) {
	testClient := NewTestClient(t)
	require.NotNil(t, testClient.Client)
	require.NotNil(t, testClient.connection)

	// Verify tables are migrated: we can insert data without errors
	testClient.Truncate(t, File{})
	file := File{ID: 9901, ParentID: 0, Name: "test-file", Type: FileTypeDirectory}
	err := testClient.connection.Create(&file).Error
	assert.NoError(t, err)
	testClient.Truncate(t, File{})
}

func TestSqliteSequence_TableName(t *testing.T) {
	seq := SqliteSequence{}
	assert.Equal(t, "sqlite_sequence", seq.TableName())
}

func TestLoadTestData(t *testing.T) {
	testClient := NewTestClient(t)

	t.Run("load tags", func(t *testing.T) {
		testClient.Truncate(t, Tag{})

		tags := []Tag{
			{ID: 9801, Name: "load-tag1"},
			{ID: 9802, Name: "load-tag2"},
		}
		LoadTestData(t, testClient, tags)

		got := MustGetAll[Tag](t, testClient)
		assert.Len(t, got, 2)

		testClient.Truncate(t, Tag{})
	})

	t.Run("load files", func(t *testing.T) {
		testClient.Truncate(t, File{})

		files := []File{
			{ID: 9811, ParentID: 0, Name: "load-dir1", Type: FileTypeDirectory},
			{ID: 9812, ParentID: 9811, Name: "load-img.jpg", Type: FileTypeImage},
		}
		LoadTestData(t, testClient, files)

		got := MustGetAll[File](t, testClient)
		assert.Len(t, got, 2)

		testClient.Truncate(t, File{})
	})

	t.Run("empty slice is skipped", func(t *testing.T) {
		testClient.Truncate(t, Tag{})
		LoadTestData(t, testClient, []Tag{})
		got := MustGetAll[Tag](t, testClient)
		assert.Nil(t, got)
	})
}

func TestMustGetAll(t *testing.T) {
	testClient := NewTestClient(t)

	t.Run("returns nil for empty table", func(t *testing.T) {
		testClient.Truncate(t, Tag{})
		got := MustGetAll[Tag](t, testClient)
		assert.Nil(t, got)
	})

	t.Run("returns records", func(t *testing.T) {
		testClient.Truncate(t, Tag{})
		tags := []Tag{
			{ID: 9701, Name: "mustget-tag1"},
		}
		LoadTestData(t, testClient, tags)
		got := MustGetAll[Tag](t, testClient)
		assert.Len(t, got, 1)

		testClient.Truncate(t, Tag{})
	})
}

func TestTestClient_Truncate(t *testing.T) {
	testClient := NewTestClient(t)
	testClient.Truncate(t, Tag{})

	tags := []Tag{
		{ID: 9601, Name: "trunc-tag1"},
		{ID: 9602, Name: "trunc-tag2"},
	}
	LoadTestData(t, testClient, tags)

	got := MustGetAll[Tag](t, testClient)
	assert.Len(t, got, 2)

	testClient.Truncate(t, Tag{})

	got = MustGetAll[Tag](t, testClient)
	assert.Nil(t, got)
}

func TestFileBuilder(t *testing.T) {
	testClient := NewTestClient(t)

	builder := testClient.NewFileBuilder()
	require.NotNil(t, builder)

	t.Run("AddImage and BuildImage", func(t *testing.T) {
		builder.AddImage(t, File{
			ID:       9501,
			ParentID: 0,
			Name:     "test.jpg",
		})

		img := builder.BuildImage(t, 9501)
		assert.Equal(t, uint(9501), img.ID)
		assert.Equal(t, "test.jpg", img.Name)
		assert.Equal(t, FileTypeImage, img.Type)
		// CreatedAt and UpdatedAt should be set to mockNow
		assert.NotZero(t, img.CreatedAt)
		assert.NotZero(t, img.UpdatedAt)
	})

	t.Run("AddImage with custom timestamps", func(t *testing.T) {
		builder.AddImage(t, File{
			ID:        9502,
			ParentID:  0,
			Name:      "custom.jpg",
			CreatedAt: 12345,
			UpdatedAt: 67890,
		})

		img := builder.BuildImage(t, 9502)
		assert.Equal(t, uint(12345), img.CreatedAt)
		assert.Equal(t, uint(67890), img.UpdatedAt)
	})
}

func TestTagBuilder(t *testing.T) {
	testClient := NewTestClient(t)

	t.Run("AddTag and Build", func(t *testing.T) {
		builder := testClient.NewTagBuilder()
		require.NotNil(t, builder)

		builder.AddTag(t, Tag{
			ID:   9401,
			Name: "tag1",
		})

		tag := builder.Build(t, 9401)
		assert.Equal(t, uint(9401), tag.ID)
		assert.Equal(t, "tag1", tag.Name)
		assert.NotZero(t, tag.CreatedAt)
		assert.NotZero(t, tag.UpdatedAt)
	})

	t.Run("AddTag with custom timestamps", func(t *testing.T) {
		builder := testClient.NewTagBuilder()
		builder.AddTag(t, Tag{
			ID:        9402,
			Name:      "tag2",
			CreatedAt: 11111,
			UpdatedAt: 22222,
		})

		tag := builder.Build(t, 9402)
		assert.Equal(t, uint(11111), tag.CreatedAt)
		assert.Equal(t, uint(22222), tag.UpdatedAt)
	})

	t.Run("BuildTags", func(t *testing.T) {
		builder := testClient.NewTagBuilder()
		tags := builder.BuildTags(t,
			Tag{ID: 9410, Name: "a"},
			Tag{ID: 9411, Name: "b"},
			Tag{ID: 9412, Name: "c"},
		)
		assert.Len(t, tags, 3)
		assert.Equal(t, "a", tags[0].Name)
		assert.Equal(t, "b", tags[1].Name)
		assert.Equal(t, "c", tags[2].Name)
		// Verify they all have timestamps
		for _, tag := range tags {
			assert.NotZero(t, tag.CreatedAt)
			assert.NotZero(t, tag.UpdatedAt)
		}
	})
}

func TestTagBuilder_FileTag(t *testing.T) {
	testClient := NewTestClient(t)

	t.Run("AddFileTag and BuildFileTag", func(t *testing.T) {
		builder := testClient.NewTagBuilder()
		builder.AddFileTag(t, FileTag{
			TagID:   9301,
			FileID:  9310,
			AddedBy: FileTagAddedByUser,
		})

		ft := builder.BuildFileTag(t, 9310, 9301)
		assert.Equal(t, uint(9301), ft.TagID)
		assert.Equal(t, uint(9310), ft.FileID)
		assert.Equal(t, FileTagAddedByUser, ft.AddedBy)
		assert.NotZero(t, ft.CreatedAt)
	})

	t.Run("AddFileTag with custom timestamp", func(t *testing.T) {
		builder := testClient.NewTagBuilder()
		builder.AddFileTag(t, FileTag{
			TagID:     9302,
			FileID:    9320,
			AddedBy:   FileTagAddedByImport,
			CreatedAt: 99999,
		})

		ft := builder.BuildFileTag(t, 9320, 9302)
		assert.Equal(t, uint(99999), ft.CreatedAt)
	})

	t.Run("multiple file tags for same tag", func(t *testing.T) {
		builder := testClient.NewTagBuilder()
		builder.AddFileTag(t, FileTag{TagID: 9305, FileID: 9350, AddedBy: FileTagAddedByUser})
		builder.AddFileTag(t, FileTag{TagID: 9305, FileID: 9360, AddedBy: FileTagAddedBySuggestion})

		ft1 := builder.BuildFileTag(t, 9350, 9305)
		ft2 := builder.BuildFileTag(t, 9360, 9305)
		assert.Equal(t, FileTagAddedByUser, ft1.AddedBy)
		assert.Equal(t, FileTagAddedBySuggestion, ft2.AddedBy)
	})
}

func TestClientTruncate_Deprecated(t *testing.T) {
	// Test the deprecated Client.Truncate method
	testClient := NewTestClient(t)
	testClient.Truncate(t, Tag{})

	// Insert some data
	tags := []Tag{
		{ID: 9201, Name: "dep-tag1"},
		{ID: 9202, Name: "dep-tag2"},
	}
	require.NoError(t, testClient.connection.Create(&tags).Error)

	// Verify data exists
	var count int64
	testClient.connection.Model(&Tag{}).Count(&count)
	assert.Equal(t, int64(2), count)

	// Truncate using the deprecated method
	err := testClient.Client.Truncate(Tag{})
	assert.NoError(t, err)

	// Verify data is gone
	testClient.connection.Model(&Tag{}).Count(&count)
	assert.Equal(t, int64(0), count)
}
