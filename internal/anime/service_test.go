package anime

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/michael-freling/anime-image-viewer/internal/image"
	"github.com/michael-freling/anime-image-viewer/internal/xerrors"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestService_Create(t *testing.T) {
	te := newTester(t)
	svc := te.service()
	ctx := context.Background()

	t.Run("creates anime, folder on disk, and db.File record", func(t *testing.T) {
		got, err := svc.Create(ctx, "Bocchi the Rock!")
		require.NoError(t, err)
		assert.NotZero(t, got.ID)
		assert.Equal(t, "Bocchi the Rock!", got.Name)

		// Verify folder on disk
		dirPath := filepath.Join(te.config.ImageRootDirectory, "Bocchi the Rock!")
		info, err := os.Stat(dirPath)
		require.NoError(t, err)
		assert.True(t, info.IsDir())

		// Verify db.File record with anime_id set
		rootFolder, err := svc.FindAnimeRootFolder(got.ID)
		require.NoError(t, err)
		require.NotNil(t, rootFolder)
		assert.Equal(t, "Bocchi the Rock!", rootFolder.Name)
		assert.Equal(t, db.RootDirectoryID, int(rootFolder.ParentID))
		assert.Equal(t, db.FileTypeDirectory, rootFolder.Type)
		require.NotNil(t, rootFolder.AnimeID)
		assert.Equal(t, got.ID, *rootFolder.AnimeID)
	})

	t.Run("trims whitespace from name", func(t *testing.T) {
		got, err := svc.Create(ctx, "  Frieren  ")
		require.NoError(t, err)
		assert.Equal(t, "Frieren", got.Name)

		// Verify folder on disk with trimmed name
		dirPath := filepath.Join(te.config.ImageRootDirectory, "Frieren")
		info, err := os.Stat(dirPath)
		require.NoError(t, err)
		assert.True(t, info.IsDir())
	})

	t.Run("rejects empty name", func(t *testing.T) {
		_, err := svc.Create(ctx, "   ")
		require.Error(t, err)
		assert.ErrorIs(t, err, xerrors.ErrInvalidArgument)
	})

	t.Run("rejects duplicate name", func(t *testing.T) {
		_, err := svc.Create(ctx, "Bocchi the Rock!")
		require.Error(t, err)
		assert.ErrorIs(t, err, ErrAnimeAlreadyExists)
	})

	t.Run("rejects when folder already exists in DB", func(t *testing.T) {
		// Pre-create a db.File to prevent the unique constraint on files
		// from interfering -- the anime row will be created but the
		// file insert will hit the unique constraint first since a file
		// with that name already exists under root.
		preFile := db.File{Name: "PreExisting", ParentID: db.RootDirectoryID, Type: db.FileTypeDirectory}
		require.NoError(t, te.dbClient.File().Create(ctx, &preFile))

		_, err := svc.Create(ctx, "PreExisting")
		require.Error(t, err)
		assert.ErrorIs(t, err, ErrAnimeAlreadyExists)
	})

	t.Run("rejects when folder already exists on disk only", func(t *testing.T) {
		// Create a directory on disk but not in DB. The anime and file rows
		// will be created successfully, but os.Mkdir will fail.
		dirPath := filepath.Join(te.config.ImageRootDirectory, "DiskOnly")
		require.NoError(t, os.Mkdir(dirPath, 0755))

		_, err := svc.Create(ctx, "DiskOnly")
		require.Error(t, err)
		assert.ErrorIs(t, err, ErrAnimeAlreadyExists)
	})
}

func TestService_Rename(t *testing.T) {
	te := newTester(t)
	svc := te.service()
	ctx := context.Background()

	a, err := svc.Create(ctx, "Original")
	require.NoError(t, err)

	t.Run("renames anime and folder on disk", func(t *testing.T) {
		got, err := svc.Rename(ctx, a.ID, "Renamed")
		require.NoError(t, err)
		assert.Equal(t, "Renamed", got.Name)

		// Verify old folder is gone
		_, err = os.Stat(filepath.Join(te.config.ImageRootDirectory, "Original"))
		assert.True(t, os.IsNotExist(err))

		// Verify new folder exists
		info, err := os.Stat(filepath.Join(te.config.ImageRootDirectory, "Renamed"))
		require.NoError(t, err)
		assert.True(t, info.IsDir())

		// Verify db.File record is updated
		rootFolder, err := svc.FindAnimeRootFolder(a.ID)
		require.NoError(t, err)
		require.NotNil(t, rootFolder)
		assert.Equal(t, "Renamed", rootFolder.Name)
	})

	t.Run("rejects empty name", func(t *testing.T) {
		_, err := svc.Rename(ctx, a.ID, "  ")
		require.Error(t, err)
		assert.ErrorIs(t, err, xerrors.ErrInvalidArgument)
	})

	t.Run("rejects unknown id", func(t *testing.T) {
		_, err := svc.Rename(ctx, 99999, "x")
		require.Error(t, err)
		assert.ErrorIs(t, err, ErrAnimeNotFound)
	})

	t.Run("renames anime with no root folder", func(t *testing.T) {
		// Create an anime without a folder
		animeRow := db.Anime{Name: "NoFolderAnime"}
		require.NoError(t, te.dbClient.Anime().Create(ctx, &animeRow))

		got, err := svc.Rename(ctx, animeRow.ID, "RenamedNoFolder")
		require.NoError(t, err)
		assert.Equal(t, "RenamedNoFolder", got.Name)
	})

	t.Run("rejects duplicate name", func(t *testing.T) {
		other, err := svc.Create(ctx, "Other")
		require.NoError(t, err)
		_, err = svc.Rename(ctx, other.ID, "Renamed")
		require.Error(t, err)
		assert.ErrorIs(t, err, ErrAnimeAlreadyExists)
	})
}

