package anime

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/michael-freling/anime-image-viewer/internal/config"
	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/michael-freling/anime-image-viewer/internal/image"
	"github.com/michael-freling/anime-image-viewer/internal/xerrors"
)

var invalidFolderChars = regexp.MustCompile(`[<>:"/\\|?*\x00-\x1f]`)

func validateFolderName(name string) error {
	if name == "" {
		return fmt.Errorf("name cannot be empty")
	}
	if invalidFolderChars.MatchString(name) {
		return fmt.Errorf("name contains invalid characters")
	}
	if name == "." || name == ".." {
		return fmt.Errorf("name cannot be . or ..")
	}
	return nil
}

// Service exposes anime CRUD plus tag and folder assignment logic. It is the
// core anime business layer; the frontend.AnimeService is a thin Wails
// adapter on top of it.
type Service struct {
	dbClient        *db.Client
	directoryReader *image.DirectoryReader
	config          config.Config
}

func NewService(dbClient *db.Client, directoryReader *image.DirectoryReader, cfg config.Config) *Service {
	return &Service{
		dbClient:        dbClient,
		directoryReader: directoryReader,
		config:          cfg,
	}
}

// Create inserts a new anime row, creates a folder on disk at
// <ImageRootDirectory>/<name>/, and creates a db.File record for the folder
// with anime_id set. The name is required and must be unique; duplicate names
// return ErrAnimeAlreadyExists.
func (s *Service) Create(ctx context.Context, name string) (Anime, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return Anime{}, fmt.Errorf("%w: name is required", xerrors.ErrInvalidArgument)
	}

	dirPath := filepath.Join(s.config.ImageRootDirectory, name)

	var row db.Anime
	err := db.NewTransaction(ctx, s.dbClient, func(ctx context.Context) error {
		// 1. Create the anime DB row
		row = db.Anime{Name: name}
		if err := s.dbClient.Anime().Create(ctx, &row); err != nil {
			if isUniqueViolation(err) {
				return fmt.Errorf("%w: %s", ErrAnimeAlreadyExists, name)
			}
			return err
		}

		// 2. Create the db.File record for the folder
		animeID := row.ID
		dirFile := db.File{
			Name:     name,
			ParentID: db.RootDirectoryID,
			Type:     db.FileTypeDirectory,
			AnimeID:  &animeID,
		}
		if err := s.dbClient.File().Create(ctx, &dirFile); err != nil {
			if isUniqueViolation(err) {
				return fmt.Errorf("%w: folder %s already exists on disk", ErrAnimeAlreadyExists, name)
			}
			return fmt.Errorf("File.Create: %w", err)
		}

		// 3. Create the folder on disk
		if err := os.Mkdir(dirPath, 0755); err != nil {
			if os.IsExist(err) {
				return fmt.Errorf("%w: folder %s already exists on disk", ErrAnimeAlreadyExists, name)
			}
			return fmt.Errorf("os.Mkdir: %w", err)
		}
		return nil
	})
	if err != nil {
		return Anime{}, err
	}
	return Anime{ID: row.ID, Name: row.Name}, nil
}

// Rename updates the name of an existing anime and renames its root folder on
// disk. Returns ErrAnimeNotFound if no such id exists, ErrAnimeAlreadyExists
// if the new name collides with another anime, and ErrInvalidArgument for an
// empty name.
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
		oldName := row.Name
		row.Name = name
		if err := client.Update(ctx, &row); err != nil {
			if isUniqueViolation(err) {
				return fmt.Errorf("%w: %s", ErrAnimeAlreadyExists, name)
			}
			return err
		}
		updated = row

		// Find the anime's root folder and rename it on disk + in DB
		dirs, err := s.dbClient.File().FindDirectoriesByAnimeID(id)
		if err != nil {
			return fmt.Errorf("File.FindDirectoriesByAnimeID: %w", err)
		}
		if len(dirs) > 0 {
			rootDir := dirs[0]
			oldPath := filepath.Join(s.config.ImageRootDirectory, oldName)
			newPath := filepath.Join(s.config.ImageRootDirectory, name)

			// Rename in DB
			rootDir.Name = name
			if err := s.dbClient.File().Update(ctx, &rootDir); err != nil {
				return fmt.Errorf("File.Update: %w", err)
			}

			// Rename on disk
			if err := os.Rename(oldPath, newPath); err != nil {
				return fmt.Errorf("os.Rename: %w", err)
			}
		}
		return nil
	})
	return Anime{ID: updated.ID, Name: updated.Name}, err
}

