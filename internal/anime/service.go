package anime

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/michael-freling/anime-image-viewer/internal/image"
	"github.com/michael-freling/anime-image-viewer/internal/xerrors"
)

// Service exposes anime CRUD plus tag and folder assignment logic. It is the
// core anime business layer; the frontend.AnimeService is a thin Wails
// adapter on top of it.
type Service struct {
	dbClient        *db.Client
	directoryReader *image.DirectoryReader
}

func NewService(dbClient *db.Client, directoryReader *image.DirectoryReader) *Service {
	return &Service{
		dbClient:        dbClient,
		directoryReader: directoryReader,
	}
}

// Create inserts a new anime row. The name is required and must be unique;
// duplicate names return ErrAnimeAlreadyExists.
func (s *Service) Create(ctx context.Context, name string) (Anime, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return Anime{}, fmt.Errorf("%w: name is required", xerrors.ErrInvalidArgument)
	}

	row := db.Anime{Name: name}
	err := s.dbClient.Anime().Create(ctx, &row)
	if isUniqueViolation(err) {
		return Anime{}, fmt.Errorf("%w: %s", ErrAnimeAlreadyExists, name)
	}
	return Anime{ID: row.ID, Name: row.Name}, err
}

// Rename updates the name of an existing anime. Returns ErrAnimeNotFound if no
// such id exists, ErrAnimeAlreadyExists if the new name collides with another
// anime, and ErrInvalidArgument for an empty name.
func (s *Service) Rename(ctx context.Context, id uint, name string) (Anime, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return Anime{}, fmt.Errorf("%w: name is required", xerrors.ErrInvalidArgument)
	}

	var updated db.Anime
	err := db.NewTransaction(ctx, s.dbClient, func(ctx context.Context) error {
		client := s.dbClient.Anime()
		row, err := client.FindByValue(ctx, &db.Anime{ID: id})
		if errors.Is(err, db.ErrRecordNotFound) {
			return fmt.Errorf("%w: id %d", ErrAnimeNotFound, id)
		}
		if err != nil {
			return err
		}
		row.Name = name
		if err := client.Update(ctx, &row); err != nil {
			if isUniqueViolation(err) {
				return fmt.Errorf("%w: %s", ErrAnimeAlreadyExists, name)
			}
			return err
		}
		updated = row
		return nil
	})
	return Anime{ID: updated.ID, Name: updated.Name}, err
}

// Delete removes an anime, clears anime_id on associated folders, and removes
// rows in anime_tag for the anime. Tags and folders themselves are not
// deleted (no cascade).
func (s *Service) Delete(ctx context.Context, id uint) error {
	return db.NewTransaction(ctx, s.dbClient, func(ctx context.Context) error {
		// verify exists for a clean error
		_, err := s.dbClient.Anime().FindByValue(ctx, &db.Anime{ID: id})
		if errors.Is(err, db.ErrRecordNotFound) {
			return fmt.Errorf("%w: id %d", ErrAnimeNotFound, id)
		}
		if err != nil {
			return err
		}
		if err := s.dbClient.File().ClearAnimeIDByAnimeID(ctx, id); err != nil {
			return err
		}
		if err := s.dbClient.AnimeTag().DeleteByAnimeID(ctx, id); err != nil {
			return err
		}
		return s.dbClient.Anime().BatchDelete(ctx, []db.Anime{{ID: id}})
	})
}

// ReadAll returns every anime row.
func (s *Service) ReadAll(ctx context.Context) ([]Anime, error) {
	rows, err := db.GetAll[db.Anime](s.dbClient)
	if err != nil || len(rows) == 0 {
		return nil, err
	}
	result := make([]Anime, len(rows))
	for i, row := range rows {
		result[i] = Anime{ID: row.ID, Name: row.Name}
	}
	return result, nil
}

// Read returns a single anime by id.
func (s *Service) Read(ctx context.Context, id uint) (Anime, error) {
	row, err := s.dbClient.Anime().FindByValue(ctx, &db.Anime{ID: id})
	if errors.Is(err, db.ErrRecordNotFound) {
		return Anime{}, fmt.Errorf("%w: id %d", ErrAnimeNotFound, id)
	}
	return Anime{ID: row.ID, Name: row.Name}, err
}

