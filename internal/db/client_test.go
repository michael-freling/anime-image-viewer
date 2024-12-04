package db

import (
	"testing"

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

func TestORMClient_FindByValue(t *testing.T) {
	dbClient, err := NewClient(DSNMemory, WithNopLogger())
	require.NoError(t, err)
	dbClient.connection.AutoMigrate(&Table{})

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
			got, gotErr := ormClient.FindByID(&Table{
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
	dbClient, err := NewClient(DSNMemory, WithNopLogger())
	require.NoError(t, err)
	dbClient.connection.AutoMigrate(&Table{})

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