func TestService_Delete(t *testing.T) {
	te := newTester(t)
	svc := te.service()
	ctx := context.Background()

	t.Run("deletes anime, folder tree from DB, and folder from disk", func(t *testing.T) {
		a, err := svc.Create(ctx, "DelMe")
		require.NoError(t, err)

		// The root folder was auto-created by Create
		rootFolder, err := svc.FindAnimeRootFolder(a.ID)
		require.NoError(t, err)
		require.NotNil(t, rootFolder)

		// Create a subfolder and image under the root folder
		subDir := db.File{ParentID: rootFolder.ID, Name: "sub", Type: db.FileTypeDirectory}
		require.NoError(t, te.dbClient.File().Create(ctx, &subDir))
		require.NoError(t, os.MkdirAll(filepath.Join(te.config.ImageRootDirectory, "DelMe", "sub"), 0755))

		imgFile := db.File{ParentID: subDir.ID, Name: "img.jpg", Type: db.FileTypeImage}
		require.NoError(t, te.dbClient.File().Create(ctx, &imgFile))

		// Add a file_tag to the image
		ft := db.FileTag{TagID: 1, FileID: imgFile.ID, AddedBy: db.FileTagAddedByUser}
		require.NoError(t, db.Create(te.dbClient.Client, &ft))

		// Verify disk folder exists before delete
		diskPath := filepath.Join(te.config.ImageRootDirectory, "DelMe")
		_, err = os.Stat(diskPath)
		require.NoError(t, err)

		// delete
		require.NoError(t, svc.Delete(ctx, a.ID))

		// anime is gone
		_, err = svc.Read(ctx, a.ID)
		assert.ErrorIs(t, err, ErrAnimeNotFound)

		// root folder is gone from DB
		_, err = db.FindByValue(te.dbClient.Client, db.File{ID: rootFolder.ID})
		assert.ErrorIs(t, err, db.ErrRecordNotFound)

		// subfolder is gone from DB
		_, err = db.FindByValue(te.dbClient.Client, db.File{ID: subDir.ID})
		assert.ErrorIs(t, err, db.ErrRecordNotFound)

		// image file is gone from DB
		_, err = db.FindByValue(te.dbClient.Client, db.File{ID: imgFile.ID})
		assert.ErrorIs(t, err, db.ErrRecordNotFound)

		// file_tag is gone
		fileTags, err := te.dbClient.FileTag().FindAllByFileID([]uint{imgFile.ID})
		require.NoError(t, err)
		assert.Empty(t, fileTags)

		// disk folder is gone
		_, err = os.Stat(diskPath)
		assert.True(t, os.IsNotExist(err))
	})

	t.Run("succeeds even if disk folder is already gone", func(t *testing.T) {
		a, err := svc.Create(ctx, "GhostFolder")
		require.NoError(t, err)

		// Remove the disk folder manually before calling Delete
		diskPath := filepath.Join(te.config.ImageRootDirectory, "GhostFolder")
		require.NoError(t, os.RemoveAll(diskPath))

		require.NoError(t, svc.Delete(ctx, a.ID))

		_, err = svc.Read(ctx, a.ID)
		assert.ErrorIs(t, err, ErrAnimeNotFound)
	})

	t.Run("returns not found for missing id", func(t *testing.T) {
		err := svc.Delete(ctx, 99999)
		require.Error(t, err)
		assert.ErrorIs(t, err, ErrAnimeNotFound)
	})
}