// AssignTag adds a tag to an anime. If the association already exists this is
// a no-op.
func (s *Service) AssignTag(ctx context.Context, animeID, tagID uint) error {
	if animeID == 0 || tagID == 0 {
		return fmt.Errorf("%w: animeID and tagID required", xerrors.ErrInvalidArgument)
	}
	return db.NewTransaction(ctx, s.dbClient, func(ctx context.Context) error {
		_, err := s.dbClient.Anime().FindByValue(ctx, &db.Anime{ID: animeID})
		if errors.Is(err, db.ErrRecordNotFound) {
			return fmt.Errorf("%w: id %d", ErrAnimeNotFound, animeID)
		}
		if err != nil {
			return err
		}
		_, err = s.dbClient.Tag().FindByValue(ctx, &db.Tag{ID: tagID})
		if errors.Is(err, db.ErrRecordNotFound) {
			return fmt.Errorf("%w: tag id %d", xerrors.ErrInvalidArgument, tagID)
		}
		if err != nil {
			return err
		}
		// already assigned?
		existing, err := s.dbClient.AnimeTag().FindAllByAnimeIDs([]uint{animeID})
		if err != nil {
			return err
		}
		for _, at := range existing {
			if at.TagID == tagID {
				return nil
			}
		}
		row := db.AnimeTag{AnimeID: animeID, TagID: tagID}
		return s.dbClient.AnimeTag().Create(ctx, &row)
	})
}

// UnassignTag removes a tag from an anime.
func (s *Service) UnassignTag(ctx context.Context, animeID, tagID uint) error {
	if animeID == 0 || tagID == 0 {
		return fmt.Errorf("%w: animeID and tagID required", xerrors.ErrInvalidArgument)
	}
	return s.dbClient.AnimeTag().DeleteByAnimeAndTag(ctx, animeID, tagID)
}

// AssignFolder marks a folder as the explicitly-assigned root of the anime.
// Fails with ErrAnimeAncestorAssigned if any ancestor of the folder already
// has a non-NULL anime_id.
func (s *Service) AssignFolder(ctx context.Context, animeID, folderID uint) error {
	if animeID == 0 || folderID == 0 {
		return fmt.Errorf("%w: animeID and folderID required", xerrors.ErrInvalidArgument)
	}
	_, err := s.dbClient.Anime().FindByValue(ctx, &db.Anime{ID: animeID})
	if errors.Is(err, db.ErrRecordNotFound) {
		return fmt.Errorf("%w: id %d", ErrAnimeNotFound, animeID)
	}
	if err != nil {
		return err
	}

	// Verify folder exists and is a directory
	row, err := s.dbClient.File().FindByValue(ctx, &db.File{ID: folderID})
	if errors.Is(err, db.ErrRecordNotFound) {
		return fmt.Errorf("%w: folder id %d", image.ErrDirectoryNotFound, folderID)
	}
	if err != nil {
		return err
	}
	if row.Type != db.FileTypeDirectory {
		return fmt.Errorf("%w: file id %d is not a directory", xerrors.ErrInvalidArgument, folderID)
	}

	// Walk up ancestors to detect a conflict
	ancestorAnime, err := s.findAncestorAnimeID(folderID)
	if err != nil {
		return err
	}
	if ancestorAnime != nil {
		return ErrAnimeAncestorAssigned
	}

	id := animeID
	return s.dbClient.File().SetAnimeID(ctx, folderID, &id)
}

// UnassignFolder clears anime_id on the given folder. The folder must
// currently have a stored value (descendants without their own value cannot
// be unassigned).
func (s *Service) UnassignFolder(ctx context.Context, folderID uint) error {
	if folderID == 0 {
		return fmt.Errorf("%w: folderID required", xerrors.ErrInvalidArgument)
	}
	row, err := s.dbClient.File().FindByValue(ctx, &db.File{ID: folderID})
	if errors.Is(err, db.ErrRecordNotFound) {
		return fmt.Errorf("%w: folder id %d", image.ErrDirectoryNotFound, folderID)
	}
	if err != nil {
		return err
	}
	if row.AnimeID == nil {
		return nil
	}
	return s.dbClient.File().SetAnimeID(ctx, folderID, nil)
}

