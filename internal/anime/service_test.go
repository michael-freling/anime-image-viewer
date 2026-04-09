package anime

import (
	"context"
	"errors"
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

	t.Run("creates a new anime", func(t *testing.T) {
		got, err := svc.Create(ctx, "Bocchi the Rock!")
		require.NoError(t, err)
		assert.NotZero(t, got.ID)
		assert.Equal(t, "Bocchi the Rock!", got.Name)
	})

	t.Run("trims whitespace from name", func(t *testing.T) {
		got, err := svc.Create(ctx, "  Frieren  ")
		require.NoError(t, err)
		assert.Equal(t, "Frieren", got.Name)
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
}

func TestService_Rename(t *testing.T) {
	te := newTester(t)
	svc := te.service()
	ctx := context.Background()

	a, err := svc.Create(ctx, "Original")
	require.NoError(t, err)

	t.Run("renames anime", func(t *testing.T) {
		got, err := svc.Rename(ctx, a.ID, "Renamed")
		require.NoError(t, err)
		assert.Equal(t, "Renamed", got.Name)
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

	t.Run("deletes anime, clears folder anime_id, removes anime_tag rows", func(t *testing.T) {
		a, err := svc.Create(ctx, "DelMe")
		require.NoError(t, err)

		// folder
		animeID := a.ID
		dir := db.File{ID: 4101, Name: "dir", Type: db.FileTypeDirectory, AnimeID: &animeID}
		require.NoError(t, db.Create(te.dbClient.Client, &dir))

		// tag
		tagRow := db.Tag{ID: 4201, Name: "ch1"}
		require.NoError(t, db.Create(te.dbClient.Client, &tagRow))
		require.NoError(t, svc.AssignTag(ctx, a.ID, tagRow.ID))

		// delete
		require.NoError(t, svc.Delete(ctx, a.ID))

		_, err = svc.Read(ctx, a.ID)
		assert.ErrorIs(t, err, ErrAnimeNotFound)

		// folder anime_id cleared
		dirAfter, err := db.FindByValue(te.dbClient.Client, db.File{ID: 4101})
		require.NoError(t, err)
		assert.Nil(t, dirAfter.AnimeID)

		// tag still exists, but anime_tag row is gone
		_, err = db.FindByValue(te.dbClient.Client, db.Tag{ID: 4201})
		require.NoError(t, err)
		ats, err := te.dbClient.AnimeTag().FindAllByAnimeIDs([]uint{a.ID})
		require.NoError(t, err)
		assert.Empty(t, ats)
	})

	t.Run("returns not found for missing id", func(t *testing.T) {
		err := svc.Delete(ctx, 99999)
		require.Error(t, err)
		assert.ErrorIs(t, err, ErrAnimeNotFound)
	})
}

func TestService_AssignTag(t *testing.T) {
	te := newTester(t)
	svc := te.service()
	ctx := context.Background()

	a, err := svc.Create(ctx, "AnimeX")
	require.NoError(t, err)
	tagRow := db.Tag{ID: 6001, Name: "tag1"}
	require.NoError(t, db.Create(te.dbClient.Client, &tagRow))

	t.Run("assigns tag", func(t *testing.T) {
		require.NoError(t, svc.AssignTag(ctx, a.ID, tagRow.ID))
		ats, err := te.dbClient.AnimeTag().FindAllByAnimeIDs([]uint{a.ID})
		require.NoError(t, err)
		require.Len(t, ats, 1)
		assert.Equal(t, tagRow.ID, ats[0].TagID)
	})

	t.Run("re-assigning is a no-op", func(t *testing.T) {
		require.NoError(t, svc.AssignTag(ctx, a.ID, tagRow.ID))
		ats, err := te.dbClient.AnimeTag().FindAllByAnimeIDs([]uint{a.ID})
		require.NoError(t, err)
		assert.Len(t, ats, 1)
	})

	t.Run("rejects unknown anime", func(t *testing.T) {
		err := svc.AssignTag(ctx, 99999, tagRow.ID)
		assert.ErrorIs(t, err, ErrAnimeNotFound)
	})

	t.Run("rejects unknown tag", func(t *testing.T) {
		err := svc.AssignTag(ctx, a.ID, 99999)
		assert.ErrorIs(t, err, xerrors.ErrInvalidArgument)
	})

	t.Run("rejects zero ids", func(t *testing.T) {
		assert.ErrorIs(t, svc.AssignTag(ctx, 0, tagRow.ID), xerrors.ErrInvalidArgument)
		assert.ErrorIs(t, svc.AssignTag(ctx, a.ID, 0), xerrors.ErrInvalidArgument)
	})
}

func TestService_UnassignTag(t *testing.T) {
	te := newTester(t)
	svc := te.service()
	ctx := context.Background()

	a, err := svc.Create(ctx, "AnimeY")
	require.NoError(t, err)
	tagRow := db.Tag{ID: 6101, Name: "tag1"}
	require.NoError(t, db.Create(te.dbClient.Client, &tagRow))
	require.NoError(t, svc.AssignTag(ctx, a.ID, tagRow.ID))

	require.NoError(t, svc.UnassignTag(ctx, a.ID, tagRow.ID))
	ats, err := te.dbClient.AnimeTag().FindAllByAnimeIDs([]uint{a.ID})
	require.NoError(t, err)
	assert.Empty(t, ats)

	t.Run("zero ids rejected", func(t *testing.T) {
		assert.ErrorIs(t, svc.UnassignTag(ctx, 0, tagRow.ID), xerrors.ErrInvalidArgument)
		assert.ErrorIs(t, svc.UnassignTag(ctx, a.ID, 0), xerrors.ErrInvalidArgument)
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

	root := db.File{ID: 6201, ParentID: 0, Name: "Show", Type: db.FileTypeDirectory}
	season1 := db.File{ID: 6202, ParentID: 6201, Name: "S01", Type: db.FileTypeDirectory}
	episode1 := db.File{ID: 6203, ParentID: 6202, Name: "Ep01", Type: db.FileTypeDirectory}
	other := db.File{ID: 6204, ParentID: 0, Name: "OtherTop", Type: db.FileTypeDirectory}
	for _, f := range []db.File{root, season1, episode1, other} {
		require.NoError(t, db.Create(te.dbClient.Client, &f))
	}
	require.NoError(t, svc.AssignFolder(ctx, a.ID, root.ID))

	resolved, err := svc.ResolveFolderAnimeMap()
	require.NoError(t, err)

	// All three (root + descendants) resolve to same anime
	assert.Contains(t, resolved, root.ID)
	assert.Equal(t, a.ID, resolved[root.ID].AnimeID)
	assert.True(t, resolved[root.ID].Stored)

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

	root := db.File{ID: 6301, ParentID: 0, Name: "Show", Type: db.FileTypeDirectory}
	child := db.File{ID: 6302, ParentID: 6301, Name: "S01", Type: db.FileTypeDirectory}
	otherRoot := db.File{ID: 6303, ParentID: 0, Name: "Other", Type: db.FileTypeDirectory}
	imgs := []db.File{
		{ID: 6310, ParentID: 6301, Name: "a.jpg", Type: db.FileTypeImage},
		{ID: 6311, ParentID: 6302, Name: "b.jpg", Type: db.FileTypeImage},
		{ID: 6312, ParentID: 6302, Name: "c.jpg", Type: db.FileTypeImage},
		{ID: 6313, ParentID: 6303, Name: "d.jpg", Type: db.FileTypeImage},
	}
	require.NoError(t, db.Create(te.dbClient.Client, &root))
	require.NoError(t, db.Create(te.dbClient.Client, &child))
	require.NoError(t, db.Create(te.dbClient.Client, &otherRoot))
	for i := range imgs {
		require.NoError(t, db.Create(te.dbClient.Client, &imgs[i]))
	}
	require.NoError(t, svc.AssignFolder(ctx, a.ID, root.ID))
	require.NoError(t, svc.AssignFolder(ctx, other.ID, otherRoot.ID))

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

func TestService_AssignTag_RejectsAfterDuplicate(t *testing.T) {
	te := newTester(t)
	svc := te.service()
	ctx := context.Background()

	a, err := svc.Create(ctx, "Anime")
	require.NoError(t, err)
	tagRow := db.Tag{ID: 9000, Name: "tag"}
	require.NoError(t, db.Create(te.dbClient.Client, &tagRow))

	require.NoError(t, svc.AssignTag(ctx, a.ID, tagRow.ID))
	// duplicate is a no-op
	require.NoError(t, svc.AssignTag(ctx, a.ID, tagRow.ID))
}