// Delete removes an anime, deletes its root folder from disk and from the DB
// (including all descendants and their file_tag rows), and then deletes the
// anime row itself.
func (s *Service) Delete(ctx context.Context, id uint) error {
	// verify exists for a clean error
	anime, err := s.dbClient.Anime().FindByValue(ctx, &db.Anime{ID: id})
	if errors.Is(err, db.ErrRecordNotFound) {
		return fmt.Errorf("%w: id %d", ErrAnimeNotFound, id)
	}
	if err != nil {
		return err
	}

	// Find the anime's root folder(s)
	dirs, err := s.dbClient.File().FindDirectoriesByAnimeID(id)
	if err != nil {
		return fmt.Errorf("File.FindDirectoriesByAnimeID: %w", err)
	}

	// Collect all file IDs (the root folder + all descendants) so we can
	// clean up file_tag rows and file rows in the DB.
	var allFileIDs []uint
	var diskPath string
	if len(dirs) > 0 {
		rootDir := dirs[0]
		diskPath = filepath.Join(s.config.ImageRootDirectory, anime.Name)
		allFileIDs = append(allFileIDs, rootDir.ID)

		// BFS to find all descendant files
		queue := []uint{rootDir.ID}
		for len(queue) > 0 {
			children, err := s.dbClient.File().FindFilesByParentIDs(queue)
			if err != nil {
				return fmt.Errorf("File.FindFilesByParentIDs: %w", err)
			}
			queue = queue[:0]
			for _, child := range children {
				allFileIDs = append(allFileIDs, child.ID)
				if child.Type == db.FileTypeDirectory {
					queue = append(queue, child.ID)
				}
			}
		}
	}

	return db.NewTransaction(ctx, s.dbClient, func(ctx context.Context) error {
		// Delete file_tag rows for all files in the tree
		if len(allFileIDs) > 0 {
			if err := s.dbClient.FileTag().DeleteByFileIDs(ctx, allFileIDs); err != nil {
				return fmt.Errorf("FileTag.DeleteByFileIDs: %w", err)
			}
			// Delete all file rows
			if err := s.dbClient.File().DeleteByIDs(ctx, allFileIDs); err != nil {
				return fmt.Errorf("File.DeleteByIDs: %w", err)
			}
		}

		// Clear anime_id on tags that were explicitly assigned to this anime.
		// We clear (set to NULL) rather than deleting the tags because they
		// may also be used on images outside this anime.
		if err := s.dbClient.Tag().ClearAnimeIDByAnimeID(ctx, id); err != nil {
			return fmt.Errorf("Tag.ClearAnimeIDByAnimeID: %w", err)
		}

		// Delete the anime row
		if err := s.dbClient.Anime().BatchDelete(ctx, []db.Anime{{ID: id}}); err != nil {
			return err
		}

		// Remove the folder from disk. Ignore errors if it's already gone.
		if diskPath != "" {
			if err := os.RemoveAll(diskPath); err != nil && !os.IsNotExist(err) {
				return fmt.Errorf("os.RemoveAll: %w", err)
			}
		}

		return nil
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

// DerivedTagCount is a tag with the number of images that have it in the
// anime's folder tree.
type DerivedTagCount struct {
	TagID       uint   `json:"tagId"`
	TagName     string `json:"tagName"`
	TagCategory string `json:"tagCategory"`
	ImageCount  uint   `json:"imageCount"`
}

// DeriveTagsForAnime computes the tags for an anime by finding all image files
// in its folder tree, looking up which tags are applied to those images, and
// returning unique tags with counts. It also includes tags that are explicitly
// assigned to this anime via the anime_id column on the tags table (e.g.
// characters created from the anime detail page), merging and deduplicating
// so each tag appears once with the correct image count.
func (s *Service) DeriveTagsForAnime(animeID uint) ([]DerivedTagCount, error) {
	tree, err := s.directoryReader.ReadDirectoryTree()
	if err != nil {
		return nil, fmt.Errorf("directoryReader.ReadDirectoryTree: %w", err)
	}
	stored, err := s.readStoredAnimeAssignments()
	if err != nil {
		return nil, err
	}
	resolved := make(map[uint]FolderAnimeAssignment)
	walkDirectoryTree(&tree, 0, stored, resolved)

	// Collect all image IDs belonging to this anime
	imageIDs := make([]uint, 0)
	collectImageIDsForAnimeFromTree(&tree, animeID, resolved, &imageIDs)

	// Count images per tag from file_tags
	tagCounts := make(map[uint]uint)
	if len(imageIDs) > 0 {
		fileTags, err := s.dbClient.FileTag().FindAllByFileID(imageIDs)
		if err != nil {
			return nil, fmt.Errorf("FileTag.FindAllByFileID: %w", err)
		}
		for _, ft := range fileTags {
			tagCounts[ft.TagID]++
		}
	}

	// Fetch tags explicitly assigned to this anime (e.g. characters created
	// from the anime detail page)
	animeTags, err := s.dbClient.Tag().FindTagsByAnimeID(animeID)
	if err != nil {
		return nil, fmt.Errorf("Tag.FindTagsByAnimeID: %w", err)
	}

	// Build a tag info map from both sources
	type tagInfo struct {
		Name     string
		Category string
	}
	tagInfoMap := make(map[uint]tagInfo)

	// Add anime-assigned tags first (they may have 0 images)
	for _, t := range animeTags {
		tagInfoMap[t.ID] = tagInfo{Name: t.Name, Category: t.Category}
		// Ensure tag appears in tagCounts even if count is 0
		if _, ok := tagCounts[t.ID]; !ok {
			tagCounts[t.ID] = 0
		}
	}

	if len(tagCounts) == 0 {
		return nil, nil
	}

	// Fetch tag info for derived tags not already in the map
	missingIDs := make([]uint, 0)
	for tid := range tagCounts {
		if _, ok := tagInfoMap[tid]; !ok {
			missingIDs = append(missingIDs, tid)
		}
	}
	if len(missingIDs) > 0 {
		tags, err := s.dbClient.Tag().FindAllByTagIDs(missingIDs)
		if err != nil {
			return nil, fmt.Errorf("Tag.FindAllByTagIDs: %w", err)
		}
		for _, t := range tags {
			tagInfoMap[t.ID] = tagInfo{Name: t.Name, Category: t.Category}
		}
	}

	result := make([]DerivedTagCount, 0, len(tagCounts))
	for tid, count := range tagCounts {
		info := tagInfoMap[tid]
		result = append(result, DerivedTagCount{
			TagID:       tid,
			TagName:     info.Name,
			TagCategory: info.Category,
			ImageCount:  count,
		})
	}
	return result, nil
}

func collectImageIDsForAnimeFromTree(
	dir *image.Directory,
	animeID uint,
	resolved map[uint]FolderAnimeAssignment,
	out *[]uint,
) {
	if dir.ID != 0 {
		if a, ok := resolved[dir.ID]; ok && a.AnimeID == animeID {
			for _, child := range dir.ChildImageFiles {
				*out = append(*out, child.ID)
			}
			for _, child := range dir.Children {
				collectImageIDsForAnimeFromTree(child, animeID, resolved, out)
			}
			return
		}
	}
	for _, child := range dir.Children {
		collectImageIDsForAnimeFromTree(child, animeID, resolved, out)
	}
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

// AnimeFolderTreeNode represents a node in the anime's folder tree for the
// detail page.
type AnimeFolderTreeNode struct {
	ID         uint                  `json:"id"`
	Name       string                `json:"name"`
	ImageCount uint                  `json:"imageCount"`
	Children   []AnimeFolderTreeNode `json:"children"`
}

// GetAnimeFolderTree returns the folder tree rooted at the anime's root folder.
// It finds the File with anime_id = animeID and returns its subtree.
func (s *Service) GetAnimeFolderTree(animeID uint) (*AnimeFolderTreeNode, error) {
	dirs, err := s.dbClient.File().FindDirectoriesByAnimeID(animeID)
	if err != nil {
		return nil, fmt.Errorf("File.FindDirectoriesByAnimeID: %w", err)
	}
	if len(dirs) == 0 {
		return nil, nil
	}
	rootDir := dirs[0]

	tree, err := s.directoryReader.ReadDirectoryTree()
	if err != nil {
		return nil, fmt.Errorf("directoryReader.ReadDirectoryTree: %w", err)
	}
	treeDir := tree.FindChildByID(rootDir.ID)
	if treeDir.ID == 0 {
		return nil, nil
	}
	result := buildFolderTreeNode(&treeDir)
	return &result, nil
}

func buildFolderTreeNode(dir *image.Directory) AnimeFolderTreeNode {
	children := make([]AnimeFolderTreeNode, 0, len(dir.Children))
	for _, child := range dir.Children {
		children = append(children, buildFolderTreeNode(child))
	}
	return AnimeFolderTreeNode{
		ID:         dir.ID,
		Name:       dir.Name,
		ImageCount: uint(len(dir.ChildImageFiles)),
		Children:   children,
	}
}

// ImportFolderAsAnime creates a new anime from an existing top-level folder.
// It checks that the folder has no anime_id (or ancestor with anime_id),
// creates an anime with the folder's name, and sets anime_id on the folder.
func (s *Service) ImportFolderAsAnime(ctx context.Context, folderID uint) (Anime, error) {
	if folderID == 0 {
		return Anime{}, fmt.Errorf("%w: folderID required", xerrors.ErrInvalidArgument)
	}

	folder, err := s.dbClient.File().FindByValue(ctx, &db.File{ID: folderID})
	if errors.Is(err, db.ErrRecordNotFound) {
		return Anime{}, fmt.Errorf("%w: folder id %d", image.ErrDirectoryNotFound, folderID)
	}
	if err != nil {
		return Anime{}, err
	}
	if folder.Type != db.FileTypeDirectory {
		return Anime{}, fmt.Errorf("%w: file id %d is not a directory", xerrors.ErrInvalidArgument, folderID)
	}
	if folder.AnimeID != nil {
		return Anime{}, fmt.Errorf("%w: folder already assigned to anime", ErrAnimeAlreadyExists)
	}

	ancestorAnime, err := s.findAncestorAnimeID(folderID)
	if err != nil {
		return Anime{}, err
	}
	if ancestorAnime != nil {
		return Anime{}, ErrAnimeAncestorAssigned
	}

	var row db.Anime
	err = db.NewTransaction(ctx, s.dbClient, func(ctx context.Context) error {
		row = db.Anime{Name: folder.Name}
		if err := s.dbClient.Anime().Create(ctx, &row); err != nil {
			if isUniqueViolation(err) {
				return fmt.Errorf("%w: %s", ErrAnimeAlreadyExists, folder.Name)
			}
			return err
		}
		animeID := row.ID
		return s.dbClient.File().SetAnimeID(ctx, folderID, &animeID)
	})
	if err != nil {
		return Anime{}, err
	}
	return Anime{ID: row.ID, Name: row.Name}, nil
}

// ImportMultipleFoldersAsAnime creates a new anime for each of the given
// folder IDs. Each folder must be a top-level directory with no existing
// anime_id (or ancestor with anime_id). Returns the list of created anime.
// If any folder fails validation the entire batch is skipped.
func (s *Service) ImportMultipleFoldersAsAnime(ctx context.Context, folderIDs []uint) ([]Anime, error) {
	if len(folderIDs) == 0 {
		return nil, fmt.Errorf("%w: folderIDs required", xerrors.ErrInvalidArgument)
	}

	// Pre-validate all folders before creating any anime
	folders := make([]db.File, 0, len(folderIDs))
	for _, fid := range folderIDs {
		if fid == 0 {
			return nil, fmt.Errorf("%w: folderID must be non-zero", xerrors.ErrInvalidArgument)
		}
		folder, err := s.dbClient.File().FindByValue(ctx, &db.File{ID: fid})
		if errors.Is(err, db.ErrRecordNotFound) {
			return nil, fmt.Errorf("%w: folder id %d", image.ErrDirectoryNotFound, fid)
		}
		if err != nil {
			return nil, err
		}
		if folder.Type != db.FileTypeDirectory {
			return nil, fmt.Errorf("%w: file id %d is not a directory", xerrors.ErrInvalidArgument, fid)
		}
		if folder.AnimeID != nil {
			return nil, fmt.Errorf("%w: folder %d already assigned to anime", ErrAnimeAlreadyExists, fid)
		}
		ancestorAnime, err := s.findAncestorAnimeID(fid)
		if err != nil {
			return nil, err
		}
		if ancestorAnime != nil {
			return nil, ErrAnimeAncestorAssigned
		}
		folders = append(folders, folder)
	}

	results := make([]Anime, 0, len(folders))
	err := db.NewTransaction(ctx, s.dbClient, func(ctx context.Context) error {
		for _, folder := range folders {
			row := db.Anime{Name: folder.Name}
			if err := s.dbClient.Anime().Create(ctx, &row); err != nil {
				if isUniqueViolation(err) {
					return fmt.Errorf("%w: %s", ErrAnimeAlreadyExists, folder.Name)
				}
				return err
			}
			animeID := row.ID
			if err := s.dbClient.File().SetAnimeID(ctx, folder.ID, &animeID); err != nil {
				return err
			}
			results = append(results, Anime{ID: row.ID, Name: row.Name})
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return results, nil
}

// ListUnassignedTopFolders returns top-level folders (children of root) that
// have no anime_id and no ancestor with anime_id. These are candidates for
// importing as anime.
func (s *Service) ListUnassignedTopFolders() ([]image.Directory, error) {
	tree, err := s.directoryReader.ReadDirectoryTree()
	if err != nil {
		return nil, fmt.Errorf("directoryReader.ReadDirectoryTree: %w", err)
	}
	storedMap, err := s.readStoredAnimeAssignments()
	if err != nil {
		return nil, err
	}

	result := make([]image.Directory, 0)
	for _, child := range tree.Children {
		if _, ok := storedMap[child.ID]; !ok {
			result = append(result, *child)
		}
	}
	return result, nil
}

// FindAnimeRootFolder returns the db.File row that is the root folder for the
// given anime. Returns nil if no folder is assigned.
func (s *Service) FindAnimeRootFolder(animeID uint) (*db.File, error) {
	dirs, err := s.dbClient.File().FindDirectoriesByAnimeID(animeID)
	if err != nil {
		return nil, err
	}
	if len(dirs) == 0 {
		return nil, nil
	}
	return &dirs[0], nil
}

// GetFolderImageIDs returns the image file IDs for a given folder and
// optionally its descendants. When recursive is true, images from all
// descendant folders are included.
func (s *Service) GetFolderImageIDs(folderID uint, recursive bool) ([]uint, error) {
	tree, err := s.directoryReader.ReadDirectoryTree()
	if err != nil {
		return nil, fmt.Errorf("directoryReader.ReadDirectoryTree: %w", err)
	}
	dir := tree.FindChildByID(folderID)
	if dir.ID == 0 {
		return nil, fmt.Errorf("%w: folder id %d", image.ErrDirectoryNotFound, folderID)
	}
	ids := make([]uint, 0)
	for _, img := range dir.ChildImageFiles {
		ids = append(ids, img.ID)
	}
	if recursive {
		collectDescendantImageIDs(&dir, &ids)
	}
	return ids, nil
}

func collectDescendantImageIDs(dir *image.Directory, out *[]uint) {
	for _, child := range dir.Children {
		for _, img := range child.ChildImageFiles {
			*out = append(*out, img.ID)
		}
		collectDescendantImageIDs(child, out)
	}
}

// AnimeEntry represents a structured entry (season, movie, other) within an
// anime's folder tree. Each entry is backed by a physical directory on disk.
type AnimeEntry struct {
	ID          uint         `json:"id"`
	Name        string       `json:"name"`
	EntryType   string       `json:"entryType"`
	EntryNumber *uint        `json:"entryNumber"` // season number or movie year
	ImageCount  uint         `json:"imageCount"`
	Children    []AnimeEntry `json:"children"` // sub-entries (parts)
}

// GetAnimeEntries returns the structured entries for an anime, sorted by
// canonical order: seasons by number, movies by year, other/legacy alphabetical.
func (s *Service) GetAnimeEntries(animeID uint) ([]AnimeEntry, error) {
	dirs, err := s.dbClient.File().FindDirectoriesByAnimeID(animeID)
	if err != nil {
		return nil, fmt.Errorf("File.FindDirectoriesByAnimeID: %w", err)
	}
	if len(dirs) == 0 {
		return nil, nil
	}
	rootDir := dirs[0]

	children, err := s.dbClient.File().FindDirectChildDirectories(rootDir.ID)
	if err != nil {
		return nil, fmt.Errorf("File.FindDirectChildDirectories: %w", err)
	}

	// Collect all folder IDs (root + children + grandchildren) for image counting
	allFolderIDs := []uint{rootDir.ID}
	childGrandchildren := make(map[uint][]db.File)
	for _, child := range children {
		allFolderIDs = append(allFolderIDs, child.ID)
		grandchildren, err := s.dbClient.File().FindDirectChildDirectories(child.ID)
		if err != nil {
			return nil, fmt.Errorf("File.FindDirectChildDirectories (grandchild): %w", err)
		}
		childGrandchildren[child.ID] = grandchildren
		for _, gc := range grandchildren {
			allFolderIDs = append(allFolderIDs, gc.ID)
		}
	}

	// Count images for each folder
	imageCounts, err := s.countImagesPerFolder(allFolderIDs)
	if err != nil {
		return nil, err
	}

	entries := make([]AnimeEntry, 0, len(children))
	for _, child := range children {
		subEntries := make([]AnimeEntry, 0)
		for _, gc := range childGrandchildren[child.ID] {
			subEntries = append(subEntries, AnimeEntry{
				ID:          gc.ID,
				Name:        gc.Name,
				EntryType:   gc.EntryType,
				EntryNumber: gc.EntryNumber,
				ImageCount:  imageCounts[gc.ID],
			})
		}
		entries = append(entries, AnimeEntry{
			ID:          child.ID,
			Name:        child.Name,
			EntryType:   child.EntryType,
			EntryNumber: child.EntryNumber,
			ImageCount:  imageCounts[child.ID],
			Children:    subEntries,
		})
	}

	sortEntries(entries)
	return entries, nil
}

// countImagesPerFolder returns image counts keyed by folder ID.
func (s *Service) countImagesPerFolder(folderIDs []uint) (map[uint]uint, error) {
	if len(folderIDs) == 0 {
		return nil, nil
	}
	images, err := s.dbClient.File().FindImageFilesByParentIDs(folderIDs)
	if err != nil {
		return nil, fmt.Errorf("File.FindImageFilesByParentIDs: %w", err)
	}
	counts := make(map[uint]uint)
	for _, img := range images {
		counts[img.ParentID]++
	}
	return counts, nil
}

// sortEntries applies canonical sort: seasons by number asc, movies by year
// asc, other alphabetically, legacy/empty type alphabetically.
func sortEntries(entries []AnimeEntry) {
	typeOrder := func(entryType string) int {
		switch entryType {
		case db.EntryTypeSeason:
			return 0
		case db.EntryTypeMovie:
			return 1
		case db.EntryTypeOther:
			return 2
		default:
			return 3 // legacy/empty
		}
	}

	sort.SliceStable(entries, func(i, j int) bool {
		oi, oj := typeOrder(entries[i].EntryType), typeOrder(entries[j].EntryType)
		if oi != oj {
			return oi < oj
		}
		// Within same type group, sort by number (season number or movie year)
		ni := uint(0)
		if entries[i].EntryNumber != nil {
			ni = *entries[i].EntryNumber
		}
		nj := uint(0)
		if entries[j].EntryNumber != nil {
			nj = *entries[j].EntryNumber
		}
		if ni != nj {
			return ni < nj
		}
		// Fall back to alphabetical
		return strings.ToLower(entries[i].Name) < strings.ToLower(entries[j].Name)
	})
}

// CreateEntry creates a new entry (season, movie, or other) under an anime's
// root folder. It creates both the DB record and the directory on disk.
func (s *Service) CreateEntry(ctx context.Context, animeID uint, entryType string, entryNumber *uint, displayName string) (AnimeEntry, error) {
	if entryType != db.EntryTypeSeason && entryType != db.EntryTypeMovie && entryType != db.EntryTypeOther {
		return AnimeEntry{}, fmt.Errorf("%w: entryType must be season, movie, or other", xerrors.ErrInvalidArgument)
	}

	displayName = strings.TrimSpace(displayName)

	rootFolder, err := s.FindAnimeRootFolder(animeID)
	if err != nil {
		return AnimeEntry{}, err
	}
	if rootFolder == nil {
		return AnimeEntry{}, fmt.Errorf("%w: id %d has no root folder", ErrAnimeNotFound, animeID)
	}

	switch entryType {
	case db.EntryTypeSeason:
		if entryNumber != nil && *entryNumber == 0 {
			return AnimeEntry{}, fmt.Errorf("%w: season number must be > 0", xerrors.ErrInvalidArgument)
		}
		if entryNumber == nil {
			n, err := s.NextEntryNumber(animeID, db.EntryTypeSeason)
			if err != nil {
				return AnimeEntry{}, err
			}
			entryNumber = &n
		}
		if displayName == "" {
			displayName = fmt.Sprintf("Season %d", *entryNumber)
		}
	case db.EntryTypeMovie:
		if displayName == "" {
			return AnimeEntry{}, fmt.Errorf("%w: displayName is required for movie entries", xerrors.ErrInvalidArgument)
		}
		if entryNumber != nil && (*entryNumber < 1900 || *entryNumber > 2100) {
			return AnimeEntry{}, fmt.Errorf("%w: movie year must be between 1900 and 2100", xerrors.ErrInvalidArgument)
		}
	case db.EntryTypeOther:
		if displayName == "" {
			return AnimeEntry{}, fmt.Errorf("%w: displayName is required for other entries", xerrors.ErrInvalidArgument)
		}
		entryNumber = nil // other entries don't have a number
	}

	if err := validateFolderName(displayName); err != nil {
		return AnimeEntry{}, fmt.Errorf("%w: %s", xerrors.ErrInvalidArgument, err)
	}

	// Build disk path: <ImageRootDirectory>/<anime-name>/<displayName>
	rootDirPath, err := s.resolveFileDiskPath(rootFolder.ID)
	if err != nil {
		return AnimeEntry{}, fmt.Errorf("resolveFileDiskPath: %w", err)
	}
	dirPath := filepath.Join(rootDirPath, displayName)

	var newFile db.File
	err = db.NewTransaction(ctx, s.dbClient, func(ctx context.Context) error {
		newFile = db.File{
			Name:        displayName,
			ParentID:    rootFolder.ID,
			Type:        db.FileTypeDirectory,
			EntryType:   entryType,
			EntryNumber: entryNumber,
		}
		if err := s.dbClient.File().Create(ctx, &newFile); err != nil {
			if isUniqueViolation(err) {
				return fmt.Errorf("%w: entry %s already exists", xerrors.ErrInvalidArgument, displayName)
			}
			return fmt.Errorf("File.Create: %w", err)
		}
		if err := os.Mkdir(dirPath, 0755); err != nil {
			if os.IsExist(err) {
				return fmt.Errorf("%w: folder %s already exists on disk", xerrors.ErrInvalidArgument, displayName)
			}
			return fmt.Errorf("os.Mkdir: %w", err)
		}
		return nil
	})
	if err != nil {
		return AnimeEntry{}, err
	}

	return AnimeEntry{
		ID:          newFile.ID,
		Name:        newFile.Name,
		EntryType:   newFile.EntryType,
		EntryNumber: newFile.EntryNumber,
		ImageCount:  0,
	}, nil
}

// CreateSubEntry creates a child folder under an existing entry (for "parts").
// Sub-entries do not have entry_type or entry_number.
func (s *Service) CreateSubEntry(ctx context.Context, parentEntryID uint, name string) (AnimeEntry, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return AnimeEntry{}, fmt.Errorf("%w: name is required", xerrors.ErrInvalidArgument)
	}

	if err := validateFolderName(name); err != nil {
		return AnimeEntry{}, fmt.Errorf("%w: %s", xerrors.ErrInvalidArgument, err)
	}

	parent, err := s.dbClient.File().FindByValue(ctx, &db.File{ID: parentEntryID})
	if errors.Is(err, db.ErrRecordNotFound) {
		return AnimeEntry{}, fmt.Errorf("%w: parent entry id %d", image.ErrDirectoryNotFound, parentEntryID)
	}
	if err != nil {
		return AnimeEntry{}, err
	}
	if parent.Type != db.FileTypeDirectory {
		return AnimeEntry{}, fmt.Errorf("%w: parent id %d is not a directory", xerrors.ErrInvalidArgument, parentEntryID)
	}

	// Enforce depth limit: the parent must be a direct child of the anime root folder.
	// Load the grandparent (parent's parent) and verify it has anime_id set,
	// which means the grandparent is the anime root folder and the parent is at depth 1.
	grandparent, err := s.dbClient.File().FindByValue(ctx, &db.File{ID: parent.ParentID})
	if errors.Is(err, db.ErrRecordNotFound) {
		return AnimeEntry{}, fmt.Errorf("sub-entries cannot be nested more than 2 levels deep")
	}
	if err != nil {
		return AnimeEntry{}, err
	}
	if grandparent.AnimeID == nil {
		return AnimeEntry{}, fmt.Errorf("sub-entries cannot be nested more than 2 levels deep")
	}

	parentDiskPath, err := s.resolveFileDiskPath(parent.ID)
	if err != nil {
		return AnimeEntry{}, fmt.Errorf("resolveFileDiskPath: %w", err)
	}
	dirPath := filepath.Join(parentDiskPath, name)

	var newFile db.File
	err = db.NewTransaction(ctx, s.dbClient, func(ctx context.Context) error {
		newFile = db.File{
			Name:     name,
			ParentID: parentEntryID,
			Type:     db.FileTypeDirectory,
		}
		if err := s.dbClient.File().Create(ctx, &newFile); err != nil {
			if isUniqueViolation(err) {
				return fmt.Errorf("%w: sub-entry %s already exists", xerrors.ErrInvalidArgument, name)
			}
			return fmt.Errorf("File.Create: %w", err)
		}
		if err := os.Mkdir(dirPath, 0755); err != nil {
			if os.IsExist(err) {
				return fmt.Errorf("%w: folder %s already exists on disk", xerrors.ErrInvalidArgument, name)
			}
			return fmt.Errorf("os.Mkdir: %w", err)
		}
		return nil
	})
	if err != nil {
		return AnimeEntry{}, err
	}

	return AnimeEntry{
		ID:         newFile.ID,
		Name:       newFile.Name,
		ImageCount: 0,
	}, nil
}

// RenameEntry renames an entry (directory) in both the DB and on disk.
func (s *Service) RenameEntry(ctx context.Context, entryID uint, newName string) error {
	newName = strings.TrimSpace(newName)
	if newName == "" {
		return fmt.Errorf("%w: name is required", xerrors.ErrInvalidArgument)
	}
	if err := validateFolderName(newName); err != nil {
		return fmt.Errorf("%w: %s", xerrors.ErrInvalidArgument, err)
	}

	file, err := s.dbClient.File().FindByValue(ctx, &db.File{ID: entryID})
	if errors.Is(err, db.ErrRecordNotFound) {
		return fmt.Errorf("%w: entry id %d", image.ErrDirectoryNotFound, entryID)
	}
	if err != nil {
		return err
	}
	if file.Type != db.FileTypeDirectory {
		return fmt.Errorf("%w: entry id %d is not a directory", xerrors.ErrInvalidArgument, entryID)
	}

	oldName := file.Name
	if oldName == newName {
		return nil // no-op
	}

	oldPath, err := s.resolveFileDiskPath(file.ID)
	if err != nil {
		return fmt.Errorf("resolveFileDiskPath: %w", err)
	}
	newPath := filepath.Join(filepath.Dir(oldPath), newName)

	return db.NewTransaction(ctx, s.dbClient, func(ctx context.Context) error {
		file.Name = newName
		if err := s.dbClient.File().Update(ctx, &file); err != nil {
			if isUniqueViolation(err) {
				return fmt.Errorf("%w: entry %s already exists", xerrors.ErrInvalidArgument, newName)
			}
			return fmt.Errorf("File.Update: %w", err)
		}
		if err := os.Rename(oldPath, newPath); err != nil {
			return fmt.Errorf("os.Rename: %w", err)
		}
		return nil
	})
}

// DeleteEntry deletes an entry and all its descendants from both DB and disk.
func (s *Service) DeleteEntry(ctx context.Context, entryID uint) error {
	file, err := s.dbClient.File().FindByValue(ctx, &db.File{ID: entryID})
	if errors.Is(err, db.ErrRecordNotFound) {
		return fmt.Errorf("%w: entry id %d", image.ErrDirectoryNotFound, entryID)
	}
	if err != nil {
		return err
	}
	if file.Type != db.FileTypeDirectory {
		return fmt.Errorf("%w: entry id %d is not a directory", xerrors.ErrInvalidArgument, entryID)
	}

	diskPath, err := s.resolveFileDiskPath(file.ID)
	if err != nil {
		return fmt.Errorf("resolveFileDiskPath: %w", err)
	}

	// BFS to collect all descendant file IDs
	allFileIDs := []uint{file.ID}
	queue := []uint{file.ID}
	for len(queue) > 0 {
		children, err := s.dbClient.File().FindFilesByParentIDs(queue)
		if err != nil {
			return fmt.Errorf("File.FindFilesByParentIDs: %w", err)
		}
		queue = queue[:0]
		for _, child := range children {
			allFileIDs = append(allFileIDs, child.ID)
			if child.Type == db.FileTypeDirectory {
				queue = append(queue, child.ID)
			}
		}
	}

	return db.NewTransaction(ctx, s.dbClient, func(ctx context.Context) error {
		if len(allFileIDs) > 0 {
			if err := s.dbClient.FileTag().DeleteByFileIDs(ctx, allFileIDs); err != nil {
				return fmt.Errorf("FileTag.DeleteByFileIDs: %w", err)
			}
			if err := s.dbClient.File().DeleteByIDs(ctx, allFileIDs); err != nil {
				return fmt.Errorf("File.DeleteByIDs: %w", err)
			}
		}
		if err := os.RemoveAll(diskPath); err != nil && !os.IsNotExist(err) {
			return fmt.Errorf("os.RemoveAll: %w", err)
		}
		return nil
	})
}

// NextEntryNumber returns the next entry number for the season type
// under the anime's root folder. Returns max(existing)+1 or 1 if none exist.
// Only season type is supported; other types return an error.
func (s *Service) NextEntryNumber(animeID uint, entryType string) (uint, error) {
	if entryType != db.EntryTypeSeason {
		return 0, fmt.Errorf("NextEntryNumber only supports season type")
	}

	rootFolder, err := s.FindAnimeRootFolder(animeID)
	if err != nil {
		return 0, err
	}
	if rootFolder == nil {
		return 1, nil
	}

	children, err := s.dbClient.File().FindDirectChildDirectories(rootFolder.ID)
	if err != nil {
		return 0, fmt.Errorf("File.FindDirectChildDirectories: %w", err)
	}

	var maxNum uint
	for _, child := range children {
		if child.EntryType == entryType && child.EntryNumber != nil {
			if *child.EntryNumber > maxNum {
				maxNum = *child.EntryNumber
			}
		}
	}
	return maxNum + 1, nil
}

// resolveFileDiskPath walks up the parent chain to build the full disk path
// for a file. The root directory (parent_id=0) is mapped to
// s.config.ImageRootDirectory.
func (s *Service) resolveFileDiskPath(fileID uint) (string, error) {
	var parts []string
	current := fileID
	for current != db.RootDirectoryID {
		file, err := db.FindByValue(s.dbClient, db.File{ID: current})
		if err != nil {
			return "", fmt.Errorf("FindByValue(%d): %w", current, err)
		}
		parts = append([]string{file.Name}, parts...)
		current = file.ParentID
	}
	return filepath.Join(append([]string{s.config.ImageRootDirectory}, parts...)...), nil
}

func isUniqueViolation(err error) bool {
	if err == nil {
		return false
	}
	return strings.Contains(err.Error(), "UNIQUE constraint failed")
}