// findAncestorAnimeID walks up the folder hierarchy of the given folder
// (excluding the folder itself) and returns the first non-nil anime_id it
// finds. Returns nil if none of the ancestors are assigned.
func (s *Service) findAncestorAnimeID(folderID uint) (*uint, error) {
	current := folderID
	for current != db.RootDirectoryID {
		row, err := db.FindByValue(s.dbClient, db.File{ID: current})
		if errors.Is(err, db.ErrRecordNotFound) {
			return nil, nil
		}
		if err != nil {
			return nil, err
		}
		if current != folderID && row.AnimeID != nil {
			id := *row.AnimeID
			return &id, nil
		}
		current = row.ParentID
	}
	return nil, nil
}

// FolderAnimeAssignment is the resolved (folder id -> anime id) mapping where
// the anime id is either stored on the folder itself or inherited from the
// nearest ancestor.
type FolderAnimeAssignment struct {
	FolderID uint
	AnimeID  uint
	// Stored is true if the anime id was set on this folder directly,
	// false if it was inherited from an ancestor.
	Stored bool
}

// ResolveFolderAnimeMap returns a map from every directory id (in the entire
// tree) to its resolved anime id (if any). The map only contains entries for
// folders that are assigned, either directly or by inheritance.
func (s *Service) ResolveFolderAnimeMap() (map[uint]FolderAnimeAssignment, error) {
	storedMap, err := s.readStoredAnimeAssignments()
	if err != nil {
		return nil, err
	}
	tree, err := s.directoryReader.ReadDirectoryTree()
	if err != nil {
		return nil, err
	}
	result := make(map[uint]FolderAnimeAssignment)
	walkDirectoryTree(&tree, 0, storedMap, result)
	return result, nil
}

func (s *Service) readStoredAnimeAssignments() (map[uint]uint, error) {
	dirs, err := s.dbClient.File().FindDirectoriesWithAnyAnime()
	if err != nil {
		return nil, err
	}
	result := make(map[uint]uint, len(dirs))
	for _, dir := range dirs {
		if dir.AnimeID != nil {
			result[dir.ID] = *dir.AnimeID
		}
	}
	return result, nil
}

func walkDirectoryTree(
	dir *image.Directory,
	inherited uint,
	stored map[uint]uint,
	out map[uint]FolderAnimeAssignment,
) {
	currentAnime := inherited
	currentStored := false
	if stored != nil {
		if id, ok := stored[dir.ID]; ok && dir.ID != db.RootDirectoryID {
			currentAnime = id
			currentStored = true
		}
	}
	if currentAnime != 0 && dir.ID != db.RootDirectoryID {
		out[dir.ID] = FolderAnimeAssignment{
			FolderID: dir.ID,
			AnimeID:  currentAnime,
			Stored:   currentStored,
		}
	}
	for _, child := range dir.Children {
		walkDirectoryTree(child, currentAnime, stored, out)
	}
}

// CountImagesForAnimeFolders walks the directory tree and returns the total
// number of image files contained in every folder mapped to the anime
// (including descendants).
func (s *Service) CountImagesForAnimeFolders() (map[uint]uint, error) {
	stored, err := s.readStoredAnimeAssignments()
	if err != nil {
		return nil, err
	}
	tree, err := s.directoryReader.ReadDirectoryTree()
	if err != nil {
		return nil, err
	}
	imageCounts := make(map[uint]uint)
	collectImageCounts(&tree, 0, stored, imageCounts)
	return imageCounts, nil
}

func collectImageCounts(
	dir *image.Directory,
	inherited uint,
	stored map[uint]uint,
	out map[uint]uint,
) {
	currentAnime := inherited
	if stored != nil {
		if id, ok := stored[dir.ID]; ok && dir.ID != db.RootDirectoryID {
			currentAnime = id
		}
	}
	if currentAnime != 0 {
		out[currentAnime] += uint(len(dir.ChildImageFiles))
	}
	for _, child := range dir.Children {
		collectImageCounts(child, currentAnime, stored, out)
	}
}

func isUniqueViolation(err error) bool {
	if err == nil {
		return false
	}
	return strings.Contains(err.Error(), "UNIQUE constraint failed")
}
