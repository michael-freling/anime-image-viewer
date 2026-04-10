package frontend

import (
	"context"
	"errors"
	"testing"

	animecore "github.com/michael-freling/anime-image-viewer/internal/anime"
	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/michael-freling/anime-image-viewer/internal/image"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAnimeService_CRUD(t *testing.T) {
	tester := newTester(t)
	tester.dbClient.Truncate(t, db.File{}, db.Tag{}, db.Anime{}, db.FileTag{})
	svc := tester.getAnimeService()
	ctx := context.Background()

	created, err := svc.CreateAnime(ctx, "Bocchi the Rock!")
	require.NoError(t, err)
	assert.NotZero(t, created.ID)
	assert.Equal(t, "Bocchi the Rock!", created.Name)

	renamed, err := svc.RenameAnime(ctx, created.ID, "Bocchi")
	require.NoError(t, err)
	assert.Equal(t, "Bocchi", renamed.Name)

	list, err := svc.ListAnime(ctx)
	require.NoError(t, err)
	require.Len(t, list, 1)
	assert.Equal(t, "Bocchi", list[0].Name)
	assert.Equal(t, uint(0), list[0].ImageCount)

	require.NoError(t, svc.DeleteAnime(ctx, created.ID))

	list, err = svc.ListAnime(ctx)
	require.NoError(t, err)
	assert.Empty(t, list)

	t.Run("create empty name rejected", func(t *testing.T) {
		_, err := svc.CreateAnime(ctx, "   ")
		require.Error(t, err)
	})

	t.Run("rename missing id rejected", func(t *testing.T) {
		_, err := svc.RenameAnime(ctx, 99999, "x")
		require.Error(t, err)
		assert.ErrorIs(t, err, animecore.ErrAnimeNotFound)
	})

	t.Run("delete missing id rejected", func(t *testing.T) {
		err := svc.DeleteAnime(ctx, 99999)
		require.Error(t, err)
		assert.ErrorIs(t, err, animecore.ErrAnimeNotFound)
	})
}

func TestAnimeService_ListAnime_Sorted(t *testing.T) {
	tester := newTester(t)
	tester.dbClient.Truncate(t, db.File{}, db.Tag{}, db.Anime{}, db.FileTag{})
	svc := tester.getAnimeService()
	ctx := context.Background()

	for _, n := range []string{"Charlie", "alpha", "Bravo"} {
		_, err := svc.CreateAnime(ctx, n)
		require.NoError(t, err)
	}

	list, err := svc.ListAnime(ctx)
	require.NoError(t, err)
	require.Len(t, list, 3)
	assert.Equal(t, "alpha", list[0].Name)
	assert.Equal(t, "Bravo", list[1].Name)
	assert.Equal(t, "Charlie", list[2].Name)
}

func TestAnimeService_ListAnime_Empty(t *testing.T) {
	tester := newTester(t)
	tester.dbClient.Truncate(t, db.File{}, db.Tag{}, db.Anime{}, db.FileTag{})
	svc := tester.getAnimeService()
	ctx := context.Background()

	list, err := svc.ListAnime(ctx)
	require.NoError(t, err)
	assert.Empty(t, list)
}

