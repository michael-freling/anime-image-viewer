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
	ID        uint   `json:"id"`
	Name      string `json:"name"`
	AniListID *int   `json:"aniListId"`
}

// AnimeListItem is an anime row plus its image count for the list page.
type AnimeListItem struct {
	ID             uint   `json:"id"`
	Name           string `json:"name"`
	ImageCount     uint   `json:"imageCount"`
	CoverImagePath string `json:"coverImagePath"`
}

// AnimeTagInfo is a derived tag computed from the images in the anime's folder
// tree (read-only).
type AnimeTagInfo struct {
	ID            uint   `json:"id"`
	Name          string `json:"name"`
	Category      string `json:"category"`
	ImageCount    uint   `json:"imageCount"`
	ThumbnailPath string `json:"thumbnailPath"`
}

// AnimeCharacterInfo is a character derived from an anime, exposed to the frontend.
type AnimeCharacterInfo struct {
	ID            uint   `json:"id"`
	Name          string `json:"name"`
	ImageCount    uint   `json:"imageCount"`
	ThumbnailPath string `json:"thumbnailPath"`
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

// AnimeFolderTreeNode is a node in the anime's folder tree.
type AnimeFolderTreeNode struct {
	ID         uint                  `json:"id"`
	Name       string                `json:"name"`
	ImageCount uint                  `json:"imageCount"`
	Children   []AnimeFolderTreeNode `json:"children"`
}

// UnassignedFolder is a top-level folder not assigned to any anime.
type UnassignedFolder struct {
	ID   uint   `json:"id"`
	Name string `json:"name"`
}

// AnimeSeasonInfo is a season (season, movie, other) in the anime's folder tree.
type AnimeSeasonInfo struct {
	ID           uint              `json:"id"`
	Name         string            `json:"name"`
	SeasonType   string            `json:"seasonType"`
	SeasonNumber *uint             `json:"seasonNumber"`
	AiringSeason string            `json:"airingSeason"`
	AiringYear   *uint             `json:"airingYear"`
	ImageCount   uint              `json:"imageCount"`
	Children     []AnimeSeasonInfo `json:"children"`
}

// AnimeDetailsResponse is the payload of the landing page request.
type AnimeDetailsResponse struct {
	Anime      Anime                `json:"anime"`
	Tags       []AnimeTagInfo       `json:"tags"`
	Characters []AnimeCharacterInfo `json:"characters"`
	Folders    []AnimeFolderInfo    `json:"folders"`
	FolderTree *AnimeFolderTreeNode `json:"folderTree"`
	Seasons    []AnimeSeasonInfo    `json:"seasons"`
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

// DeleteAnime deletes an anime, clearing references on folders.
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

	// Resolve one cover image per anime from the folder tree.
	coverPaths := s.resolveCoverImages(rows)

	result := make([]AnimeListItem, len(rows))
	for i, r := range rows {
		result[i] = AnimeListItem{
			ID:             r.ID,
			Name:           r.Name,
			ImageCount:     imageCounts[r.ID],
			CoverImagePath: coverPaths[r.ID],
		}
	}
	sort.SliceStable(result, func(i, j int) bool {
		return strings.ToLower(result[i].Name) < strings.ToLower(result[j].Name)
	})
	return result, nil
}

// GetAnimeDetails returns the landing page payload for a single anime.
// Tags are derived from images in the anime's folder tree (read-only).
func (s *AnimeService) GetAnimeDetails(ctx context.Context, id uint) (AnimeDetailsResponse, error) {
	a, err := s.core.Read(ctx, id)
	if err != nil {
		return AnimeDetailsResponse{}, err
	}

	// Read the DB row to get AniListID (core Anime struct does not carry it).
	dbAnime, err := s.dbClient.Anime().FindByValue(ctx, &db.Anime{ID: id})
	if err != nil {
		return AnimeDetailsResponse{}, fmt.Errorf("Anime.FindByValue: %w", err)
	}

	// Derive tags from images in the anime's folder tree
	derivedTags, err := s.core.DeriveTagsForAnime(id)
	if err != nil {
		return AnimeDetailsResponse{}, fmt.Errorf("core.DeriveTagsForAnime: %w", err)
	}
	tagInfos := make([]AnimeTagInfo, 0, len(derivedTags))
	for _, dt := range derivedTags {
		tagInfos = append(tagInfos, AnimeTagInfo{
			ID:         dt.TagID,
			Name:       dt.TagName,
			Category:   dt.TagCategory,
			ImageCount: dt.ImageCount,
		})
	}
	tagIDs := make([]uint, 0, len(tagInfos))
	for _, ti := range tagInfos {
		tagIDs = append(tagIDs, ti.ID)
	}
	thumbnailPaths := s.resolveTagThumbnails(tagIDs)
	for i := range tagInfos {
		tagInfos[i].ThumbnailPath = thumbnailPaths[tagInfos[i].ID]
	}
	sort.SliceStable(tagInfos, func(i, j int) bool {
		return strings.ToLower(tagInfos[i].Name) < strings.ToLower(tagInfos[j].Name)
	})

	// Derive characters for this anime
	derivedChars, err := s.core.DeriveCharactersForAnime(id)
	if err != nil {
		return AnimeDetailsResponse{}, fmt.Errorf("core.DeriveCharactersForAnime: %w", err)
	}
	charInfos := make([]AnimeCharacterInfo, 0, len(derivedChars))
	for _, dc := range derivedChars {
		charInfos = append(charInfos, AnimeCharacterInfo{
			ID:         dc.CharacterID,
			Name:       dc.CharacterName,
			ImageCount: dc.ImageCount,
		})
	}
	// Resolve character thumbnails
	charIDs := make([]uint, 0, len(charInfos))
	for _, ci := range charInfos {
		charIDs = append(charIDs, ci.ID)
	}
	charThumbnailPaths := s.resolveCharacterThumbnails(charIDs)
	for i := range charInfos {
		charInfos[i].ThumbnailPath = charThumbnailPaths[charInfos[i].ID]
	}
	sort.SliceStable(charInfos, func(i, j int) bool {
		return strings.ToLower(charInfos[i].Name) < strings.ToLower(charInfos[j].Name)
	})

	// folders
	folderInfos, err := s.collectFoldersForAnime(id)
	if err != nil {
		return AnimeDetailsResponse{}, err
	}

	// folder tree
	coreTree, err := s.core.GetAnimeFolderTree(id)
	if err != nil {
		return AnimeDetailsResponse{}, fmt.Errorf("core.GetAnimeFolderTree: %w", err)
	}
	var folderTree *AnimeFolderTreeNode
	if coreTree != nil {
		converted := convertFolderTreeNode(*coreTree)
		folderTree = &converted
	}

	// seasons
	coreSeasons, err := s.core.GetAnimeSeasons(id)
	if err != nil {
		return AnimeDetailsResponse{}, fmt.Errorf("core.GetAnimeSeasons: %w", err)
	}
	seasonInfos := convertSeasons(coreSeasons)

	return AnimeDetailsResponse{
		Anime:      Anime{ID: a.ID, Name: a.Name, AniListID: dbAnime.AniListID},
		Tags:       tagInfos,
		Characters: charInfos,
		Folders:    folderInfos,
		FolderTree: folderTree,
		Seasons:    seasonInfos,
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

// resolveCoverImages returns a map from anime ID to the /files/... path of
// one representative image. It silently returns an empty map on any error so
// the list page degrades gracefully to gradient placeholders.
func (s *AnimeService) resolveCoverImages(animeRows []anime.Anime) map[uint]string {
	resolved, err := s.core.ResolveFolderAnimeMap()
	if err != nil || len(resolved) == 0 {
		return nil
	}
	tree, err := s.directoryReader.ReadDirectoryTree()
	if err != nil {
		return nil
	}

	// Collect first image ID per anime.
	animeFirstImage := make(map[uint]uint, len(animeRows))
	for _, a := range animeRows {
		id := firstImageIDForAnime(&tree, a.ID, resolved)
		if id != 0 {
			animeFirstImage[a.ID] = id
		}
	}
	if len(animeFirstImage) == 0 {
		return nil
	}

	// Deduplicate image IDs for a single batch read.
	imageIDs := make([]uint, 0, len(animeFirstImage))
	for _, imgID := range animeFirstImage {
		imageIDs = append(imageIDs, imgID)
	}
	imageFiles, err := s.imageReader.ReadImagesByIDs(imageIDs)
	if err != nil {
		return nil
	}
	imageFileMap := imageFiles.ToMap()

	coverPaths := make(map[uint]string, len(animeFirstImage))
	for animeID, imgID := range animeFirstImage {
		if f, ok := imageFileMap[imgID]; ok {
			coverPaths[animeID] = f.Path
		}
	}
	return coverPaths
}

// resolveTagThumbnails returns a map from tag ID to the /files/... path of
// one representative image for that tag. It picks the smallest file ID per tag
// for deterministic ordering. On any error it silently returns nil so the
// detail page degrades gracefully.
func (s *AnimeService) resolveTagThumbnails(tagIDs []uint) map[uint]string {
	if len(tagIDs) == 0 {
		return nil
	}
	fileTags, err := s.dbClient.FileTag().FindAllByTagIDs(tagIDs)
	if err != nil {
		return nil
	}
	tagFileMap := fileTags.ToTagMap() // map[tagID]map[fileID]FileTag

	// For each tag pick the smallest file ID (deterministic).
	tagFirstImage := make(map[uint]uint, len(tagIDs))
	uniqueImageIDs := make(map[uint]struct{})
	for _, tagID := range tagIDs {
		fileMap, ok := tagFileMap[tagID]
		if !ok || len(fileMap) == 0 {
			continue
		}
		var minFileID uint
		for fileID := range fileMap {
			if minFileID == 0 || fileID < minFileID {
				minFileID = fileID
			}
		}
		tagFirstImage[tagID] = minFileID
		uniqueImageIDs[minFileID] = struct{}{}
	}
	if len(uniqueImageIDs) == 0 {
		return nil
	}

	imageIDs := make([]uint, 0, len(uniqueImageIDs))
	for id := range uniqueImageIDs {
		imageIDs = append(imageIDs, id)
	}
	imageFiles, err := s.imageReader.ReadImagesByIDs(imageIDs)
	if err != nil {
		return nil
	}
	imageFileMap := imageFiles.ToMap()

	result := make(map[uint]string, len(tagFirstImage))
	for tagID, imgID := range tagFirstImage {
		if f, ok := imageFileMap[imgID]; ok {
			result[tagID] = f.Path
		}
	}
	return result
}

// resolveCharacterThumbnails returns a map from character ID to the /files/...
// path of one representative image for that character. It picks the smallest
// file ID per character for deterministic ordering. On any error it silently
// returns nil so the detail page degrades gracefully.
func (s *AnimeService) resolveCharacterThumbnails(characterIDs []uint) map[uint]string {
	if len(characterIDs) == 0 {
		return nil
	}
	fileCharacters, err := s.dbClient.FileCharacter().FindByCharacterIDs(characterIDs)
	if err != nil {
		return nil
	}

	// For each character pick the smallest file ID (deterministic).
	charFirstImage := make(map[uint]uint, len(characterIDs))
	uniqueImageIDs := make(map[uint]struct{})
	for _, fc := range fileCharacters {
		current, exists := charFirstImage[fc.CharacterID]
		if !exists || fc.FileID < current {
			charFirstImage[fc.CharacterID] = fc.FileID
		}
		uniqueImageIDs[fc.FileID] = struct{}{}
	}
	if len(uniqueImageIDs) == 0 {
		return nil
	}

	imageIDs := make([]uint, 0, len(uniqueImageIDs))
	for id := range uniqueImageIDs {
		imageIDs = append(imageIDs, id)
	}
	imageFiles, err := s.imageReader.ReadImagesByIDs(imageIDs)
	if err != nil {
		return nil
	}
	imageFileMap := imageFiles.ToMap()

	result := make(map[uint]string, len(charFirstImage))
	for charID, imgID := range charFirstImage {
		if f, ok := imageFileMap[imgID]; ok {
			result[charID] = f.Path
		}
	}
	return result
}

// firstImageIDForAnime walks the directory tree and returns the ID of the
// first image file that belongs to the given anime, or 0 if none is found.
func firstImageIDForAnime(
	dir *image.Directory,
	animeID uint,
	resolved map[uint]anime.FolderAnimeAssignment,
) uint {
	if dir.ID != db.RootDirectoryID {
		if a, ok := resolved[dir.ID]; ok && a.AnimeID == animeID {
			if len(dir.ChildImageFiles) > 0 {
				return dir.ChildImageFiles[0].ID
			}
			for _, child := range dir.Children {
				if id := firstImageIDForAnime(child, animeID, resolved); id != 0 {
					return id
				}
			}
			return 0
		}
	}
	for _, child := range dir.Children {
		if id := firstImageIDForAnime(child, animeID, resolved); id != 0 {
			return id
		}
	}
	return 0
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

func convertFolderTreeNode(node anime.AnimeFolderTreeNode) AnimeFolderTreeNode {
	children := make([]AnimeFolderTreeNode, 0, len(node.Children))
	for _, child := range node.Children {
		children = append(children, convertFolderTreeNode(child))
	}
	return AnimeFolderTreeNode{
		ID:         node.ID,
		Name:       node.Name,
		ImageCount: node.ImageCount,
		Children:   children,
	}
}

// MoveFilesToSeason moves the specified image files to a different season folder.
// It validates that the target folder is a directory, all file IDs are images,
// and no filename conflicts exist in the target folder.
func (s *AnimeService) MoveFilesToSeason(ctx context.Context, fileIDs []uint, targetFolderID uint) error {
	if len(fileIDs) == 0 {
		return fmt.Errorf("%w: fileIDs must not be empty", ErrInvalidArgument)
	}
	if targetFolderID == 0 {
		return fmt.Errorf("%w: targetFolderID must not be zero", ErrInvalidArgument)
	}

	fileClient := s.dbClient.File()

	// Validate target folder exists and is a directory.
	targetFolder, err := fileClient.FindByValue(ctx, &db.File{ID: targetFolderID})
	if err != nil {
		return fmt.Errorf("target folder not found: %w", err)
	}
	if targetFolder.Type != db.FileTypeDirectory {
		return fmt.Errorf("%w: target (id=%d) is not a directory", ErrInvalidArgument, targetFolderID)
	}

	// Validate all file IDs exist and are images.
	images, err := fileClient.FindImageFilesByIDs(fileIDs)
	if err != nil {
		return fmt.Errorf("FindImageFilesByIDs: %w", err)
	}
	if len(images) != len(fileIDs) {
		return fmt.Errorf("%w: some file IDs do not exist or are not images", ErrInvalidArgument)
	}

	// Check for name conflicts in the target folder.
	existingChildren, err := fileClient.FindFilesByParentIDs([]uint{targetFolderID})
	if err != nil {
		return fmt.Errorf("FindFilesByParentIDs: %w", err)
	}
	existingNames := make(map[string]struct{}, len(existingChildren))
	for _, child := range existingChildren {
		existingNames[child.Name] = struct{}{}
	}
	for _, img := range images {
		// Skip conflict check if the image is already in the target folder.
		if img.ParentID == targetFolderID {
			continue
		}
		if _, exists := existingNames[img.Name]; exists {
			return fmt.Errorf("%w: file %q already exists in target folder", ErrInvalidArgument, img.Name)
		}
	}

	// Move the files.
	return fileClient.MoveFiles(ctx, fileIDs, targetFolderID)
}

// GetImageTagIDs returns a map from image ID to the list of tag IDs for each image.
// This is used by the frontend to filter images by tags on the anime detail page.
func (s *AnimeService) GetImageTagIDs(ctx context.Context, imageIDs []uint) (map[uint][]uint, error) {
	if len(imageIDs) == 0 {
		return nil, nil
	}
	fileTags, err := s.dbClient.FileTag().FindAllByFileID(imageIDs)
	if err != nil {
		return nil, fmt.Errorf("FileTag.FindAllByFileID: %w", err)
	}
	result := make(map[uint][]uint, len(imageIDs))
	for _, ft := range fileTags {
		result[ft.FileID] = append(result[ft.FileID], ft.TagID)
	}
	return result, nil
}

// ImportFolderAsAnime creates a new anime from an existing top-level folder.
func (s *AnimeService) ImportFolderAsAnime(ctx context.Context, folderID uint) (Anime, error) {
	a, err := s.core.ImportFolderAsAnime(ctx, folderID)
	if err != nil {
		return Anime{}, err
	}
	return Anime{ID: a.ID, Name: a.Name}, nil
}

// ImportMultipleFoldersAsAnime creates a new anime for each of the given
// folder IDs. Each folder becomes its own anime.
func (s *AnimeService) ImportMultipleFoldersAsAnime(ctx context.Context, folderIDs []uint) ([]Anime, error) {
	results, err := s.core.ImportMultipleFoldersAsAnime(ctx, folderIDs)
	if err != nil {
		return nil, err
	}
	out := make([]Anime, len(results))
	for i, a := range results {
		out[i] = Anime{ID: a.ID, Name: a.Name}
	}
	return out, nil
}

// ListUnassignedTopFolders returns top-level folders that are not assigned to
// any anime and are candidates for import.
func (s *AnimeService) ListUnassignedTopFolders(ctx context.Context) ([]UnassignedFolder, error) {
	dirs, err := s.core.ListUnassignedTopFolders()
	if err != nil {
		return nil, err
	}
	result := make([]UnassignedFolder, 0, len(dirs))
	for _, d := range dirs {
		result = append(result, UnassignedFolder{
			ID:   d.ID,
			Name: d.Name,
		})
	}
	sort.SliceStable(result, func(i, j int) bool {
		return strings.ToLower(result[i].Name) < strings.ToLower(result[j].Name)
	})
	return result, nil
}

// GetFolderImages returns images for a specific folder in an anime's tree.
// When recursive is true, images from descendant folders are included.
func (s *AnimeService) GetFolderImages(ctx context.Context, folderID uint, recursive bool) (SearchImagesResponse, error) {
	if folderID == 0 {
		return SearchImagesResponse{}, fmt.Errorf("%w: folderID required", ErrInvalidArgument)
	}
	imageIDs, err := s.core.GetFolderImageIDs(folderID, recursive)
	if err != nil {
		return SearchImagesResponse{}, err
	}
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

// GetAnimeSeasons returns the structured seasons for an anime.
func (s *AnimeService) GetAnimeSeasons(animeID uint) ([]AnimeSeasonInfo, error) {
	seasons, err := s.core.GetAnimeSeasons(animeID)
	if err != nil {
		return nil, err
	}
	return convertSeasons(seasons), nil
}

// CreateAnimeSeason creates a new season (season, movie, other) under an anime.
func (s *AnimeService) CreateAnimeSeason(ctx context.Context, animeID uint, seasonType string, seasonNumber *uint, displayName string) (AnimeSeasonInfo, error) {
	season, err := s.core.CreateSeason(ctx, animeID, seasonType, seasonNumber, displayName)
	if err != nil {
		return AnimeSeasonInfo{}, err
	}
	return convertSeason(season), nil
}

// CreateSubSeason creates a child folder under an existing season.
func (s *AnimeService) CreateSubSeason(ctx context.Context, parentSeasonID uint, name string) (AnimeSeasonInfo, error) {
	season, err := s.core.CreateSubSeason(ctx, parentSeasonID, name)
	if err != nil {
		return AnimeSeasonInfo{}, err
	}
	return convertSeason(season), nil
}

// RenameSeason renames a season.
func (s *AnimeService) RenameSeason(ctx context.Context, seasonID uint, newName string) error {
	return s.core.RenameSeason(ctx, seasonID, newName)
}

// DeleteSeason deletes a season and all descendants.
func (s *AnimeService) DeleteSeason(ctx context.Context, seasonID uint) error {
	return s.core.DeleteSeason(ctx, seasonID)
}

// UpdateSeasonType updates season type and season number on an existing season.
func (s *AnimeService) UpdateSeasonType(ctx context.Context, seasonID uint, seasonType string, seasonNumber *uint) error {
	return s.core.UpdateSeasonType(ctx, seasonID, seasonType, seasonNumber)
}

// UpdateSeasonAiringInfo updates the airing season and year on a season.
func (s *AnimeService) UpdateSeasonAiringInfo(seasonID uint, airingSeason string, airingYear uint) error {
	return s.core.UpdateSeasonAiringInfo(context.Background(), seasonID, airingSeason, airingYear)
}

// GetNextSeasonNumber returns the next season number for the given type.
func (s *AnimeService) GetNextSeasonNumber(animeID uint, seasonType string) (uint, error) {
	return s.core.NextSeasonNumber(animeID, seasonType)
}

// SearchAniList searches for anime on AniList.
func (s *AnimeService) SearchAniList(ctx context.Context, query string) ([]AniListSearchResult, error) {
	results, err := s.core.SearchAniList(ctx, query)
	if err != nil {
		return nil, err
	}
	out := make([]AniListSearchResult, len(results))
	for i, r := range results {
		coverURL := r.CoverImage.Large
		if coverURL == "" {
			coverURL = r.CoverImage.Medium
		}
		out[i] = AniListSearchResult{
			ID:            r.ID,
			TitleRomaji:   r.Title.Romaji,
			TitleEnglish:  r.Title.English,
			TitleNative:   r.Title.Native,
			Format:        r.Format,
			Status:        r.Status,
			Season:        r.Season,
			SeasonYear:    r.SeasonYear,
			Episodes:      r.Episodes,
			CoverImageURL: coverURL,
		}
	}
	return out, nil
}

// ImportFromAniList imports seasons and characters from AniList.
func (s *AnimeService) ImportFromAniList(ctx context.Context, animeID uint, aniListID int) (AniListImportResult, error) {
	result, err := s.core.ImportFromAniList(ctx, animeID, aniListID)
	if err != nil {
		return AniListImportResult{}, err
	}
	return AniListImportResult{
		SeasonsCreated:    result.SeasonsCreated,
		CharactersCreated: result.CharactersCreated,
	}, nil
}

func convertSeasons(seasons []anime.AnimeSeason) []AnimeSeasonInfo {
	if seasons == nil {
		return nil
	}
	result := make([]AnimeSeasonInfo, len(seasons))
	for i, e := range seasons {
		result[i] = convertSeason(e)
	}
	return result
}

func convertSeason(e anime.AnimeSeason) AnimeSeasonInfo {
	children := make([]AnimeSeasonInfo, 0, len(e.Children))
	for _, c := range e.Children {
		children = append(children, convertSeason(c))
	}
	return AnimeSeasonInfo{
		ID:           e.ID,
		Name:         e.Name,
		SeasonType:   e.SeasonType,
		SeasonNumber: e.SeasonNumber,
		AiringSeason: e.AiringSeason,
		AiringYear:   e.AiringYear,
		ImageCount:   e.ImageCount,
		Children:     children,
	}
}
