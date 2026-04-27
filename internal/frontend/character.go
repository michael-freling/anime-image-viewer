package frontend

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"github.com/michael-freling/anime-image-viewer/internal/db"
)

// CharacterInfo is a character exposed to the frontend.
type CharacterInfo struct {
	ID         uint   `json:"id"`
	Name       string `json:"name"`
	AnimeID    uint   `json:"animeId"`
	ImageCount uint   `json:"imageCount"`
}

// CharacterService is the Wails-bound service for character CRUD.
type CharacterService struct {
	dbClient *db.Client
}

func NewCharacterService(dbClient *db.Client) *CharacterService {
	return &CharacterService{
		dbClient: dbClient,
	}
}

// CreateCharacter creates a new character under the given anime.
func (s *CharacterService) CreateCharacter(ctx context.Context, name string, animeID uint) (CharacterInfo, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return CharacterInfo{}, fmt.Errorf("%w: character name must not be empty", ErrInvalidArgument)
	}

	character := db.Character{
		Name:    name,
		AnimeID: animeID,
	}
	if err := db.Create(s.dbClient, &character); err != nil {
		return CharacterInfo{}, fmt.Errorf("db.Create: %w", err)
	}

	return CharacterInfo{
		ID:      character.ID,
		Name:    character.Name,
		AnimeID: character.AnimeID,
	}, nil
}

// RenameCharacter updates the name of an existing character.
func (s *CharacterService) RenameCharacter(ctx context.Context, id uint, name string) (CharacterInfo, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return CharacterInfo{}, fmt.Errorf("%w: character name must not be empty", ErrInvalidArgument)
	}

	var updated db.Character
	err := db.NewTransaction(ctx, s.dbClient, func(ctx context.Context) error {
		charClient := s.dbClient.Character()
		var err error
		updated, err = charClient.FindByValue(ctx, &db.Character{
			ID: id,
		})
		if err != nil {
			return fmt.Errorf("CharacterClient.FindByValue: %w", err)
		}

		updated.Name = name
		if err := charClient.Update(ctx, &updated); err != nil {
			return fmt.Errorf("CharacterClient.Update: %w", err)
		}
		return nil
	})
	if err != nil {
		return CharacterInfo{}, err
	}

	return CharacterInfo{
		ID:      updated.ID,
		Name:    updated.Name,
		AnimeID: updated.AnimeID,
	}, nil
}

// DeleteCharacter deletes a character and all its file associations.
func (s *CharacterService) DeleteCharacter(ctx context.Context, id uint) error {
	return db.NewTransaction(ctx, s.dbClient, func(ctx context.Context) error {
		if err := s.dbClient.FileCharacter().DeleteByCharacterID(ctx, id); err != nil {
			return fmt.Errorf("FileCharacter.DeleteByCharacterID: %w", err)
		}
		if err := s.dbClient.Character().DeleteByID(ctx, id); err != nil {
			return fmt.Errorf("Character.DeleteByID: %w", err)
		}
		return nil
	})
}

// GetCharacterFileCount returns the number of files associated with the character.
func (s *CharacterService) GetCharacterFileCount(characterID uint) (uint, error) {
	fileCharacters, err := s.dbClient.FileCharacter().FindByCharacterIDs([]uint{characterID})
	if err != nil {
		return 0, fmt.Errorf("FileCharacter.FindByCharacterIDs: %w", err)
	}
	return uint(len(fileCharacters)), nil
}

