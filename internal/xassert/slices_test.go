package xassert

import (
	"testing"

	"github.com/google/go-cmp/cmp/cmpopts"
)

func TestElementsMatch(t *testing.T) {
	testCases := []struct {
		name string
		want []int
		got  []int
	}{
		{
			name: "same order",
			want: []int{1, 2, 3},
			got:  []int{1, 2, 3},
		},
		{
			name: "empty slices",
			want: []int{},
			got:  []int{},
		},
		{
			name: "nil slices",
			want: nil,
			got:  nil,
		},
		{
			name: "single element",
			want: []int{42},
			got:  []int{42},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			ElementsMatch(t, tc.want, tc.got)
		})
	}
}

func TestElementsMatch_withSortOption(t *testing.T) {
	// Elements in different order should match when a sort option is provided
	want := []int{3, 1, 2}
	got := []int{1, 2, 3}
	ElementsMatch(t, want, got, cmpopts.SortSlices(func(a, b int) bool {
		return a < b
	}))
}

func TestElementsMatch_structs(t *testing.T) {
	type item struct {
		ID   uint
		Name string
	}

	want := []item{
		{ID: 2, Name: "b"},
		{ID: 1, Name: "a"},
	}
	got := []item{
		{ID: 1, Name: "a"},
		{ID: 2, Name: "b"},
	}
	ElementsMatch(t, want, got,
		cmpopts.SortSlices(func(a, b item) bool {
			return a.ID < b.ID
		}),
	)
}

func TestElementsMatch_withIgnoreFields(t *testing.T) {
	type item struct {
		ID        uint
		Name      string
		UpdatedAt uint
	}

	want := []item{
		{ID: 1, Name: "a"},
		{ID: 2, Name: "b"},
	}
	got := []item{
		{ID: 1, Name: "a", UpdatedAt: 100},
		{ID: 2, Name: "b", UpdatedAt: 200},
	}
	ElementsMatch(t, want, got,
		cmpopts.IgnoreFields(item{}, "UpdatedAt"),
	)
}

func TestElementsMatch_mismatch(t *testing.T) {
	// Use a fake testing.T to capture failure without failing the real test
	fakeT := &testing.T{}
	want := []int{1, 2, 3}
	got := []int{1, 2, 4}
	ElementsMatch(fakeT, want, got)

	if !fakeT.Failed() {
		t.Error("expected ElementsMatch to report a mismatch, but it did not")
	}
}
