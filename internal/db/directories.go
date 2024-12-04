package db

type Directory struct {
	ID        uint
	Name      string `gorm:"unique,composite:name_parent_id"`
	ParentID  uint   `gorm:"unique,composite:name_parent_id"`
	CreatedAt uint
	UpdatedAt uint
}

const (
	RootDirectoryID = 0
)