func TestAnimeService_DerivedTags(t *testing.T) {
	tester := newTester(t)
	tester.dbClient.Truncate(t, db.File{}, db.Tag{}, db.Anime{}, db.FileTag{})
	svc := tester.getAnimeService()
	ctx := context.Background()

	a, err := svc.CreateAnime(ctx, "Show")
	require.NoError(t, err)

	// Create images in the anime's auto-created root folder
	coreSvc := tester.getAnimeCoreService()
	rootDir, err := coreSvc.FindAnimeRootFolder(a.ID)
	require.NoError(t, err)
	require.NotNil(t, rootDir)

	fileCreator := tester.newFileCreator(t).
		CreateDirectory(image.Directory{ID: 7010, ParentID: rootDir.ID, Name: "s1"})
	fileCreator.CreateImage(image.ImageFile{ID: 7100, ParentID: rootDir.ID, Name: "img1.jpg"}, image.TestImageFileJpeg)
	fileCreator.CreateImage(image.ImageFile{ID: 7101, ParentID: 7010, Name: "img2.jpg"}, image.TestImageFileJpeg)
	fileCreator.CreateImage(image.ImageFile{ID: 7102, ParentID: 7010, Name: "img3.jpg"}, image.TestImageFileJpeg)

	files := []db.File{
		fileCreator.BuildDBDirectory(7010),
		fileCreator.BuildDBImageFile(7100),
		fileCreator.BuildDBImageFile(7101),
		fileCreator.BuildDBImageFile(7102),
	}
	db.LoadTestData(t, tester.dbClient, files)

	// Create tags and assign them to images via FileTag
	tag1 := db.Tag{ID: 7000, Name: "charlie"}
	tag2 := db.Tag{ID: 7001, Name: "Alpha"}
	tag3 := db.Tag{ID: 7002, Name: "bravo"}
	require.NoError(t, db.Create(tester.dbClient.Client, &tag1))
	require.NoError(t, db.Create(tester.dbClient.Client, &tag2))
	require.NoError(t, db.Create(tester.dbClient.Client, &tag3))

	fileTags := []db.FileTag{
		{FileID: 7100, TagID: tag1.ID, AddedBy: db.FileTagAddedByUser},
		{FileID: 7101, TagID: tag1.ID, AddedBy: db.FileTagAddedByUser},
		{FileID: 7101, TagID: tag2.ID, AddedBy: db.FileTagAddedByUser},
		{FileID: 7102, TagID: tag3.ID, AddedBy: db.FileTagAddedByUser},
	}
	db.LoadTestData(t, tester.dbClient, fileTags)

	details, err := svc.GetAnimeDetails(ctx, a.ID)
	require.NoError(t, err)
	require.Len(t, details.Tags, 3)
	// sorted case-insensitive: Alpha, bravo, charlie
	assert.Equal(t, "Alpha", details.Tags[0].Name)
	assert.Equal(t, uint(1), details.Tags[0].ImageCount)
	assert.Equal(t, "bravo", details.Tags[1].Name)
	assert.Equal(t, uint(1), details.Tags[1].ImageCount)
	assert.Equal(t, "charlie", details.Tags[2].Name)
	assert.Equal(t, uint(2), details.Tags[2].ImageCount) // img1 + img2

	t.Run("anime with no tagged images returns empty tags", func(t *testing.T) {
		b, err := svc.CreateAnime(ctx, "NoTags")
		require.NoError(t, err)
		details, err := svc.GetAnimeDetails(ctx, b.ID)
		require.NoError(t, err)
		assert.Empty(t, details.Tags)
	})
}

func TestAnimeService_FolderAssignmentsAndAncestor(t *testing.T) {
	tester := newTester(t)
	tester.dbClient.Truncate(t, db.File{}, db.Tag{}, db.Anime{}, db.FileTag{})
	svc := tester.getAnimeService()
	ctx := context.Background()

	a, err := svc.CreateAnime(ctx, "Show")
	require.NoError(t, err)

	fileCreator := tester.newFileCreator(t).
		CreateDirectory(image.Directory{ID: 8001, Name: "show"}).
		CreateDirectory(image.Directory{ID: 8002, ParentID: 8001, Name: "season1"})
	files := []db.File{
		fileCreator.BuildDBDirectory(8001),
		fileCreator.BuildDBDirectory(8002),
	}
	db.LoadTestData(t, tester.dbClient, files)

	require.NoError(t, svc.AssignFolderToAnime(ctx, a.ID, 8001))

	t.Run("ancestor blocks descendant assignment", func(t *testing.T) {
		err := svc.AssignFolderToAnime(ctx, a.ID, 8002)
		require.Error(t, err)
		assert.ErrorIs(t, err, animecore.ErrAnimeAncestorAssigned)
	})

	t.Run("folder map exposes inheritance", func(t *testing.T) {
		statuses, err := svc.GetFolderAnimeMap(ctx)
		require.NoError(t, err)
		require.Contains(t, statuses, uint(8001))
		assert.Equal(t, a.ID, statuses[8001].AnimeID)
		assert.True(t, statuses[8001].Stored)
		assert.False(t, statuses[8001].Inherited)
		require.Contains(t, statuses, uint(8002))
		assert.Equal(t, a.ID, statuses[8002].AnimeID)
		assert.False(t, statuses[8002].Stored)
		assert.True(t, statuses[8002].Inherited)
	})

	t.Run("unassign folder", func(t *testing.T) {
		require.NoError(t, svc.UnassignFolderFromAnime(ctx, 8001))
		statuses, err := svc.GetFolderAnimeMap(ctx)
		require.NoError(t, err)
		assert.NotContains(t, statuses, uint(8001))
	})
}