// BatchUpdateCharactersForFiles adds and removes character associations for the
// given files. It mirrors TagFrontendService.BatchUpdateTagsForFiles.
func (s *CharacterService) BatchUpdateCharactersForFiles(ctx context.Context, fileIDs []uint, addedCharacterIDs []uint, deletedCharacterIDs []uint) error {
	// Look up existing associations so we can skip duplicates on insert.
	existing, err := s.dbClient.FileCharacter().FindByFileIDs(fileIDs)
	if err != nil {
		return fmt.Errorf("FileCharacter.FindByFileIDs: %w", err)
	}

	// Build a set of existing (characterID, fileID) pairs.
	type key struct {
		characterID uint
		fileID      uint
	}
	existingSet := make(map[key]struct{}, len(existing))
	for _, fc := range existing {
		existingSet[key{fc.CharacterID, fc.FileID}] = struct{}{}
	}

	// Prepare rows to insert.
	created := make([]db.FileCharacter, 0)
	for _, charID := range addedCharacterIDs {
		for _, fileID := range fileIDs {
			if _, ok := existingSet[key{charID, fileID}]; ok {
				continue
			}
			created = append(created, db.FileCharacter{
				CharacterID: charID,
				FileID:      fileID,
				AddedBy:     db.FileTagAddedByUser,
			})
		}
	}

	// Prepare rows to delete.
	deleted := make([]db.FileCharacter, 0)
	for _, charID := range deletedCharacterIDs {
		for _, fileID := range fileIDs {
			deleted = append(deleted, db.FileCharacter{
				CharacterID: charID,
				FileID:      fileID,
			})
		}
	}

	if len(created) == 0 && len(deleted) == 0 {
		return nil
	}

	return db.NewTransaction(ctx, s.dbClient, func(ctx context.Context) error {
		fcClient := s.dbClient.FileCharacter()
		if len(deleted) > 0 {
			if err := fcClient.BatchDelete(ctx, deleted); err != nil {
				return fmt.Errorf("FileCharacter.BatchDelete: %w", err)
			}
		}
		if len(created) > 0 {
			if err := fcClient.BatchCreate(ctx, created); err != nil {
				return fmt.Errorf("FileCharacter.BatchCreate: %w", err)
			}
		}
		return nil
	})
}

// GetImageCharacterIDs returns a map from image ID to the list of character IDs
// associated with that image. Used by the frontend for exclude-search filtering.
func (s *CharacterService) GetImageCharacterIDs(ctx context.Context, imageIDs []uint) (map[uint][]uint, error) {
	if len(imageIDs) == 0 {
		return nil, nil
	}
	fileCharacters, err := s.dbClient.FileCharacter().FindByFileIDs(imageIDs)
	if err != nil {
		return nil, fmt.Errorf("FileCharacter.FindByFileIDs: %w", err)
	}
	result := make(map[uint][]uint, len(imageIDs))
	for _, fc := range fileCharacters {
		result[fc.FileID] = append(result[fc.FileID], fc.CharacterID)
	}
	return result, nil
}

// ConvertTagToCharacter converts a tag (and its file associations) into a
// character under the given anime. The original tag and its FileTag rows are
// deleted within a single transaction.
func (s *CharacterService) ConvertTagToCharacter(ctx context.Context, tagID uint, animeID uint) (CharacterInfo, error) {
	var result CharacterInfo
	err := db.NewTransaction(ctx, s.dbClient, func(ctx context.Context) error {
		// 1. Look up the tag
		tagClient := s.dbClient.Tag()
		foundTag, err := tagClient.FindByValue(ctx, &db.Tag{ID: tagID})
		if err != nil {
			return fmt.Errorf("TagClient.FindByValue: %w", err)
		}

		// 2. Create a new character
		character := db.Character{
			Name:    foundTag.Name,
			AnimeID: animeID,
		}
		charClient := s.dbClient.Character()
		if err := charClient.Create(ctx, &character); err != nil {
			return fmt.Errorf("CharacterClient.Create: %w", err)
		}

		// 3. Find all FileTag rows for this tag
		fileTagClient := s.dbClient.FileTag()
		fileTags, err := fileTagClient.FindAllByTagIDs([]uint{tagID})
		if err != nil {
			return fmt.Errorf("FileTagClient.FindAllByTagIDs: %w", err)
		}

		// 4. Create FileCharacter rows for each FileTag
		if len(fileTags) > 0 {
			fileCharacters := make([]db.FileCharacter, 0, len(fileTags))
			for _, ft := range fileTags {
				fileCharacters = append(fileCharacters, db.FileCharacter{
					CharacterID: character.ID,
					FileID:      ft.FileID,
					AddedBy:     ft.AddedBy,
				})
			}
			fcClient := s.dbClient.FileCharacter()
			if err := fcClient.BatchCreate(ctx, fileCharacters); err != nil {
				return fmt.Errorf("FileCharacterClient.BatchCreate: %w", err)
			}
		}

		// 5. Delete FileTag rows for this tag
		if err := fileTagClient.DeleteByTagIDs(ctx, []uint{tagID}); err != nil {
			return fmt.Errorf("FileTagClient.DeleteByTagIDs: %w", err)
		}

		// 6. Delete the tag
		if err := tagClient.DeleteByID(ctx, tagID); err != nil {
			return fmt.Errorf("TagClient.DeleteByID: %w", err)
		}

		result = CharacterInfo{
			ID:      character.ID,
			Name:    character.Name,
			AnimeID: character.AnimeID,
		}
		return nil
	})
	if err != nil {
		return CharacterInfo{}, err
	}
	return result, nil
}

