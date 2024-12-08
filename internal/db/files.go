package db

type FileType string

const (
	RootDirectoryID = 0

	FileTypeDirectory FileType = "directory"
	FileTypeImage     FileType = "image"
)

type File struct {
	ID        uint
	ParentID  uint   `gorm:"uniqueIndex:parent_id_name,index:parent_id_created_at"`
	Name      string `gorm:"uniqueIndex:parent_id_name"`
	Type      FileType
	CreatedAt uint `gorm:"autoCreateTime,index:parent_id_created_at"`
	UpdatedAt uint
}

type FileClient ORMClient[File]

func NewFileClient(client *Client) *FileClient {
	return &FileClient{
		connection: client.connection,
	}
}

func (client *FileClient) FindImageFilesByParentID(parentID uint) ([]File, error) {
	var images []File
	err := client.connection.
		Order("created_at asc").
		Find(&images, File{
			ParentID: parentID,
			Type:     FileTypeImage,
		}).
		Error
	return images, err
}