func TestAnimeService_GetAnimeDetails_NoFolder(t *testing.T) {
	tester := newTester(t)
	tester.dbClient.Truncate(t, db.File{}, db.Tag{}, db.Anime{}, db.FileTag{})
	ctx := context.Background()

	// Create an anime row directly without a folder
	animeRow := db.Anime{Name: "OrphanAnime"}
	require.NoError(t, db.Create(tester.dbClient.Client, &animeRow))

	svc := tester.getAnimeService()
	details, err := svc.GetAnimeDetails(ctx, animeRow.ID)
	require.NoError(t, err)
	assert.Equal(t, "OrphanAnime", details.Anime.Name)
	assert.Empty(t, details.Folders)
	assert.Nil(t, details.FolderTree)
	assert.Empty(t, details.Tags)
}

func TestAnimeService_GetFolderAnimeMap_Empty(t *testing.T) {
	tester := newTester(t)
	tester.dbClient.Truncate(t, db.File{}, db.Tag{}, db.Anime{}, db.FileTag{})
	svc := tester.getAnimeService()

	statuses, err := svc.GetFolderAnimeMap(context.Background())
	require.NoError(t, err)
	assert.Nil(t, statuses)
}

func TestAnimeService_GetAnimeDetails_NotFound(t *testing.T) {
	tester := newTester(t)
	tester.dbClient.Truncate(t, db.File{}, db.Tag{}, db.Anime{}, db.FileTag{})
	svc := tester.getAnimeService()

	_, err := svc.GetAnimeDetails(context.Background(), 99999)
	require.Error(t, err)
	assert.True(t, errors.Is(err, animecore.ErrAnimeNotFound))
}

