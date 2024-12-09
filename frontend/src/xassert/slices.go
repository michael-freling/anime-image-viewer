package xassert

import (
	"testing"

	"github.com/google/go-cmp/cmp"
	"github.com/stretchr/testify/assert"
)

func ElementsMatch[T any](t *testing.T, want, got []T, options ...cmp.Option) {
	t.Helper()

	if diff := cmp.Diff(got, want, options...); diff != "" {
		assert.Fail(t, "Elements do not match. Diff: %s", diff)
	}
}
