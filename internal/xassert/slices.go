package xassert

import (
	"testing"

	"github.com/google/go-cmp/cmp"
)

func ElementsMatch[T any](t *testing.T, want, got []T, options ...cmp.Option) {
	t.Helper()

	if diff := cmp.Diff(want, got, options...); diff != "" {
		t.Errorf("Elements do not match. Diff: %s", diff)
	}
}
