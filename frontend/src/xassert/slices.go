package xassert

import (
	"testing"

	"github.com/google/go-cmp/cmp"
	"github.com/google/go-cmp/cmp/cmpopts"
	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/stretchr/testify/assert"
)

func ElementsMatchIgnoringFields[T any](t *testing.T, want, got []T, sortFunc func(a, b T) bool, ignoreFields ...string) {
	t.Helper()

	options := []cmp.Option{
		cmpopts.SortSlices(sortFunc),
		cmpopts.IgnoreFields(db.FileTag{}, ignoreFields...),
	}
	if diff := cmp.Diff(got, want, options...); diff != "" {
		assert.Fail(t, "Elements do not match. Diff: %s", diff)
	}
}
