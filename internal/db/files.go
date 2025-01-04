package db

type FileType string

const (
	RootDirectoryID = 0

	FileTypeDirectory FileType = "directory"
	FileTypeImage     FileType = "image"
)

type File struct {
	ID       uint
	ParentID uint   `gorm:"uniqueIndex:parent_id_name,index:parent_id_created_at"`
	Name     string `gorm:"uniqueIndex:parent_id_name"`
	Type     FileType

	// ImageCreatedAt is a creation timestamp of an image file
	// when an image is imported, a timestamp is copied from the source image file
	ImageCreatedAt uint `gorm:"index:parent_id_image_created_at"`

	// CreatedAt is a timestamp of the record creation
	CreatedAt uint `gorm:"autoCreateTime,index:parent_id_created_at"`
	UpdatedAt uint
}

type FileClient struct {
	*ORMClient[File]
}

func (client *Client) File() *FileClient {
	return &FileClient{
		ORMClient: &ORMClient[File]{
			connection: client.connection,
		},
	}
}

func (client *FileClient) FindImageFilesByParentID(parentID uint) ([]File, error) {
	var images []File
	err := client.connection.
		Order("image_created_at desc").
		Find(&images, File{
			ParentID: parentID,
			Type:     FileTypeImage,
		}).
		Error
	return images, err
}

func (client *FileClient) FindImageFilesByParentIDs(parentIDs []uint) ([]File, error) {
	var images []File
	err := client.connection.
		Order("image_created_at desc").
		Where("parent_id IN ?", parentIDs).
		Where("type = ?", FileTypeImage).
		Find(&images).
		Error
	return images, err
}

func (client *FileClient) FindImageFilesByIDs(ids []uint) ([]File, error) {
	var images []File
	err := client.connection.
		Order("image_created_at desc").
		Where("id IN ?", ids).
		Where("type = ?", FileTypeImage).
		Find(&images).
		Error
	return images, err
}

func (client *FileClient) FindDirectoriesByIDs(ids []uint) ([]File, error) {
	var images []File
	err := client.connection.
		Order("created_at desc").
		Where("id IN ?", ids).
		Where("type = ?", FileTypeDirectory).
		Find(&images).
		Error
	return images, err
}