func TestAnimeService_GetAnimeDetails_FoldersAndCounts(t *testing.T) {
	tester := newTester(t)
	tester.dbClient.Truncate(t, db.File{}, db.Tag{}, db.Anime{}, db.FileTag{})
	svc := tester.getAnimeService()
	ctx := context.Background()

	a, err := svc.CreateAnime(ctx, "Show")
	require.NoError(t, err)

	// Create also auto-creates a root folder "Show" with anime_id set.
	// Add two additional top-level folders assigned to the anime, with
	// intentionally unsorted names so the folder sort comparator is exercised.
	fileCreator := tester.newFileCreator(t).
		CreateDirectory(image.Directory{ID: 8101, Name: "zeta"}).
		CreateDirectory(image.Directory{ID: 8102, ParentID: 8101, Name: "season1"}).
		CreateDirectory(image.Directory{ID: 8120, Name: "alpha"})
	fileCreator.CreateImage(image.ImageFile{ID: 8110, ParentID: 8101, Name: "image.jpg"}, image.TestImageFileJpeg)
	fileCreator.CreateImage(image.ImageFile{ID: 8111, ParentID: 8102, Name: "image.jpg"}, image.TestImageFileJpeg)
	fileCreator.CreateImage(image.ImageFile{ID: 8112, ParentID: 8102, Name: "image2.jpg"}, image.TestImageFileJpeg)
	fileCreator.CreateImage(image.ImageFile{ID: 8121, ParentID: 8120, Name: "image.jpg"}, image.TestImageFileJpeg)

	files := []db.File{
		fileCreator.BuildDBDirectory(8101),
		fileCreator.BuildDBDirectory(8102),
		fileCreator.BuildDBDirectory(8120),
		fileCreator.BuildDBImageFile(8110),
		fileCreator.BuildDBImageFile(8111),
		fileCreator.BuildDBImageFile(8112),
		fileCreator.BuildDBImageFile(8121),
	}
	db.LoadTestData(t, tester.dbClient, files)

	require.NoError(t, svc.AssignFolderToAnime(ctx, a.ID, 8101))
	require.NoError(t, svc.AssignFolderToAnime(ctx, a.ID, 8120))

	details, err := svc.GetAnimeDetails(ctx, a.ID)
	require.NoError(t, err)
	// 3 folders: auto-created "Show" root + manually assigned "alpha" + "zeta"
	require.Len(t, details.Folders, 3)
	// sorted alphabetically (case-insensitive): alpha, Show, zeta
	assert.Equal(t, uint(8120), details.Folders[0].ID)
	assert.Equal(t, "alpha", details.Folders[0].Name)
	assert.Equal(t, uint(1), details.Folders[0].ImageCount)
	assert.Equal(t, "Show", details.Folders[1].Name)
	assert.Equal(t, uint(0), details.Folders[1].ImageCount) // auto-created, no images
	assert.Equal(t, uint(8101), details.Folders[2].ID)
	assert.Equal(t, "zeta", details.Folders[2].Name)
	assert.Equal(t, uint(3), details.Folders[2].ImageCount)

	list, err := svc.ListAnime(ctx)
	require.NoError(t, err)
	require.Len(t, list, 1)
	assert.Equal(t, uint(4), list[0].ImageCount)
}

func TestAnimeService_SearchImagesByAnime(t *testing.T) {
	tester := newTester(t)
	tester.dbClient.Truncate(t, db.File{}, db.Tag{}, db.Anime{}, db.FileTag{})
	svc := tester.getAnimeService()
	ctx := context.Background()

	a, err := svc.CreateAnime(ctx, "Show")
	require.NoError(t, err)

	fileCreator := tester.newFileCreator(t).
		CreateDirectory(image.Directory{ID: 8201, Name: "show"}).
		CreateDirectory(image.Directory{ID: 8202, ParentID: 8201, Name: "season1"})
	fileCreator.CreateImage(image.ImageFile{ID: 8210, ParentID: 8201, Name: "image.jpg"}, image.TestImageFileJpeg)
	fileCreator.CreateImage(image.ImageFile{ID: 8211, ParentID: 8202, Name: "image.jpg"}, image.TestImageFileJpeg)

	files := []db.File{
		fileCreator.BuildDBDirectory(8201),
		fileCreator.BuildDBDirectory(8202),
		fileCreator.BuildDBImageFile(8210),
		fileCreator.BuildDBImageFile(8211),
	}
	db.LoadTestData(t, tester.dbClient, files)
	require.NoError(t, svc.AssignFolderToAnime(ctx, a.ID, 8201))

	resp, err := svc.SearchImagesByAnime(ctx, a.ID)
	require.NoError(t, err)
	require.Len(t, resp.Images, 2)

	t.Run("zero anime id rejected", func(t *testing.T) {
		_, err := svc.SearchImagesByAnime(ctx, 0)
		require.Error(t, err)
		assert.ErrorIs(t, err, ErrInvalidArgument)
	})

	t.Run("unknown anime", func(t *testing.T) {
		_, err := svc.SearchImagesByAnime(ctx, 99999)
		require.Error(t, err)
		assert.True(t, errors.Is(err, animecore.ErrAnimeNotFound))
	})

	t.Run("anime with no folders returns empty", func(t *testing.T) {
		empty, err := svc.CreateAnime(ctx, "EmptyShow")
		require.NoError(t, err)
		resp, err := svc.SearchImagesByAnime(ctx, empty.ID)
		require.NoError(t, err)
		assert.Empty(t, resp.Images)
	})
}