func TestService_AssignFolder(t *testing.T) {
	te := newTester(t)
	svc := te.service()
	ctx := context.Background()

	a, err := svc.Create(ctx, "anime")
	require.NoError(t, err)

	root := db.File{ID: 5101, ParentID: 0, Name: "rootDir", Type: db.FileTypeDirectory}
	child := db.File{ID: 5102, ParentID: 5101, Name: "child", Type: db.FileTypeDirectory}
	grandchild := db.File{ID: 5103, ParentID: 5102, Name: "grandchild", Type: db.FileTypeDirectory}
	other := db.File{ID: 5104, ParentID: 0, Name: "other", Type: db.FileTypeDirectory}
	imgFile := db.File{ID: 5105, ParentID: 0, Name: "img.jpg", Type: db.FileTypeImage}
	for _, f := range []db.File{root, child, grandchild, other, imgFile} {
		require.NoError(t, db.Create(te.dbClient.Client, &f))
	}

	t.Run("assigns root directory", func(t *testing.T) {
		require.NoError(t, svc.AssignFolder(ctx, a.ID, root.ID))
		dir, err := db.FindByValue(te.dbClient.Client, db.File{ID: root.ID})
		require.NoError(t, err)
		require.NotNil(t, dir.AnimeID)
		assert.Equal(t, a.ID, *dir.AnimeID)
	})

	t.Run("rejects descendant when ancestor is assigned", func(t *testing.T) {
		err := svc.AssignFolder(ctx, a.ID, child.ID)
		require.Error(t, err)
		assert.ErrorIs(t, err, ErrAnimeAncestorAssigned)
	})

	t.Run("rejects deep descendant", func(t *testing.T) {
		err := svc.AssignFolder(ctx, a.ID, grandchild.ID)
		require.Error(t, err)
		assert.ErrorIs(t, err, ErrAnimeAncestorAssigned)
	})

	t.Run("can assign sibling top folder", func(t *testing.T) {
		other2, err := svc.Create(ctx, "anime2")
		require.NoError(t, err)
		require.NoError(t, svc.AssignFolder(ctx, other2.ID, other.ID))
	})

	t.Run("rejects non-directory", func(t *testing.T) {
		err := svc.AssignFolder(ctx, a.ID, imgFile.ID)
		require.Error(t, err)
		assert.ErrorIs(t, err, xerrors.ErrInvalidArgument)
	})

	t.Run("rejects unknown folder", func(t *testing.T) {
		err := svc.AssignFolder(ctx, a.ID, 99999)
		require.Error(t, err)
		assert.True(t, errors.Is(err, image.ErrDirectoryNotFound))
	})

	t.Run("rejects unknown anime", func(t *testing.T) {
		err := svc.AssignFolder(ctx, 99999, root.ID)
		require.Error(t, err)
		assert.ErrorIs(t, err, ErrAnimeNotFound)
	})

	t.Run("rejects zero ids", func(t *testing.T) {
		assert.ErrorIs(t, svc.AssignFolder(ctx, 0, root.ID), xerrors.ErrInvalidArgument)
		assert.ErrorIs(t, svc.AssignFolder(ctx, a.ID, 0), xerrors.ErrInvalidArgument)
	})
}

func TestService_UnassignFolder(t *testing.T) {
	te := newTester(t)
	svc := te.service()
	ctx := context.Background()

	a, err := svc.Create(ctx, "anime")
	require.NoError(t, err)
	root := db.File{ID: 5201, ParentID: 0, Name: "rootDir", Type: db.FileTypeDirectory}
	require.NoError(t, db.Create(te.dbClient.Client, &root))
	require.NoError(t, svc.AssignFolder(ctx, a.ID, root.ID))

	require.NoError(t, svc.UnassignFolder(ctx, root.ID))
	dir, err := db.FindByValue(te.dbClient.Client, db.File{ID: root.ID})
	require.NoError(t, err)
	assert.Nil(t, dir.AnimeID)

	t.Run("no-op when already cleared", func(t *testing.T) {
		require.NoError(t, svc.UnassignFolder(ctx, root.ID))
	})

	t.Run("rejects unknown folder", func(t *testing.T) {
		err := svc.UnassignFolder(ctx, 99999)
		require.Error(t, err)
		assert.True(t, errors.Is(err, image.ErrDirectoryNotFound))
	})

	t.Run("rejects zero id", func(t *testing.T) {
		assert.ErrorIs(t, svc.UnassignFolder(ctx, 0), xerrors.ErrInvalidArgument)
	})
}

func TestService_ResolveFolderAnimeMap(t *testing.T) {
	te := newTester(t)
	svc := te.service()
	ctx := context.Background()

	a, err := svc.Create(ctx, "Show")
	require.NoError(t, err)

	// Create auto-creates a root folder; find it
	rootFolder, err := svc.FindAnimeRootFolder(a.ID)
	require.NoError(t, err)
	require.NotNil(t, rootFolder)

	// Create subfolders under the auto-created root
	season1 := db.File{ParentID: rootFolder.ID, Name: "S01", Type: db.FileTypeDirectory}
	require.NoError(t, te.dbClient.File().Create(ctx, &season1))
	require.NoError(t, os.Mkdir(filepath.Join(te.config.ImageRootDirectory, "Show", "S01"), 0755))

	episode1 := db.File{ParentID: season1.ID, Name: "Ep01", Type: db.FileTypeDirectory}
	require.NoError(t, te.dbClient.File().Create(ctx, &episode1))
	require.NoError(t, os.MkdirAll(filepath.Join(te.config.ImageRootDirectory, "Show", "S01", "Ep01"), 0755))

	other := db.File{ParentID: 0, Name: "OtherTop", Type: db.FileTypeDirectory}
	require.NoError(t, te.dbClient.File().Create(ctx, &other))
	require.NoError(t, os.Mkdir(filepath.Join(te.config.ImageRootDirectory, "OtherTop"), 0755))

	resolved, err := svc.ResolveFolderAnimeMap()
	require.NoError(t, err)

	// All three (root + descendants) resolve to same anime
	assert.Contains(t, resolved, rootFolder.ID)
	assert.Equal(t, a.ID, resolved[rootFolder.ID].AnimeID)
	assert.True(t, resolved[rootFolder.ID].Stored)

	assert.Contains(t, resolved, season1.ID)
	assert.Equal(t, a.ID, resolved[season1.ID].AnimeID)
	assert.False(t, resolved[season1.ID].Stored)

	assert.Contains(t, resolved, episode1.ID)
	assert.Equal(t, a.ID, resolved[episode1.ID].AnimeID)

	// Other is unmapped
	_, ok := resolved[other.ID]
	assert.False(t, ok)
}

