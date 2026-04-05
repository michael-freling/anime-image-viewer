package db

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewTransaction(t *testing.T) {
	testClient := NewTestClient(t)

	t.Run("successful transaction commits", func(t *testing.T) {
		testClient.Truncate(t, Tag{})
		ctx := context.Background()
		tagClient := testClient.Tag()

		err := NewTransaction(ctx, testClient.Client, func(txCtx context.Context) error {
			return tagClient.Create(txCtx, &Tag{ID: 9100, Name: "tx-tag"})
		})
		assert.NoError(t, err)

		// Verify the tag was committed
		got, err := tagClient.GetAll()
		require.NoError(t, err)
		found := false
		for _, tag := range got {
			if tag.Name == "tx-tag" {
				found = true
				break
			}
		}
		assert.True(t, found, "tag created in transaction should be committed")

		testClient.Truncate(t, Tag{})
	})

	t.Run("failed transaction rolls back", func(t *testing.T) {
		testClient.Truncate(t, Tag{})
		ctx := context.Background()
		tagClient := testClient.Tag()

		expectedErr := errors.New("intentional rollback")
		err := NewTransaction(ctx, testClient.Client, func(txCtx context.Context) error {
			if err := tagClient.Create(txCtx, &Tag{ID: 9200, Name: "rollback-tag"}); err != nil {
				return err
			}
			return expectedErr
		})
		assert.Error(t, err)
		assert.Equal(t, expectedErr, err)

		// Verify the tag was NOT committed
		got, err := tagClient.GetAll()
		require.NoError(t, err)
		for _, tag := range got {
			assert.NotEqual(t, "rollback-tag", tag.Name, "tag should have been rolled back")
		}

		testClient.Truncate(t, Tag{})
	})

	t.Run("transaction uses context for multiple operations", func(t *testing.T) {
		testClient.Truncate(t, File{}, Tag{})
		ctx := context.Background()
		fileClient := testClient.File()
		tagClient := testClient.Tag()

		err := NewTransaction(ctx, testClient.Client, func(txCtx context.Context) error {
			if err := fileClient.Create(txCtx, &File{
				ID:       9500,
				ParentID: 0,
				Name:     "tx-dir",
				Type:     FileTypeDirectory,
			}); err != nil {
				return err
			}
			return tagClient.Create(txCtx, &Tag{ID: 9500, Name: "tx-tag-multi"})
		})
		assert.NoError(t, err)

		files, err := fileClient.GetAll()
		require.NoError(t, err)
		foundFile := false
		for _, f := range files {
			if f.Name == "tx-dir" {
				foundFile = true
				break
			}
		}
		assert.True(t, foundFile, "file created in transaction should be committed")

		tags, err := tagClient.GetAll()
		require.NoError(t, err)
		foundTag := false
		for _, tag := range tags {
			if tag.Name == "tx-tag-multi" {
				foundTag = true
				break
			}
		}
		assert.True(t, foundTag, "tag created in transaction should be committed")

		testClient.Truncate(t, File{}, Tag{})
	})
}