func TestAnimeService_SearchImagesUnassigned(t *testing.T) {
	tester := newTester(t)
	tester.dbClient.Truncate(t, db.File{}, db.Tag{}, db.Anime{}, db.FileTag{})
	svc := tester.getAnimeService()
	ctx := context.Background()

	a, err := svc.CreateAnime(ctx, "Show")
	require.NoError(t, err)

	fileCreator := tester.newFileCreator(t).
		CreateDirectory(image.Directory{ID: 8301, Name: "show"}).
		CreateDirectory(image.Directory{ID: 8302, Name: "other"})
	fileCreator.CreateImage(image.ImageFile{ID: 8310, ParentID: 8301, Name: "image.jpg"}, image.TestImageFileJpeg)
	fileCreator.CreateImage(image.ImageFile{ID: 8311, ParentID: 8302, Name: "image.jpg"}, image.TestImageFileJpeg)

	files := []db.File{
		fileCreator.BuildDBDirectory(8301),
		fileCreator.BuildDBDirectory(8302),
		fileCreator.BuildDBImageFile(8310),
		fileCreator.BuildDBImageFile(8311),
	}
	db.LoadTestData(t, tester.dbClient, files)
	require.NoError(t, svc.AssignFolderToAnime(ctx, a.ID, 8301))

	resp, err := svc.SearchImagesUnassigned(ctx)
	require.NoError(t, err)
	require.Len(t, resp.Images, 1)
	assert.Equal(t, uint(8311), resp.Images[0].ID)
}

func TestAnimeService_SearchImagesUnassigned_Empty(t *testing.T) {
	tester := newTester(t)
	tester.dbClient.Truncate(t, db.File{}, db.Tag{}, db.Anime{}, db.FileTag{})
	svc := tester.getAnimeService()

	resp, err := svc.SearchImagesUnassigned(context.Background())
	require.NoError(t, err)
	assert.Empty(t, resp.Images)
}

func TestAnimeService_ImportFolderAsAnime(t *testing.T) {
	tester := newTester(t)
	tester.dbClient.Truncate(t, db.File{}, db.Tag{}, db.Anime{}, db.FileTag{})
	svc := tester.getAnimeService()
	ctx := context.Background()

	// Create an unassigned top-level folder
	fileCreator := tester.newFileCreator(t).
		CreateDirectory(image.Directory{ID: 9001, Name: "ImportMe"})
	files := []db.File{fileCreator.BuildDBDirectory(9001)}
	db.LoadTestData(t, tester.dbClient, files)

	imported, err := svc.ImportFolderAsAnime(ctx, 9001)
	require.NoError(t, err)
	assert.NotZero(t, imported.ID)
	assert.Equal(t, "ImportMe", imported.Name)

	// Verify the anime appears in the list
	list, err := svc.ListAnime(ctx)
	require.NoError(t, err)
	found := false
	for _, item := range list {
		if item.Name == "ImportMe" {
			found = true
		}
	}
	assert.True(t, found)
}

func TestAnimeService_ListUnassignedTopFolders(t *testing.T) {
	tester := newTester(t)
	tester.dbClient.Truncate(t, db.File{}, db.Tag{}, db.Anime{}, db.FileTag{})
	svc := tester.getAnimeService()
	ctx := context.Background()

	// Create an anime (auto-creates assigned folder)
	_, err := svc.CreateAnime(ctx, "Assigned")
	require.NoError(t, err)

	// Create unassigned folders
	fileCreator := tester.newFileCreator(t).
		CreateDirectory(image.Directory{ID: 9101, Name: "FolderB"}).
		CreateDirectory(image.Directory{ID: 9102, Name: "FolderA"})
	files := []db.File{
		fileCreator.BuildDBDirectory(9101),
		fileCreator.BuildDBDirectory(9102),
	}
	db.LoadTestData(t, tester.dbClient, files)

	folders, err := svc.ListUnassignedTopFolders(ctx)
	require.NoError(t, err)
	require.Len(t, folders, 2)
	// sorted alphabetically
	assert.Equal(t, "FolderA", folders[0].Name)
	assert.Equal(t, "FolderB", folders[1].Name)
}

