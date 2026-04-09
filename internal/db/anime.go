package db

import (
	"context"
)

// Anime is the top-level container that groups Tags (m2m) and Folders (1:1).
// In v1 the only metadata stored is the name. The name has a UNIQUE constraint
// at the DB level so that no two anime can share the same name.
type Anime struct {
	ID        uint   `gorm:"primarykey"`
	Name      string `gorm:"uniqueIndex"`
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

// AnimeTag is the join table between Anime and Tag (m2m). A tag can belong to
// zero, one, or many anime.
type AnimeTag struct {
	AnimeID   uint `gorm:"primaryKey;autoIncrement:false"`
	TagID     uint `gorm:"primaryKey;autoIncrement:false"`
	CreatedAt uint `gorm:"autoCreateTime"`
}

type AnimeTagList []AnimeTag

type AnimeTagClient struct {
	*ORMClient[AnimeTag]
}

func (client *Client) AnimeTag() *AnimeTagClient {
	return &AnimeTagClient{
		ORMClient: &ORMClient[AnimeTag]{
			connection: client.connection,
		},
	}
}

func (client *AnimeTagClient) FindAllByAnimeIDs(animeIDs []uint) (AnimeTagList, error) {
	if len(animeIDs) == 0 {
		return nil, nil
	}
	var values []AnimeTag
	err := client.connection.Where("anime_id IN ?", animeIDs).
		Find(&values).
		Error
	return values, err
}

func (client *AnimeTagClient) FindAllByTagIDs(tagIDs []uint) (AnimeTagList, error) {
	if len(tagIDs) == 0 {
		return nil, nil
	}
	var values []AnimeTag
	err := client.connection.Where("tag_id IN ?", tagIDs).
		Find(&values).
		Error
	return values, err
}

func (client *AnimeTagClient) DeleteByAnimeID(ctx context.Context, animeID uint) error {
	return client.getTransaction(ctx).
		Where("anime_id = ?", animeID).
		Delete(&AnimeTag{}).Error
}

func (client *AnimeTagClient) DeleteByAnimeAndTag(ctx context.Context, animeID, tagID uint) error {
	return client.getTransaction(ctx).
		Where("anime_id = ? AND tag_id = ?", animeID, tagID).
		Delete(&AnimeTag{}).Error
}

// ToAnimeMap returns a map from an anime ID to a list of its associated tag IDs.
func (list AnimeTagList) ToAnimeMap() map[uint][]uint {
	result := make(map[uint][]uint, 0)
	for _, at := range list {
		result[at.AnimeID] = append(result[at.AnimeID], at.TagID)
	}
	return result
}

// ToTagMap returns a map from a tag ID to a list of anime IDs that include the tag.
func (list AnimeTagList) ToTagMap() map[uint][]uint {
	result := make(map[uint][]uint, 0)
	for _, at := range list {
		result[at.TagID] = append(result[at.TagID], at.AnimeID)
	}
	return result
}