func TestService_CountImagesForAnimeFolders(t *testing.T) {
	te := newTester(t)
	svc := te.service()
	ctx := context.Background()

	a, err := svc.Create(ctx, "Show")
	require.NoError(t, err)
	other, err := svc.Create(ctx, "Other")
	require.NoError(t, err)

	// Find auto-created root folders
	showRoot, err := svc.FindAnimeRootFolder(a.ID)
	require.NoError(t, err)
	require.NotNil(t, showRoot)
	otherRoot, err := svc.FindAnimeRootFolder(other.ID)
	require.NoError(t, err)
	require.NotNil(t, otherRoot)

	// Create subfolder under Show
	child := db.File{ParentID: showRoot.ID, Name: "S01", Type: db.FileTypeDirectory}
	require.NoError(t, te.dbClient.File().Create(ctx, &child))

	// Create image files
	imgs := []db.File{
		{ParentID: showRoot.ID, Name: "a.jpg", Type: db.FileTypeImage},
		{ParentID: child.ID, Name: "b.jpg", Type: db.FileTypeImage},
		{ParentID: child.ID, Name: "c.jpg", Type: db.FileTypeImage},
		{ParentID: otherRoot.ID, Name: "d.jpg", Type: db.FileTypeImage},
	}
	for i := range imgs {
		require.NoError(t, te.dbClient.File().Create(ctx, &imgs[i]))
	}

	counts, err := svc.CountImagesForAnimeFolders()
	require.NoError(t, err)
	assert.Equal(t, uint(3), counts[a.ID])
	assert.Equal(t, uint(1), counts[other.ID])
}

func TestService_ReadAll(t *testing.T) {
	te := newTester(t)
	svc := te.service()
	ctx := context.Background()

	got, err := svc.ReadAll(ctx)
	require.NoError(t, err)
	assert.Empty(t, got)

	_, err = svc.Create(ctx, "B")
	require.NoError(t, err)
	_, err = svc.Create(ctx, "A")
	require.NoError(t, err)

	got, err = svc.ReadAll(ctx)
	require.NoError(t, err)
	assert.Len(t, got, 2)
}

func TestService_Read(t *testing.T) {
	te := newTester(t)
	svc := te.service()
	ctx := context.Background()

	a, err := svc.Create(ctx, "ReadMe")
	require.NoError(t, err)

	got, err := svc.Read(ctx, a.ID)
	require.NoError(t, err)
	assert.Equal(t, "ReadMe", got.Name)

	_, err = svc.Read(ctx, 99999)
	require.Error(t, err)
	assert.ErrorIs(t, err, ErrAnimeNotFound)
}

func TestService_FindAncestorAnimeID_TopLevel(t *testing.T) {
	te := newTester(t)
	svc := te.service()
	// folder with no parent (parent_id = 0) should return nil
	dir := db.File{ID: 7700, ParentID: 0, Name: "topDir", Type: db.FileTypeDirectory}
	require.NoError(t, db.Create(te.dbClient.Client, &dir))
	got, err := svc.findAncestorAnimeID(dir.ID)
	require.NoError(t, err)
	assert.Nil(t, got)
}

func TestService_FindAncestorAnimeID_MissingParent(t *testing.T) {
	te := newTester(t)
	svc := te.service()
	// folder whose parent id points to a non-existent row should return nil
	dir := db.File{ID: 7800, ParentID: 99999, Name: "orphan", Type: db.FileTypeDirectory}
	require.NoError(t, db.Create(te.dbClient.Client, &dir))
	got, err := svc.findAncestorAnimeID(dir.ID)
	require.NoError(t, err)
	assert.Nil(t, got)
}

func TestService_FindAncestorAnimeID_MissingStartFolder(t *testing.T) {
	te := newTester(t)
	svc := te.service()
	// calling with an id that does not exist at all: walk returns nil
	got, err := svc.findAncestorAnimeID(99999)
	require.NoError(t, err)
	assert.Nil(t, got)
}

func TestIsUniqueViolation(t *testing.T) {
	assert.False(t, isUniqueViolation(nil))
	assert.False(t, isUniqueViolation(errors.New("some other error")))
	assert.True(t, isUniqueViolation(errors.New("UNIQUE constraint failed: anime.name")))
}