func TestAnimeService_ListUnassignedTopFolders_Empty(t *testing.T) {
	tester := newTester(t)
	tester.dbClient.Truncate(t, db.File{}, db.Tag{}, db.Anime{}, db.FileTag{})
	svc := tester.getAnimeService()

	folders, err := svc.ListUnassignedTopFolders(context.Background())
	require.NoError(t, err)
	assert.Empty(t, folders)
}

func TestAnimeService_GetAnimeDetails_FolderTree(t *testing.T) {
	tester := newTester(t)
	tester.dbClient.Truncate(t, db.File{}, db.Tag{}, db.Anime{}, db.FileTag{})
	svc := tester.getAnimeService()
	ctx := context.Background()

	a, err := svc.CreateAnime(ctx, "TreeShow")
	require.NoError(t, err)

	// The auto-created root folder has anime_id set. Find it so we can
	// create subfolders under it.
	coreSvc := tester.getAnimeCoreService()
	rootDir, err := coreSvc.FindAnimeRootFolder(a.ID)
	require.NoError(t, err)
	require.NotNil(t, rootDir)

	// Create subfolder with its own child (exercises convertFolderTreeNode recursion)
	fileCreator := tester.newFileCreator(t).
		CreateDirectory(image.Directory{ID: 9301, ParentID: rootDir.ID, Name: "Season 1"}).
		CreateDirectory(image.Directory{ID: 9302, ParentID: 9301, Name: "Part 1"})
	fileCreator.CreateImage(image.ImageFile{ID: 9310, ParentID: rootDir.ID, Name: "root.jpg"}, image.TestImageFileJpeg)
	fileCreator.CreateImage(image.ImageFile{ID: 9311, ParentID: 9301, Name: "s1.jpg"}, image.TestImageFileJpeg)

	files := []db.File{
		fileCreator.BuildDBDirectory(9301),
		fileCreator.BuildDBDirectory(9302),
		fileCreator.BuildDBImageFile(9310),
		fileCreator.BuildDBImageFile(9311),
	}
	db.LoadTestData(t, tester.dbClient, files)

	details, err := svc.GetAnimeDetails(ctx, a.ID)
	require.NoError(t, err)

	// Verify folderTree is populated with hierarchy
	require.NotNil(t, details.FolderTree)
	assert.Equal(t, rootDir.ID, details.FolderTree.ID)
	assert.Equal(t, "TreeShow", details.FolderTree.Name)
	assert.Equal(t, uint(1), details.FolderTree.ImageCount) // 1 direct image

	require.Len(t, details.FolderTree.Children, 1)
	assert.Equal(t, "Season 1", details.FolderTree.Children[0].Name)
	assert.Equal(t, uint(1), details.FolderTree.Children[0].ImageCount)

	require.Len(t, details.FolderTree.Children[0].Children, 1)
	assert.Equal(t, "Part 1", details.FolderTree.Children[0].Children[0].Name)
	assert.Equal(t, uint(0), details.FolderTree.Children[0].Children[0].ImageCount)
}

func TestAnimeService_ImportFolderAsAnime_Error(t *testing.T) {
	tester := newTester(t)
	tester.dbClient.Truncate(t, db.File{}, db.Tag{}, db.Anime{}, db.FileTag{})
	svc := tester.getAnimeService()
	ctx := context.Background()

	// Try to import a non-existent folder
	_, err := svc.ImportFolderAsAnime(ctx, 99999)
	require.Error(t, err)
}

