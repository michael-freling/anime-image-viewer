package frontend

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"github.com/michael-freling/anime-image-viewer/internal/anime"
	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/michael-freling/anime-image-viewer/internal/image"
	"github.com/michael-freling/anime-image-viewer/internal/tag"
)

// Anime is the JSON-friendly anime model exposed to the frontend.
type Anime struct {
	ID   uint   `json:"id"`
	Name string `json:"name"`
}

// AnimeListItem is an anime row plus its image count for the list page.
type AnimeListItem struct {
	ID         uint   `json:"id"`
	Name       string `json:"name"`
	ImageCount uint   `json:"imageCount"`
}

// AnimeTagInfo is a tag row that belongs to a specific anime.
type AnimeTagInfo struct {
	ID         uint   `json:"id"`
	Name       string `json:"name"`
	ImageCount uint   `json:"imageCount"`
}

// AnimeFolderInfo is a folder mapped to an anime, with the inheritance flag.
type AnimeFolderInfo struct {
	ID         uint   `json:"id"`
	Name       string `json:"name"`
	Path       string `json:"path"`
	ImageCount uint   `json:"imageCount"`
	// Inherited is true if the folder inherits its anime id from an
	// ancestor (in which case the assignment lives on the ancestor).
	Inherited bool `json:"inherited"`
}

// AnimeDetailsResponse is the payload of the landing page request.
type AnimeDetailsResponse struct {
	Anime   Anime             `json:"anime"`
	Tags    []AnimeTagInfo    `json:"tags"`
	Folders []AnimeFolderInfo `json:"folders"`
}

// AnimeService is the Wails-bound service for anime CRUD and assignments.
type AnimeService struct {
	core            *anime.Service
	dbClient        *db.Client
	directoryReader *image.DirectoryReader
	tagReader       *tag.Reader
	imageReader     *image.Reader
}

func NewAnimeService(
	core *anime.Service,
	dbClient *db.Client,
	directoryReader *image.DirectoryReader,
	tagReader *tag.Reader,
	imageReader *image.Reader,
) *AnimeService {
	return &AnimeService{
		core:            core,
		dbClient:        dbClient,
		directoryReader: directoryReader,
		tagReader:       tagReader,
		imageReader:     imageReader,
	}
}

// CreateAnime creates a new anime.
func (s *AnimeService) CreateAnime(ctx context.Context, name string) (Anime, error) {
	a, err := s.core.Create(ctx, name)
	return Anime{ID: a.ID, Name: a.Name}, err
}

// RenameAnime updates the name of an existing anime.
func (s *AnimeService) RenameAnime(ctx context.Context, id uint, name string) (Anime, error) {
	a, err := s.core.Rename(ctx, id, name)
	return Anime{ID: a.ID, Name: a.Name}, err
}

// DeleteAnime deletes an anime, clearing references on folders and tags.
func (s *AnimeService) DeleteAnime(ctx context.Context, id uint) error {
	return s.core.Delete(ctx, id)
}

// ListAnime returns every anime with its total image count, sorted by name.
func (s *AnimeService) ListAnime(ctx context.Context) ([]AnimeListItem, error) {
	rows, err := s.core.ReadAll(ctx)
	if err != nil || len(rows) == 0 {
		return nil, err
	}
	imageCounts, err := s.core.CountImagesForAnimeFolders()
	if err != nil {
		return nil, fmt.Errorf("CountImagesForAnimeFolders: %w", err)
	}
	result := make([]AnimeListItem, len(rows))
	for i, r := range rows {
		result[i] = AnimeListItem{
			ID:         r.ID,
			Name:       r.Name,
			ImageCount: imageCounts[r.ID],
		}
	}
	sort.SliceStable(result, func(i, j int) bool {
		return strings.ToLower(result[i].Name) < strings.ToLower(result[j].Name)
	})
	return result, nil
}

