package db

import "context"

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

	// AnimeID, when non-nil, marks this folder as the explicitly-assigned root
	// of an anime. Descendants inherit by walking up the parent chain at read
	// time (no propagation on write).
	AnimeID *uint `gorm:"index"`

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

// FindDirectoriesByAnimeID returns all directory rows whose AnimeID equals
// the provided id. Used to look up explicitly-assigned anime root folders.
func (client *FileClient) FindDirectoriesByAnimeID(animeID uint) ([]File, error) {
	var dirs []File
	err := client.connection.
		Where("type = ?", FileTypeDirectory).
		Where("anime_id = ?", animeID).
		Find(&dirs).
		Error
	return dirs, err
}

// FindDirectoriesWithAnyAnime returns all directories that have a non-NULL
// anime_id. Used by the anime list page to map all assignments at once.
func (client *FileClient) FindDirectoriesWithAnyAnime() ([]File, error) {
	var dirs []File
	err := client.connection.
		Where("type = ?", FileTypeDirectory).
		Where("anime_id IS NOT NULL").
		Find(&dirs).
		Error
	return dirs, err
}

// ClearAnimeIDByAnimeID sets AnimeID to NULL on all directories whose AnimeID
// equals the provided id. Used when an anime is deleted (no cascade).
func (client *FileClient) ClearAnimeIDByAnimeID(ctx context.Context, animeID uint) error {
	return client.getTransaction(ctx).
		Model(&File{}).
		Where("type = ? AND anime_id = ?", FileTypeDirectory, animeID).
		Update("anime_id", nil).
		Error
}

// FindFilesByParentIDs returns all files whose parent_id is in the given list.
func (client *FileClient) FindFilesByParentIDs(parentIDs []uint) ([]File, error) {
	if len(parentIDs) == 0 {
		return nil, nil
	}
	var files []File
	err := client.connection.
		Where("parent_id IN ?", parentIDs).
		Find(&files).
		Error
	return files, err
}

// DeleteByIDs deletes all file rows whose id is in the given list.
func (client *FileClient) DeleteByIDs(ctx context.Context, ids []uint) error {
	if len(ids) == 0 {
		return nil
	}
	return client.getTransaction(ctx).
		Where("id IN ?", ids).
		Delete(&File{}).
		Error
}

// SetAnimeID writes a new (possibly nil) anime_id value for a directory by id.
func (client *FileClient) SetAnimeID(ctx context.Context, fileID uint, animeID *uint) error {
	return client.getTransaction(ctx).
		Model(&File{}).
		Where("id = ?", fileID).
		Update("anime_id", animeID).
		Error
}
