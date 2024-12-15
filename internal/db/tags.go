package db

import "gorm.io/gorm"

type TagType string

const (
	TagTypeSeries TagType = "series"
	TagTypeSeason TagType = "seasons"
)

type Tag struct {
	// gorm.Model
	ID        uint `gorm:"primarykey"`
	Name      string
	ParentID  uint
	Type      TagType
	CreatedAt uint
	UpdatedAt uint
}

type TagList []Tag

type TagClient ORMClient[Tag]

func (client *Client) Tag() *TagClient {
	return &TagClient{
		connection: client.connection,
	}
}

func (client TagClient) FindAllByTagIDs(tagIDs []uint) (TagList, error) {
	var values []Tag
	err := client.connection.Where("id", tagIDs).
		Find(&values).
		Error
	return values, err
}

type FileTag struct {
	TagID     uint `gorm:"primaryKey;autoIncrement:false"`
	FileID    uint `gorm:"primaryKey;autoIncrement:false"`
	CreatedAt uint `gorm:"autoCreateTime"`
}

type FileTagClient ORMClient[FileTag]

func newFileTagClient(client *Client) *FileTagClient {
	return &FileTagClient{
		connection: client.connection,
	}
}

func (client Client) FileTag() *FileTagClient {
	return newFileTagClient(&client)
}

func (client FileTagClient) WithTransaction(f func(*FileTagClient) error) error {
	return client.connection.Transaction(func(tx *gorm.DB) error {
		return f(&FileTagClient{
			connection: tx,
		})
	})
}

type FileTagList []FileTag

func (tags FileTagList) ToFileIDs() []uint {
	result := make([]uint, 0)
	added := make(map[uint]struct{})
	for _, tag := range tags {
		if _, ok := added[tag.FileID]; ok {
			continue
		}
		added[tag.FileID] = struct{}{}
		result = append(result, tag.FileID)
	}
	return result
}

// ToTagMap returns a map from a tag ID to a file ID to a tag
func (tags FileTagList) ToTagMap() map[uint]map[uint]FileTag {
	result := make(map[uint]map[uint]FileTag, len(tags))
	for _, tag := range tags {
		if _, ok := result[tag.TagID]; !ok {
			result[tag.TagID] = make(map[uint]FileTag)
		}
		result[tag.TagID][tag.FileID] = tag
	}
	return result
}

// ToFileMap returns a map from a file ID to tags
func (tags FileTagList) ToFileMap() map[uint]map[uint]FileTag {
	result := make(map[uint]map[uint]FileTag, len(tags))
	for _, tag := range tags {
		if _, ok := result[tag.FileID]; !ok {
			result[tag.FileID] = make(map[uint]FileTag)
		}
		result[tag.FileID][tag.TagID] = tag
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

func (client *FileTagClient) FindAllByTagIDs(tagIDs []uint) (FileTagList, error) {
	var values []FileTag
	err := client.connection.Where("tag_id", tagIDs).
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
