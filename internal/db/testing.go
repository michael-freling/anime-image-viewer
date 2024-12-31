package db

import (
	"errors"
	"testing"

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
}

func NewTestClient(t *testing.T) TestClient {
	client, err := NewClient(DSNMemory, WithNopLogger())
	require.NoError(t, err)
	t.Cleanup(func() {
		require.NoError(t, client.Close())
	})
	client.Migrate()

	return TestClient{
		client,
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

func (client *TestClient) Truncate(t *testing.T, models ...interface{}) {
	for _, model := range models {
		err := client.Client.connection.Session(&gorm.Session{
			AllowGlobalUpdate: true,
		}).Delete(&model).Error
		require.NoError(t, err)
	}
}
