package db

type FileType string

const (
	RootDirectoryID = 0

	FileTypeDirectory FileType = "directory"
	FileTypeImage     FileType = "image"
)

type File struct {
	ID        uint
	Name      string `gorm:"unique,composite:name_parent_id"`
	ParentID  uint   `gorm:"unique,composite:name_parent_id"`
	Type      FileType
	CreatedAt uint
	UpdatedAt uint
}
