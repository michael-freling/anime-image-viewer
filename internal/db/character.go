package db

import (
	"context"
)

type Character struct {
	ID        uint   `gorm:"primarykey"`
	Name      string `gorm:"not null"`
	AnimeID   uint   `gorm:"index;not null"`
	CreatedAt uint
	UpdatedAt uint
}

type CharacterClient struct {
	*ORMClient[Character]
}

func (client *Client) Character() *CharacterClient {
	return &CharacterClient{
		ORMClient: &ORMClient[Character]{
			connection: client.connection,
		},
	}
}

func (client CharacterClient) FindByAnimeID(animeID uint) ([]Character, error) {
	var values []Character
	err := client.connection.Where("anime_id = ?", animeID).
		Find(&values).
		Error
	return values, err
}

func (client CharacterClient) FindByIDs(ids []uint) ([]Character, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	var values []Character
	err := client.connection.Where("id IN ?", ids).
		Find(&values).
		Error
	return values, err
}

func (client CharacterClient) DeleteByID(ctx context.Context, id uint) error {
	return client.getTransaction(ctx).
		Delete(&Character{}, id).
		Error
}

func (client CharacterClient) DeleteByAnimeID(ctx context.Context, animeID uint) error {
	return client.getTransaction(ctx).
		Where("anime_id = ?", animeID).
		Delete(&Character{}).
		Error
}

type FileCharacter struct {
	CharacterID uint           `gorm:"primaryKey;autoIncrement:false"`
	FileID      uint           `gorm:"primaryKey;autoIncrement:false"`
	AddedBy     FileTagAddedBy // reuse the same enum from tags.go
	CreatedAt   uint           `gorm:"autoCreateTime"`
}

type FileCharacterClient struct {
	*ORMClient[FileCharacter]
}

func newFileCharacterClient(client *Client) *FileCharacterClient {
	return &FileCharacterClient{
		&ORMClient[FileCharacter]{
			connection: client.connection,
		},
	}
}

func (client *Client) FileCharacter() *FileCharacterClient {
	return newFileCharacterClient(client)
}

func (client *FileCharacterClient) FindByFileIDs(fileIDs []uint) ([]FileCharacter, error) {
	var values []FileCharacter
	err := client.connection.Where(map[string]any{
		"file_id": fileIDs,
	}).
		Find(&values).
		Error
	return values, err
}

func (client *FileCharacterClient) FindByCharacterIDs(characterIDs []uint) ([]FileCharacter, error) {
	var values []FileCharacter
	err := client.connection.Where("character_id IN ?", characterIDs).
		Find(&values).
		Error
	return values, err
}

func (client *FileCharacterClient) DeleteByCharacterID(ctx context.Context, characterID uint) error {
	return client.getTransaction(ctx).
		Where("character_id = ?", characterID).
		Delete(&FileCharacter{}).
		Error
}

func (client *FileCharacterClient) DeleteByFileIDs(ctx context.Context, fileIDs []uint) error {
	if len(fileIDs) == 0 {
		return nil
	}
	return client.getTransaction(ctx).
		Where("file_id IN ?", fileIDs).
		Delete(&FileCharacter{}).
		Error
}