func TestService_ImportFolderAsAnime(t *testing.T) {
	te := newTester(t)
	svc := te.service()
	ctx := context.Background()

	// Create an unassigned top-level folder manually (simulating a pre-existing folder)
	folder := db.File{ParentID: 0, Name: "ReZero", Type: db.FileTypeDirectory}
	require.NoError(t, te.dbClient.File().Create(ctx, &folder))
	require.NoError(t, os.Mkdir(filepath.Join(te.config.ImageRootDirectory, "ReZero"), 0755))

	t.Run("imports folder as anime", func(t *testing.T) {
		got, err := svc.ImportFolderAsAnime(ctx, folder.ID)
		require.NoError(t, err)
		assert.NotZero(t, got.ID)
		assert.Equal(t, "ReZero", got.Name)

		// Verify folder now has anime_id set
		dirAfter, err := db.FindByValue(te.dbClient.Client, db.File{ID: folder.ID})
		require.NoError(t, err)
		require.NotNil(t, dirAfter.AnimeID)
		assert.Equal(t, got.ID, *dirAfter.AnimeID)
	})

	t.Run("rejects already-assigned folder", func(t *testing.T) {
		_, err := svc.ImportFolderAsAnime(ctx, folder.ID)
		require.Error(t, err)
		assert.ErrorIs(t, err, ErrAnimeAlreadyExists)
	})

	t.Run("rejects descendant of assigned folder", func(t *testing.T) {
		child := db.File{ParentID: folder.ID, Name: "Season1", Type: db.FileTypeDirectory}
		require.NoError(t, te.dbClient.File().Create(ctx, &child))
		_, err := svc.ImportFolderAsAnime(ctx, child.ID)
		require.Error(t, err)
		assert.ErrorIs(t, err, ErrAnimeAncestorAssigned)
	})

	t.Run("rejects non-directory", func(t *testing.T) {
		img := db.File{ParentID: 0, Name: "img.jpg", Type: db.FileTypeImage}
		require.NoError(t, te.dbClient.File().Create(ctx, &img))
		_, err := svc.ImportFolderAsAnime(ctx, img.ID)
		require.Error(t, err)
		assert.ErrorIs(t, err, xerrors.ErrInvalidArgument)
	})

	t.Run("rejects unknown folder", func(t *testing.T) {
		_, err := svc.ImportFolderAsAnime(ctx, 99999)
		require.Error(t, err)
		assert.ErrorIs(t, err, image.ErrDirectoryNotFound)
	})

	t.Run("rejects zero id", func(t *testing.T) {
		_, err := svc.ImportFolderAsAnime(ctx, 0)
		require.Error(t, err)
		assert.ErrorIs(t, err, xerrors.ErrInvalidArgument)
	})
}

func TestService_ListUnassignedTopFolders(t *testing.T) {
	te := newTester(t)
	svc := te.service()
	ctx := context.Background()

	// Create an anime (auto-creates folder "AssignedShow")
	_, err := svc.Create(ctx, "AssignedShow")
	require.NoError(t, err)

	// Create unassigned top-level folders
	unassigned1 := db.File{ParentID: 0, Name: "UnassignedA", Type: db.FileTypeDirectory}
	require.NoError(t, te.dbClient.File().Create(ctx, &unassigned1))
	require.NoError(t, os.Mkdir(filepath.Join(te.config.ImageRootDirectory, "UnassignedA"), 0755))

	unassigned2 := db.File{ParentID: 0, Name: "UnassignedB", Type: db.FileTypeDirectory}
	require.NoError(t, te.dbClient.File().Create(ctx, &unassigned2))
	require.NoError(t, os.Mkdir(filepath.Join(te.config.ImageRootDirectory, "UnassignedB"), 0755))

	dirs, err := svc.ListUnassignedTopFolders()
	require.NoError(t, err)

	// Should contain only the two unassigned folders (not AssignedShow)
	names := make([]string, 0, len(dirs))
	for _, d := range dirs {
		names = append(names, d.Name)
	}
	assert.Contains(t, names, "UnassignedA")
	assert.Contains(t, names, "UnassignedB")
	assert.NotContains(t, names, "AssignedShow")
}

func TestService_ImportFolderAsAnime_DuplicateName(t *testing.T) {
	te := newTester(t)
	svc := te.service()
	ctx := context.Background()

	// Create an anime named "Existing"
	_, err := svc.Create(ctx, "Existing")
	require.NoError(t, err)

	// Create a folder named "Existing" (different from the auto-created one)
	folder := db.File{ParentID: 0, Name: "Existing2", Type: db.FileTypeDirectory}
	require.NoError(t, te.dbClient.File().Create(ctx, &folder))
	require.NoError(t, os.Mkdir(filepath.Join(te.config.ImageRootDirectory, "Existing2"), 0755))

	// Import succeeds with a different name
	got, err := svc.ImportFolderAsAnime(ctx, folder.ID)
	require.NoError(t, err)
	assert.Equal(t, "Existing2", got.Name)
}

