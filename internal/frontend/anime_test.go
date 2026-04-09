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
	tester.dbClient.Truncate(t, db.File{}, db.Tag{}, db.Anime{}, db.AnimeTag{}, db.FileTag{})
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
	tester.dbClient.Truncate(t, db.File{}, db.Tag{}, db.Anime{}, db.AnimeTag{}, db.FileTag{})
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
	tester.dbClient.Truncate(t, db.File{}, db.Tag{}, db.Anime{}, db.AnimeTag{}, db.FileTag{})
	svc := tester.getAnimeService()
	ctx := context.Background()

	list, err := svc.ListAnime(ctx)
	require.NoError(t, err)
	assert.Empty(t, list)
}

func TestAnimeService_TagAssignments(t *testing.T) {
	tester := newTester(t)
	tester.dbClient.Truncate(t, db.File{}, db.Tag{}, db.Anime{}, db.AnimeTag{}, db.FileTag{})
	svc := tester.getAnimeService()
	ctx := context.Background()

	a, err := svc.CreateAnime(ctx, "Show")
	require.NoError(t, err)
	// Three tags in intentionally unsorted order so we exercise the
	// case-insensitive sort in GetAnimeDetails.
	tag1 := db.Tag{ID: 7000, Name: "charlie"}
	tag2 := db.Tag{ID: 7001, Name: "Alpha"}
	tag3 := db.Tag{ID: 7002, Name: "bravo"}
	require.NoError(t, db.Create(tester.dbClient.Client, &tag1))
	require.NoError(t, db.Create(tester.dbClient.Client, &tag2))
	require.NoError(t, db.Create(tester.dbClient.Client, &tag3))

	// Assign a FileTag row so GetAnimeDetails returns a non-zero image count
	// for the tag (exercises the FileTag lookup loop branch).
	require.NoError(t, db.Create(tester.dbClient.Client, &db.FileTag{
		FileID: 7100,
		TagID:  tag1.ID,
	}))

	require.NoError(t, svc.AssignTagToAnime(ctx, a.ID, tag1.ID))
	require.NoError(t, svc.AssignTagToAnime(ctx, a.ID, tag2.ID))
	require.NoError(t, svc.AssignTagToAnime(ctx, a.ID, tag3.ID))

	details, err := svc.GetAnimeDetails(ctx, a.ID)
	require.NoError(t, err)
	require.Len(t, details.Tags, 3)
	assert.Equal(t, "Alpha", details.Tags[0].Name)
	assert.Equal(t, "bravo", details.Tags[1].Name)
	assert.Equal(t, "charlie", details.Tags[2].Name)
	assert.Equal(t, uint(1), details.Tags[2].ImageCount)

	require.NoError(t, svc.UnassignTagFromAnime(ctx, a.ID, tag1.ID))
	require.NoError(t, svc.UnassignTagFromAnime(ctx, a.ID, tag2.ID))
	require.NoError(t, svc.UnassignTagFromAnime(ctx, a.ID, tag3.ID))

	details, err = svc.GetAnimeDetails(ctx, a.ID)
	require.NoError(t, err)
	assert.Empty(t, details.Tags)
}

func TestAnimeService_FolderAssignmentsAndAncestor(t *testing.T) {
	tester := newTester(t)
	tester.dbClient.Truncate(t, db.File{}, db.Tag{}, db.Anime{}, db.AnimeTag{}, db.FileTag{})
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

func TestAnimeService_GetFolderAnimeMap_Empty(t *testing.T) {
	tester := newTester(t)
	tester.dbClient.Truncate(t, db.File{}, db.Tag{}, db.Anime{}, db.AnimeTag{}, db.FileTag{})
	svc := tester.getAnimeService()

	statuses, err := svc.GetFolderAnimeMap(context.Background())
	require.NoError(t, err)
	assert.Nil(t, statuses)
}

func TestAnimeService_GetAnimeDetails_NotFound(t *testing.T) {
	tester := newTester(t)
	tester.dbClient.Truncate(t, db.File{}, db.Tag{}, db.Anime{}, db.AnimeTag{}, db.FileTag{})
	svc := tester.getAnimeService()

	_, err := svc.GetAnimeDetails(context.Background(), 99999)
	require.Error(t, err)
	assert.True(t, errors.Is(err, animecore.ErrAnimeNotFound))
}

func TestAnimeService_GetAnimeDetails_FoldersAndCounts(t *testing.T) {
	tester := newTester(t)
	tester.dbClient.Truncate(t, db.File{}, db.Tag{}, db.Anime{}, db.AnimeTag{}, db.FileTag{})
	svc := tester.getAnimeService()
	ctx := context.Background()

	a, err := svc.CreateAnime(ctx, "Show")
	require.NoError(t, err)

	// Two top-level folders both mapped to the anime, with intentionally
	// unsorted names so the folder sort comparator is exercised.
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
	require.Len(t, details.Folders, 2)
	// sorted alphabetically (case-insensitive)
	assert.Equal(t, uint(8120), details.Folders[0].ID)
	assert.Equal(t, "alpha", details.Folders[0].Name)
	assert.Equal(t, uint(1), details.Folders[0].ImageCount)
	assert.Equal(t, uint(8101), details.Folders[1].ID)
	assert.Equal(t, "zeta", details.Folders[1].Name)
	assert.Equal(t, uint(3), details.Folders[1].ImageCount)

	list, err := svc.ListAnime(ctx)
	require.NoError(t, err)
	require.Len(t, list, 1)
	assert.Equal(t, uint(4), list[0].ImageCount)
}

func TestAnimeService_SearchImagesByAnime(t *testing.T) {
	tester := newTester(t)
	tester.dbClient.Truncate(t, db.File{}, db.Tag{}, db.Anime{}, db.AnimeTag{}, db.FileTag{})
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
	tester.dbClient.Truncate(t, db.File{}, db.Tag{}, db.Anime{}, db.AnimeTag{}, db.FileTag{})
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
	tester.dbClient.Truncate(t, db.File{}, db.Tag{}, db.Anime{}, db.AnimeTag{}, db.FileTag{})
	svc := tester.getAnimeService()

	resp, err := svc.SearchImagesUnassigned(context.Background())
	require.NoError(t, err)
	assert.Empty(t, resp.Images)
}