// GetAnimeDetails returns the landing page payload for a single anime.
func (s *AnimeService) GetAnimeDetails(ctx context.Context, id uint) (AnimeDetailsResponse, error) {
	a, err := s.core.Read(ctx, id)
	if err != nil {
		return AnimeDetailsResponse{}, err
	}

	// tags
	animeTags, err := s.dbClient.AnimeTag().FindAllByAnimeIDs([]uint{id})
	if err != nil {
		return AnimeDetailsResponse{}, fmt.Errorf("AnimeTag.FindAllByAnimeIDs: %w", err)
	}
	tagIDs := make([]uint, 0, len(animeTags))
	for _, at := range animeTags {
		tagIDs = append(tagIDs, at.TagID)
	}
	dbTags, err := s.dbClient.Tag().FindAllByTagIDs(tagIDs)
	if err != nil {
		return AnimeDetailsResponse{}, fmt.Errorf("Tag.FindAllByTagIDs: %w", err)
	}
	tagInfos := make([]AnimeTagInfo, 0, len(dbTags))
	for _, t := range dbTags {
		fileTags, err := s.dbClient.FileTag().FindAllByTagIDs([]uint{t.ID})
		if err != nil {
			return AnimeDetailsResponse{}, fmt.Errorf("FileTag.FindAllByTagIDs: %w", err)
		}
		tagInfos = append(tagInfos, AnimeTagInfo{
			ID:         t.ID,
			Name:       t.Name,
			ImageCount: uint(len(fileTags)),
		})
	}
	sort.SliceStable(tagInfos, func(i, j int) bool {
		return strings.ToLower(tagInfos[i].Name) < strings.ToLower(tagInfos[j].Name)
	})

	// folders
	folderInfos, err := s.collectFoldersForAnime(id)
	if err != nil {
		return AnimeDetailsResponse{}, err
	}

	return AnimeDetailsResponse{
		Anime:   Anime{ID: a.ID, Name: a.Name},
		Tags:    tagInfos,
		Folders: folderInfos,
	}, nil
}

func (s *AnimeService) collectFoldersForAnime(animeID uint) ([]AnimeFolderInfo, error) {
	storedDirs, err := s.dbClient.File().FindDirectoriesByAnimeID(animeID)
	if err != nil {
		return nil, fmt.Errorf("File.FindDirectoriesByAnimeID: %w", err)
	}
	if len(storedDirs) == 0 {
		return nil, nil
	}
	tree, err := s.directoryReader.ReadDirectoryTree()
	if err != nil {
		return nil, fmt.Errorf("directoryReader.ReadDirectoryTree: %w", err)
	}
	result := make([]AnimeFolderInfo, 0, len(storedDirs))
	for _, dir := range storedDirs {
		treeDir := tree.FindChildByID(dir.ID)
		// Walk all descendants of treeDir to count images.
		count := uint(len(treeDir.ChildImageFiles))
		for _, descendant := range treeDir.GetDescendants() {
			count += uint(len(descendant.ChildImageFiles))
		}
		result = append(result, AnimeFolderInfo{
			ID:         treeDir.ID,
			Name:       treeDir.Name,
			Path:       treeDir.RelativePath,
			ImageCount: count,
			Inherited:  false,
		})
	}
	sort.SliceStable(result, func(i, j int) bool {
		return strings.ToLower(result[i].Name) < strings.ToLower(result[j].Name)
	})
	return result, nil
}

// AssignTagToAnime adds a tag to an anime (m2m).
func (s *AnimeService) AssignTagToAnime(ctx context.Context, animeID uint, tagID uint) error {
	return s.core.AssignTag(ctx, animeID, tagID)
}

// UnassignTagFromAnime removes a tag from an anime (m2m).
func (s *AnimeService) UnassignTagFromAnime(ctx context.Context, animeID uint, tagID uint) error {
	return s.core.UnassignTag(ctx, animeID, tagID)
}

// AssignFolderToAnime marks a folder as the explicitly-assigned root of the
// anime. Fails if any ancestor of the folder is already assigned.
func (s *AnimeService) AssignFolderToAnime(ctx context.Context, animeID uint, folderID uint) error {
	return s.core.AssignFolder(ctx, animeID, folderID)
}

// UnassignFolderFromAnime clears the anime_id on the folder.
func (s *AnimeService) UnassignFolderFromAnime(ctx context.Context, folderID uint) error {
	return s.core.UnassignFolder(ctx, folderID)
}

// FolderAnimeStatus is the resolved per-folder anime mapping.
type FolderAnimeStatus struct {
	FolderID  uint `json:"folderId"`
	AnimeID   uint `json:"animeId"`
	Stored    bool `json:"stored"`
	Inherited bool `json:"inherited"`
}

