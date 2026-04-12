package db

import (
	"context"
)

// Anime is the top-level container that groups Folders (1:1). Tags are derived
// from the images in its folder tree. The name has a UNIQUE constraint at the
// DB level so that no two anime can share the same name.
type Anime struct {
	ID        uint   `gorm:"primarykey"`
	Name      string `gorm:"uniqueIndex"`
	AniListID *int   `gorm:"index"`
	CreatedAt uint   `gorm:"autoCreateTime"`
	UpdatedAt uint   `gorm:"autoUpdateTime"`
}

type AnimeList []Anime

type AnimeClient struct {
	*ORMClient[Anime]
}

func (client *Client) Anime() *AnimeClient {
	return &AnimeClient{
		ORMClient: &ORMClient[Anime]{
			connection: client.connection,
		},
	}
}

func (client AnimeClient) FindAllByIDs(ids []uint) (AnimeList, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	var values []Anime
	err := client.connection.Where("id IN ?", ids).
		Find(&values).
		Error
	return values, err
}

func (client AnimeClient) FindByName(ctx context.Context, name string) (Anime, error) {
	var value Anime
	err := client.getTransaction(ctx).
		Where(&Anime{Name: name}).
		Take(&value).
		Error
	return value, err
}

