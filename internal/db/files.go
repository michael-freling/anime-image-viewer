package db

type FileType string

const (
	RootDirectoryID = 0

	FileTypeDirectory FileType = "directory"
	FileTypeImage     FileType = "image"
)

type File struct {
	ID        uint
	ParentID  uint   `gorm:"unique,composite:parent_id_name"`
	Name      string `gorm:"unique,composite:parent_id_name"`
	Type      FileType
	CreatedAt uint
	UpdatedAt uint
}
