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

func (client Client) FileTagClient() *FileTagClient {
	return NewFileTagClient(&client)
}

func (client FileTagClient) WithTransaction(f func(*FileTagClient) error) error {
	return client.connection.Transaction(func(tx *gorm.DB) error {
		return f(&FileTagClient{
			connection: tx,
		})
	})
}

type FileTagList []FileTag

func (tags FileTagList) ToMap() map[uint]map[uint]FileTag {
	result := make(map[uint]map[uint]FileTag, len(tags))
	for _, tag := range tags {
		if _, ok := result[tag.TagID]; !ok {
			result[tag.TagID] = make(map[uint]FileTag)
		}
		result[tag.TagID][tag.FileID] = tag
	}
	return result
}

func (client *FileTagClient) FindAllByFileID(fileIDs []uint) (FileTagList, error) {
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

func (client *FileTagClient) BatchDelete(tagIDs []uint, fileIDs []uint) error {
	fileTags := make([]FileTag, 0, len(tagIDs)*len(fileIDs))
	for _, tagID := range tagIDs {
		for _, fileID := range fileIDs {
			fileTags = append(fileTags, FileTag{
				TagID:  tagID,
				FileID: fileID,
			})
		}
	}

	return client.connection.Delete(fileTags).Error
}
