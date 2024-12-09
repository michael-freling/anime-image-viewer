package db

import "gorm.io/gorm"

type Tag struct {
	// gorm.Model
	ID        uint `gorm:"primarykey"`
	Name      string
	ParentID  uint
	CreatedAt uint
	UpdatedAt uint
}

type FileTag struct {
	TagID     uint `gorm:"primaryKey;autoIncrement:false"`
	FileID    uint `gorm:"primaryKey;autoIncrement:false"`
	CreatedAt uint `gorm:"autoCreateTime"`
}

type FileTagClient ORMClient[FileTag]

func NewFileTagClient(client *Client) *FileTagClient {
	return &FileTagClient{
		connection: client.connection,
	}
}

func WithFileTagTransaction(client *Client, f func(*FileTagClient) error) error {
	return client.connection.Transaction(func(tx *gorm.DB) error {
		return f(&FileTagClient{
			connection: tx,
		})
	})
}

func (client *FileTagClient) FindAllByFileID(fileIDs []uint) ([]FileTag, error) {
	var values []FileTag
	err := client.connection.Where(map[string]interface{}{
		"file_id": fileIDs,
	}).
		Find(&values).
		Error
	return values, err
}

func (client *FileTagClient) BatchCreate(values []FileTag) error {
	return client.connection.Create(values).Error
}

func (client *FileTagClient) DeleteByFileIDs(fileIDs []uint) error {
	return client.connection.Where("file_id IN ?", fileIDs).Delete(&FileTag{}).Error
}
