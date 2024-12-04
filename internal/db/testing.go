package db

import (
	"gorm.io/gorm"
)

func (client *Client) Truncate(models ...interface{}) error {
	for _, model := range models {
		client.connection.Session(&gorm.Session{
			AllowGlobalUpdate: true,
		}).Delete(&model)
	}
	return nil
}
