package db

import (
	"errors"

	"gorm.io/gorm"
)

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