// ConvertCharacterToTag converts a character (and its file associations) into
// a tag with category "uncategorized". The original character and its
// FileCharacter rows are deleted within a single transaction.
func (s *CharacterService) ConvertCharacterToTag(ctx context.Context, characterID uint) (Tag, error) {
	var result Tag
	err := db.NewTransaction(ctx, s.dbClient, func(ctx context.Context) error {
		// 1. Look up the character
		charClient := s.dbClient.Character()
		character, err := charClient.FindByValue(ctx, &db.Character{ID: characterID})
		if err != nil {
			return fmt.Errorf("CharacterClient.FindByValue: %w", err)
		}

		// 2. Create a new tag
		tagClient := s.dbClient.Tag()
		newTag := db.Tag{
			Name:     character.Name,
			Category: "uncategorized",
			AnimeID:  &character.AnimeID,
		}
		if err := tagClient.Create(ctx, &newTag); err != nil {
			return fmt.Errorf("TagClient.Create: %w", err)
		}

		// 3. Find all FileCharacter rows for this character
		fcClient := s.dbClient.FileCharacter()
		fileCharacters, err := fcClient.FindByCharacterIDs([]uint{characterID})
		if err != nil {
			return fmt.Errorf("FileCharacterClient.FindByCharacterIDs: %w", err)
		}

		// 4. Create FileTag rows for each FileCharacter
		if len(fileCharacters) > 0 {
			fileTags := make([]db.FileTag, 0, len(fileCharacters))
			for _, fc := range fileCharacters {
				fileTags = append(fileTags, db.FileTag{
					TagID:   newTag.ID,
					FileID:  fc.FileID,
					AddedBy: fc.AddedBy,
				})
			}
			fileTagClient := s.dbClient.FileTag()
			if err := fileTagClient.BatchCreate(ctx, fileTags); err != nil {
				return fmt.Errorf("FileTagClient.BatchCreate: %w", err)
			}
		}

		// 5. Delete FileCharacter rows
		if err := fcClient.DeleteByCharacterID(ctx, characterID); err != nil {
			return fmt.Errorf("FileCharacterClient.DeleteByCharacterID: %w", err)
		}

		// 6. Delete the character
		if err := charClient.DeleteByID(ctx, characterID); err != nil {
			return fmt.Errorf("CharacterClient.DeleteByID: %w", err)
		}

		result = Tag{
			ID:       newTag.ID,
			Name:     newTag.Name,
			Category: newTag.Category,
		}
		return nil
	})
	if err != nil {
		return Tag{}, err
	}
	return result, nil
}

// ReadCharactersByAnimeID reads all characters for an anime, sorted by name.
// ImageCount is set to 0; the detail page computes counts separately.
func (s *CharacterService) ReadCharactersByAnimeID(ctx context.Context, animeID uint) ([]CharacterInfo, error) {
	characters, err := s.dbClient.Character().FindByAnimeID(animeID)
	if err != nil {
		return nil, fmt.Errorf("Character.FindByAnimeID: %w", err)
	}
	result := make([]CharacterInfo, len(characters))
	for i, c := range characters {
		result[i] = CharacterInfo{
			ID:      c.ID,
			Name:    c.Name,
			AnimeID: c.AnimeID,
		}
	}
	sort.SliceStable(result, func(i, j int) bool {
		return strings.ToLower(result[i].Name) < strings.ToLower(result[j].Name)
	})
	return result, nil
}
