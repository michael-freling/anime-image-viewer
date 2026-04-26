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

// AnimeEntryInfo is an entry (season, movie, other) in the anime's folder tree.
type AnimeEntryInfo struct {
	ID           uint             `json:"id"`
	Name         string           `json:"name"`
	EntryType    string           `json:"entryType"`
	EntryNumber  *uint            `json:"entryNumber"`
	AiringSeason string           `json:"airingSeason"`
	AiringYear   *uint            `json:"airingYear"`
	ImageCount   uint             `json:"imageCount"`
	Children     []AnimeEntryInfo `json:"children"`
}

// AnimeDetailsResponse is the payload of the landing page request.
type AnimeDetailsResponse struct {
	Anime      Anime                `json:"anime"`
	Tags       []AnimeTagInfo       `json:"tags"`
	Folders    []AnimeFolderInfo    `json:"folders"`
	FolderTree *AnimeFolderTreeNode `json:"folderTree"`
	Entries    []AnimeEntryInfo     `json:"entries"`
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

	// entries
	coreEntries, err := s.core.GetAnimeEntries(id)
	if err != nil {
		return AnimeDetailsResponse{}, fmt.Errorf("core.GetAnimeEntries: %w", err)
	}
	entryInfos := convertEntries(coreEntries)

	return AnimeDetailsResponse{
		Anime:      Anime{ID: a.ID, Name: a.Name, AniListID: dbAnime.AniListID},
		Tags:       tagInfos,
		Folders:    folderInfos,
		FolderTree: folderTree,
		Entries:    entryInfos,
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

// GetAnimeEntries returns the structured entries for an anime.
func (s *AnimeService) GetAnimeEntries(animeID uint) ([]AnimeEntryInfo, error) {
	entries, err := s.core.GetAnimeEntries(animeID)
	if err != nil {
		return nil, err
	}
	return convertEntries(entries), nil
}

// CreateAnimeEntry creates a new entry (season, movie, other) under an anime.
func (s *AnimeService) CreateAnimeEntry(ctx context.Context, animeID uint, entryType string, entryNumber *uint, displayName string) (AnimeEntryInfo, error) {
	entry, err := s.core.CreateEntry(ctx, animeID, entryType, entryNumber, displayName)
	if err != nil {
		return AnimeEntryInfo{}, err
	}
	return convertEntry(entry), nil
}

// CreateSubEntry creates a child folder under an existing entry.
func (s *AnimeService) CreateSubEntry(ctx context.Context, parentEntryID uint, name string) (AnimeEntryInfo, error) {
	entry, err := s.core.CreateSubEntry(ctx, parentEntryID, name)
	if err != nil {
		return AnimeEntryInfo{}, err
	}
	return convertEntry(entry), nil
}

// RenameEntry renames an entry.
func (s *AnimeService) RenameEntry(ctx context.Context, entryID uint, newName string) error {
	return s.core.RenameEntry(ctx, entryID, newName)
}

// DeleteEntry deletes an entry and all descendants.
func (s *AnimeService) DeleteEntry(ctx context.Context, entryID uint) error {
	return s.core.DeleteEntry(ctx, entryID)
}

// UpdateEntryType updates entry_type and entry_number on an existing entry.
func (s *AnimeService) UpdateEntryType(ctx context.Context, entryID uint, entryType string, entryNumber *uint) error {
	return s.core.UpdateEntryType(ctx, entryID, entryType, entryNumber)
}

// UpdateEntryAiringInfo updates the airing season and year on an entry.
func (s *AnimeService) UpdateEntryAiringInfo(entryID uint, airingSeason string, airingYear uint) error {
	return s.core.UpdateEntryAiringInfo(context.Background(), entryID, airingSeason, airingYear)
}

// GetNextEntryNumber returns the next entry number for the given type.
func (s *AnimeService) GetNextEntryNumber(animeID uint, entryType string) (uint, error) {
	return s.core.NextEntryNumber(animeID, entryType)
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

// ImportFromAniList imports entries and characters from AniList.
func (s *AnimeService) ImportFromAniList(ctx context.Context, animeID uint, aniListID int) (AniListImportResult, error) {
	result, err := s.core.ImportFromAniList(ctx, animeID, aniListID)
	if err != nil {
		return AniListImportResult{}, err
	}
	return AniListImportResult{
		EntriesCreated:    result.EntriesCreated,
		CharactersCreated: result.CharactersCreated,
	}, nil
}

func convertEntries(entries []anime.AnimeEntry) []AnimeEntryInfo {
	if entries == nil {
		return nil
	}
	result := make([]AnimeEntryInfo, len(entries))
	for i, e := range entries {
		result[i] = convertEntry(e)
	}
	return result
}

func convertEntry(e anime.AnimeEntry) AnimeEntryInfo {
	children := make([]AnimeEntryInfo, 0, len(e.Children))
	for _, c := range e.Children {
		children = append(children, convertEntry(c))
	}
	return AnimeEntryInfo{
		ID:           e.ID,
		Name:         e.Name,
		EntryType:    e.EntryType,
		EntryNumber:  e.EntryNumber,
		AiringSeason: e.AiringSeason,
		AiringYear:   e.AiringYear,
		ImageCount:   e.ImageCount,
		Children:     children,
	}
}