func TestService_ImportFolderAsAnime_DuplicateAnimeName(t *testing.T) {
	te := newTester(t)
	svc := te.service()
	ctx := context.Background()

	// Create anime "Collide" which auto-creates folder "Collide"
	_, err := svc.Create(ctx, "Collide")
	require.NoError(t, err)

	// Manually insert an unassigned folder with a name that matches another
	// anime. We can't name it "Collide" because that already exists in files.
	// Instead, create anime "OtherName" manually, then a folder "OtherName"
	// with a different parent.
	animeRow := db.Anime{Name: "CollideName"}
	require.NoError(t, te.dbClient.Anime().Create(ctx, &animeRow))

	folder := db.File{ParentID: 0, Name: "CollideName", Type: db.FileTypeDirectory}
	require.NoError(t, te.dbClient.File().Create(ctx, &folder))
	require.NoError(t, os.Mkdir(filepath.Join(te.config.ImageRootDirectory, "CollideName"), 0755))

	// Import should fail with unique violation on anime name
	_, err = svc.ImportFolderAsAnime(ctx, folder.ID)
	require.Error(t, err)
	assert.ErrorIs(t, err, ErrAnimeAlreadyExists)
}

func TestService_FindAnimeRootFolder_NoFolder(t *testing.T) {
	te := newTester(t)
	svc := te.service()
	ctx := context.Background()

	// Manually create an anime without auto-creating a folder
	row := db.Anime{Name: "OrphanAnime"}
	require.NoError(t, te.dbClient.Anime().Create(ctx, &row))

	folder, err := svc.FindAnimeRootFolder(row.ID)
	require.NoError(t, err)
	assert.Nil(t, folder)
}

func TestService_ListUnassignedTopFolders_Empty(t *testing.T) {
	te := newTester(t)
	svc := te.service()

	// With no folders at all, should return empty
	dirs, err := svc.ListUnassignedTopFolders()
	require.NoError(t, err)
	assert.Empty(t, dirs)
}

func TestService_GetAnimeFolderTree(t *testing.T) {
	te := newTester(t)
	svc := te.service()
	ctx := context.Background()

	a, err := svc.Create(ctx, "TreeAnime")
	require.NoError(t, err)

	rootFolder, err := svc.FindAnimeRootFolder(a.ID)
	require.NoError(t, err)
	require.NotNil(t, rootFolder)

	// Create subfolders
	season1 := db.File{ParentID: rootFolder.ID, Name: "Season 1", Type: db.FileTypeDirectory}
	require.NoError(t, te.dbClient.File().Create(ctx, &season1))
	part1 := db.File{ParentID: season1.ID, Name: "Part 1", Type: db.FileTypeDirectory}
	require.NoError(t, te.dbClient.File().Create(ctx, &part1))

	// Create images
	img1 := db.File{ParentID: rootFolder.ID, Name: "a.jpg", Type: db.FileTypeImage}
	require.NoError(t, te.dbClient.File().Create(ctx, &img1))
	img2 := db.File{ParentID: season1.ID, Name: "b.jpg", Type: db.FileTypeImage}
	require.NoError(t, te.dbClient.File().Create(ctx, &img2))

	tree, err := svc.GetAnimeFolderTree(a.ID)
	require.NoError(t, err)
	require.NotNil(t, tree)

	assert.Equal(t, rootFolder.ID, tree.ID)
	assert.Equal(t, "TreeAnime", tree.Name)
	assert.Equal(t, uint(1), tree.ImageCount) // 1 direct image

	require.Len(t, tree.Children, 1)
	assert.Equal(t, "Season 1", tree.Children[0].Name)
	assert.Equal(t, uint(1), tree.Children[0].ImageCount)

	require.Len(t, tree.Children[0].Children, 1)
	assert.Equal(t, "Part 1", tree.Children[0].Children[0].Name)

	t.Run("returns nil for anime with no folder", func(t *testing.T) {
		// Manually create an anime without a folder (edge case)
		animeRow := db.Anime{Name: "NoFolder"}
		require.NoError(t, te.dbClient.Anime().Create(ctx, &animeRow))
		tree, err := svc.GetAnimeFolderTree(animeRow.ID)
		require.NoError(t, err)
		assert.Nil(t, tree)
	})

	t.Run("returns nil when root folder not reachable from tree root", func(t *testing.T) {
		// Create an anime row and a File row whose ParentID references a
		// non-existent parent. The directory tree builder will not be able
		// to reach this file from root, so FindChildByID returns zero.
		animeRow := db.Anime{Name: "GhostFolder"}
		require.NoError(t, te.dbClient.Anime().Create(ctx, &animeRow))
		ghostID := animeRow.ID
		ghostFile := db.File{Name: "GhostFolder", ParentID: 99999, Type: db.FileTypeDirectory, AnimeID: &ghostID}
		require.NoError(t, te.dbClient.File().Create(ctx, &ghostFile))
		tree, err := svc.GetAnimeFolderTree(animeRow.ID)
		require.NoError(t, err)
		assert.Nil(t, tree)
	})
}

