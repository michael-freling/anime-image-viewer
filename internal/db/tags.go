package db

type Tag struct {
	// gorm.Model
	ID        uint `gorm:"primarykey"`
	Name      string
	ParentID  uint
	CreatedAt uint
	UpdatedAt uint
}