// GetFolderAnimeMap returns the resolved anime mapping for every folder
// (directly assigned or inherited from an ancestor). Used by the directory
// edit UI to know whether to allow assignment.
func (s *AnimeService) GetFolderAnimeMap(ctx context.Context) (map[uint]FolderAnimeStatus, error) {
	resolved, err := s.core.ResolveFolderAnimeMap()
	if err != nil || len(resolved) == 0 {
		return nil, err
	}
	result := make(map[uint]FolderAnimeStatus, len(resolved))
	for folderID, assignment := range resolved {
		result[folderID] = FolderAnimeStatus{
			FolderID:  folderID,
			AnimeID:   assignment.AnimeID,
			Stored:    assignment.Stored,
			Inherited: !assignment.Stored,
		}
	}
	return result, nil
}

// SearchImagesByAnime returns image files for a single anime, walking every
// folder mapped to the anime (directly or by inheritance).
func (s *AnimeService) SearchImagesByAnime(ctx context.Context, animeID uint) (SearchImagesResponse, error) {
	if animeID == 0 {
		return SearchImagesResponse{}, fmt.Errorf("%w: animeID required", ErrInvalidArgument)
	}
	if _, err := s.core.Read(ctx, animeID); err != nil {
		return SearchImagesResponse{}, err
	}

	resolved, err := s.core.ResolveFolderAnimeMap()
	if err != nil {
		return SearchImagesResponse{}, err
	}
	tree, err := s.directoryReader.ReadDirectoryTree()
	if err != nil {
		return SearchImagesResponse{}, fmt.Errorf("directoryReader.ReadDirectoryTree: %w", err)
	}

	imageIDs := make([]uint, 0)
	collectImageIDsForAnime(&tree, animeID, resolved, &imageIDs)
	if len(imageIDs) == 0 {
		return SearchImagesResponse{}, nil
	}

	imageFiles, err := s.imageReader.ReadImagesByIDs(imageIDs)
	if err != nil {
		return SearchImagesResponse{}, fmt.Errorf("imageReader.ReadImagesByIDs: %w", err)
	}
	results := make([]Image, 0, len(imageFiles))
	for _, f := range imageFiles {
		results = append(results, newImageConverterFromImageFiles(f).Convert())
	}
	return SearchImagesResponse{Images: results}, nil
}

// SearchImagesUnassigned returns image files whose folder (resolved
// walk-up) does not belong to any anime.
func (s *AnimeService) SearchImagesUnassigned(ctx context.Context) (SearchImagesResponse, error) {
	resolved, err := s.core.ResolveFolderAnimeMap()
	if err != nil {
		return SearchImagesResponse{}, err
	}
	tree, err := s.directoryReader.ReadDirectoryTree()
	if err != nil {
		return SearchImagesResponse{}, fmt.Errorf("directoryReader.ReadDirectoryTree: %w", err)
	}

	imageIDs := make([]uint, 0)
	collectImageIDsForUnassigned(&tree, resolved, &imageIDs)
	if len(imageIDs) == 0 {
		return SearchImagesResponse{}, nil
	}
	imageFiles, err := s.imageReader.ReadImagesByIDs(imageIDs)
	if err != nil {
		return SearchImagesResponse{}, fmt.Errorf("imageReader.ReadImagesByIDs: %w", err)
	}
	results := make([]Image, 0, len(imageFiles))
	for _, f := range imageFiles {
		results = append(results, newImageConverterFromImageFiles(f).Convert())
	}
	return SearchImagesResponse{Images: results}, nil
}

func collectImageIDsForAnime(
	dir *image.Directory,
	animeID uint,
	resolved map[uint]anime.FolderAnimeAssignment,
	out *[]uint,
) {
	if dir.ID != db.RootDirectoryID {
		if a, ok := resolved[dir.ID]; ok && a.AnimeID == animeID {
			for _, child := range dir.ChildImageFiles {
				*out = append(*out, child.ID)
			}
			for _, child := range dir.Children {
				collectImageIDsForAnime(child, animeID, resolved, out)
			}
			return
		}
	}
	for _, child := range dir.Children {
		collectImageIDsForAnime(child, animeID, resolved, out)
	}
}

func collectImageIDsForUnassigned(
	dir *image.Directory,
	resolved map[uint]anime.FolderAnimeAssignment,
	out *[]uint,
) {
	if dir.ID != db.RootDirectoryID {
		if _, ok := resolved[dir.ID]; ok {
			// belongs to anime; skip
			return
		}
	}
	for _, child := range dir.ChildImageFiles {
		*out = append(*out, child.ID)
	}
	for _, child := range dir.Children {
		collectImageIDsForUnassigned(child, resolved, out)
	}
}