func TestAnimeService_ImportMultipleFoldersAsAnime(t *testing.T) {
	tester := newTester(t)
	tester.dbClient.Truncate(t, db.File{}, db.Tag{}, db.Anime{}, db.FileTag{})
	svc := tester.getAnimeService()
	ctx := context.Background()

	fileCreator := tester.newFileCreator(t).
		CreateDirectory(image.Directory{ID: 9501, Name: "ShowX"}).
		CreateDirectory(image.Directory{ID: 9502, Name: "ShowY"})
	files := []db.File{
		fileCreator.BuildDBDirectory(9501),
		fileCreator.BuildDBDirectory(9502),
	}
	db.LoadTestData(t, tester.dbClient, files)

	results, err := svc.ImportMultipleFoldersAsAnime(ctx, []uint{9501, 9502})
	require.NoError(t, err)
	require.Len(t, results, 2)
	assert.Equal(t, "ShowX", results[0].Name)
	assert.Equal(t, "ShowY", results[1].Name)

	// Verify they appear in the list
	list, err := svc.ListAnime(ctx)
	require.NoError(t, err)
	names := make([]string, 0, len(list))
	for _, item := range list {
		names = append(names, item.Name)
	}
	assert.Contains(t, names, "ShowX")
	assert.Contains(t, names, "ShowY")

	t.Run("empty list rejected", func(t *testing.T) {
		_, err := svc.ImportMultipleFoldersAsAnime(ctx, nil)
		require.Error(t, err)
	})

	t.Run("error on non-existent folder", func(t *testing.T) {
		_, err := svc.ImportMultipleFoldersAsAnime(ctx, []uint{99999})
		require.Error(t, err)
	})
}

func TestAnimeService_GetFolderImages(t *testing.T) {
	tester := newTester(t)
	tester.dbClient.Truncate(t, db.File{}, db.Tag{}, db.Anime{}, db.FileTag{})
	svc := tester.getAnimeService()
	ctx := context.Background()

	a, err := svc.CreateAnime(ctx, "Show")
	require.NoError(t, err)

	// Use explicit IDs and fileCreator to create directories with proper disk paths
	fileCreator := tester.newFileCreator(t).
		CreateDirectory(image.Directory{ID: 9601, Name: "show"}).
		CreateDirectory(image.Directory{ID: 9602, ParentID: 9601, Name: "s1"})
	fileCreator.CreateImage(image.ImageFile{ID: 9610, ParentID: 9601, Name: "root.jpg"}, image.TestImageFileJpeg)
	fileCreator.CreateImage(image.ImageFile{ID: 9611, ParentID: 9602, Name: "s1.jpg"}, image.TestImageFileJpeg)

	files := []db.File{
		fileCreator.BuildDBDirectory(9601),
		fileCreator.BuildDBDirectory(9602),
		fileCreator.BuildDBImageFile(9610),
		fileCreator.BuildDBImageFile(9611),
	}
	db.LoadTestData(t, tester.dbClient, files)
	require.NoError(t, svc.AssignFolderToAnime(ctx, a.ID, 9601))

	t.Run("returns direct images only (non-recursive)", func(t *testing.T) {
		resp, err := svc.GetFolderImages(ctx, 9601, false)
		require.NoError(t, err)
		assert.Len(t, resp.Images, 1)
	})

	t.Run("returns all images (recursive)", func(t *testing.T) {
		resp, err := svc.GetFolderImages(ctx, 9601, true)
		require.NoError(t, err)
		assert.Len(t, resp.Images, 2)
	})

	t.Run("subfolder returns its images", func(t *testing.T) {
		resp, err := svc.GetFolderImages(ctx, 9602, false)
		require.NoError(t, err)
		assert.Len(t, resp.Images, 1)
	})

	t.Run("zero folder id rejected", func(t *testing.T) {
		_, err := svc.GetFolderImages(ctx, 0, false)
		require.Error(t, err)
		assert.ErrorIs(t, err, ErrInvalidArgument)
	})

	t.Run("empty folder returns empty", func(t *testing.T) {
		fc := tester.newFileCreator(t).
			CreateDirectory(image.Directory{ID: 9650, Name: "empty"})
		db.LoadTestData(t, tester.dbClient, []db.File{fc.BuildDBDirectory(9650)})

		resp, err := svc.GetFolderImages(ctx, 9650, false)
		require.NoError(t, err)
		assert.Empty(t, resp.Images)
	})
}