func TestService_ImportMultipleFoldersAsAnime(t *testing.T) {
	te := newTester(t)
	svc := te.service()
	ctx := context.Background()

	// Create unassigned top-level folders
	folder1 := db.File{ParentID: 0, Name: "ShowA", Type: db.FileTypeDirectory}
	require.NoError(t, te.dbClient.File().Create(ctx, &folder1))
	require.NoError(t, os.Mkdir(filepath.Join(te.config.ImageRootDirectory, "ShowA"), 0755))

	folder2 := db.File{ParentID: 0, Name: "ShowB", Type: db.FileTypeDirectory}
	require.NoError(t, te.dbClient.File().Create(ctx, &folder2))
	require.NoError(t, os.Mkdir(filepath.Join(te.config.ImageRootDirectory, "ShowB"), 0755))

	t.Run("imports multiple folders", func(t *testing.T) {
		results, err := svc.ImportMultipleFoldersAsAnime(ctx, []uint{folder1.ID, folder2.ID})
		require.NoError(t, err)
		require.Len(t, results, 2)
		assert.Equal(t, "ShowA", results[0].Name)
		assert.Equal(t, "ShowB", results[1].Name)

		// Verify both folders now have anime_id
		dir1, err := db.FindByValue(te.dbClient.Client, db.File{ID: folder1.ID})
		require.NoError(t, err)
		require.NotNil(t, dir1.AnimeID)

		dir2, err := db.FindByValue(te.dbClient.Client, db.File{ID: folder2.ID})
		require.NoError(t, err)
		require.NotNil(t, dir2.AnimeID)
	})

	t.Run("rejects empty list", func(t *testing.T) {
		_, err := svc.ImportMultipleFoldersAsAnime(ctx, nil)
		require.Error(t, err)
		assert.ErrorIs(t, err, xerrors.ErrInvalidArgument)
	})

	t.Run("rejects zero id in list", func(t *testing.T) {
		_, err := svc.ImportMultipleFoldersAsAnime(ctx, []uint{0})
		require.Error(t, err)
		assert.ErrorIs(t, err, xerrors.ErrInvalidArgument)
	})

	t.Run("rejects already-assigned folder", func(t *testing.T) {
		_, err := svc.ImportMultipleFoldersAsAnime(ctx, []uint{folder1.ID})
		require.Error(t, err)
		assert.ErrorIs(t, err, ErrAnimeAlreadyExists)
	})

	t.Run("rejects unknown folder", func(t *testing.T) {
		_, err := svc.ImportMultipleFoldersAsAnime(ctx, []uint{99999})
		require.Error(t, err)
		assert.ErrorIs(t, err, image.ErrDirectoryNotFound)
	})

	t.Run("rejects non-directory", func(t *testing.T) {
		img := db.File{ParentID: 0, Name: "batch_img.jpg", Type: db.FileTypeImage}
		require.NoError(t, te.dbClient.File().Create(ctx, &img))
		_, err := svc.ImportMultipleFoldersAsAnime(ctx, []uint{img.ID})
		require.Error(t, err)
		assert.ErrorIs(t, err, xerrors.ErrInvalidArgument)
	})

	t.Run("rejects child of assigned folder", func(t *testing.T) {
		child := db.File{ParentID: folder1.ID, Name: "child", Type: db.FileTypeDirectory}
		require.NoError(t, te.dbClient.File().Create(ctx, &child))
		_, err := svc.ImportMultipleFoldersAsAnime(ctx, []uint{child.ID})
		require.Error(t, err)
		assert.ErrorIs(t, err, ErrAnimeAncestorAssigned)
	})
}

func TestService_ImportMultipleFoldersAsAnime_DuplicateName(t *testing.T) {
	te := newTester(t)
	svc := te.service()
	ctx := context.Background()

	// Create an anime named "Clash" first (this also creates a folder named "Clash")
	_, err := svc.Create(ctx, "Clash")
	require.NoError(t, err)

	// Create a folder named "ClashFolder" unassigned. Then manually insert
	// an anime row named "ClashFolder" to simulate a name collision during import.
	folder := db.File{ParentID: 0, Name: "ClashFolder", Type: db.FileTypeDirectory}
	require.NoError(t, te.dbClient.File().Create(ctx, &folder))
	require.NoError(t, os.Mkdir(filepath.Join(te.config.ImageRootDirectory, "ClashFolder"), 0755))

	// Manually create an anime with the same name to cause a unique violation
	clashAnime := db.Anime{Name: "ClashFolder"}
	require.NoError(t, te.dbClient.Anime().Create(ctx, &clashAnime))

	// The import should fail because "ClashFolder" anime already exists
	_, err = svc.ImportMultipleFoldersAsAnime(ctx, []uint{folder.ID})
	require.Error(t, err)
	assert.ErrorIs(t, err, ErrAnimeAlreadyExists)
}

func TestService_DeriveTagsForAnime(t *testing.T) {
	te := newTester(t)
	svc := te.service()
	ctx := context.Background()

	a, err := svc.Create(ctx, "TaggedShow")
	require.NoError(t, err)

	rootFolder, err := svc.FindAnimeRootFolder(a.ID)
	require.NoError(t, err)
	require.NotNil(t, rootFolder)

	// Create subfolder and images
	season1 := db.File{ParentID: rootFolder.ID, Name: "S01", Type: db.FileTypeDirectory}
	require.NoError(t, te.dbClient.File().Create(ctx, &season1))

	img1 := db.File{ParentID: rootFolder.ID, Name: "a.jpg", Type: db.FileTypeImage}
	require.NoError(t, te.dbClient.File().Create(ctx, &img1))

	img2 := db.File{ParentID: season1.ID, Name: "b.jpg", Type: db.FileTypeImage}
	require.NoError(t, te.dbClient.File().Create(ctx, &img2))

	img3 := db.File{ParentID: season1.ID, Name: "c.jpg", Type: db.FileTypeImage}
	require.NoError(t, te.dbClient.File().Create(ctx, &img3))

	// Create tags
	tagA := db.Tag{Name: "tagA"}
	require.NoError(t, db.Create(te.dbClient.Client, &tagA))
	tagB := db.Tag{Name: "tagB"}
	require.NoError(t, db.Create(te.dbClient.Client, &tagB))

	// Assign tags to images via FileTag
	fileTags := []db.FileTag{
		{FileID: img1.ID, TagID: tagA.ID, AddedBy: db.FileTagAddedByUser},
		{FileID: img2.ID, TagID: tagA.ID, AddedBy: db.FileTagAddedByUser},
		{FileID: img2.ID, TagID: tagB.ID, AddedBy: db.FileTagAddedByUser},
		{FileID: img3.ID, TagID: tagB.ID, AddedBy: db.FileTagAddedByUser},
	}
	require.NoError(t, db.BatchCreate(te.dbClient.Client, fileTags))

	derived, err := svc.DeriveTagsForAnime(a.ID)
	require.NoError(t, err)
	require.Len(t, derived, 2)

	// Build a map for easy lookup
	tagMap := make(map[uint]DerivedTagCount)
	for _, d := range derived {
		tagMap[d.TagID] = d
	}

	assert.Equal(t, "tagA", tagMap[tagA.ID].TagName)
	assert.Equal(t, uint(2), tagMap[tagA.ID].ImageCount) // img1 + img2
	assert.Equal(t, "tagB", tagMap[tagB.ID].TagName)
	assert.Equal(t, uint(2), tagMap[tagB.ID].ImageCount) // img2 + img3

	t.Run("returns nil for anime with no images", func(t *testing.T) {
		empty, err := svc.Create(ctx, "EmptyAnime")
		require.NoError(t, err)
		derived, err := svc.DeriveTagsForAnime(empty.ID)
		require.NoError(t, err)
		assert.Nil(t, derived)
	})

	t.Run("returns nil for anime with untagged images", func(t *testing.T) {
		untagged, err := svc.Create(ctx, "UntaggedAnime")
		require.NoError(t, err)
		untaggedRoot, err := svc.FindAnimeRootFolder(untagged.ID)
		require.NoError(t, err)
		require.NotNil(t, untaggedRoot)
		untaggedImg := db.File{ParentID: untaggedRoot.ID, Name: "x.jpg", Type: db.FileTypeImage}
		require.NoError(t, te.dbClient.File().Create(ctx, &untaggedImg))

		derived, err := svc.DeriveTagsForAnime(untagged.ID)
		require.NoError(t, err)
		assert.Nil(t, derived)
	})
}

func TestService_GetFolderImageIDs(t *testing.T) {
	te := newTester(t)
	svc := te.service()
	ctx := context.Background()

	a, err := svc.Create(ctx, "FolderImagesAnime")
	require.NoError(t, err)

	rootFolder, err := svc.FindAnimeRootFolder(a.ID)
	require.NoError(t, err)
	require.NotNil(t, rootFolder)

	// Create subfolder
	season1 := db.File{ParentID: rootFolder.ID, Name: "S01", Type: db.FileTypeDirectory}
	require.NoError(t, te.dbClient.File().Create(ctx, &season1))

	// Create images
	img1 := db.File{ParentID: rootFolder.ID, Name: "root.jpg", Type: db.FileTypeImage}
	require.NoError(t, te.dbClient.File().Create(ctx, &img1))

	img2 := db.File{ParentID: season1.ID, Name: "s01.jpg", Type: db.FileTypeImage}
	require.NoError(t, te.dbClient.File().Create(ctx, &img2))

	img3 := db.File{ParentID: season1.ID, Name: "s01b.jpg", Type: db.FileTypeImage}
	require.NoError(t, te.dbClient.File().Create(ctx, &img3))

	t.Run("non-recursive returns only direct images", func(t *testing.T) {
		ids, err := svc.GetFolderImageIDs(rootFolder.ID, false)
		require.NoError(t, err)
		assert.Len(t, ids, 1)
		assert.Contains(t, ids, img1.ID)
	})

	t.Run("recursive returns all descendant images", func(t *testing.T) {
		ids, err := svc.GetFolderImageIDs(rootFolder.ID, true)
		require.NoError(t, err)
		assert.Len(t, ids, 3)
		assert.Contains(t, ids, img1.ID)
		assert.Contains(t, ids, img2.ID)
		assert.Contains(t, ids, img3.ID)
	})

	t.Run("subfolder non-recursive", func(t *testing.T) {
		ids, err := svc.GetFolderImageIDs(season1.ID, false)
		require.NoError(t, err)
		assert.Len(t, ids, 2)
	})

	t.Run("unknown folder returns error", func(t *testing.T) {
		_, err := svc.GetFolderImageIDs(99999, false)
		require.Error(t, err)
		assert.ErrorIs(t, err, image.ErrDirectoryNotFound)
	})
}
