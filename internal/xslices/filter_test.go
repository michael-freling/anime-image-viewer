package xslices

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestFilter(t *testing.T) {
	testCases := []struct {
		name      string
		elements  []int
		predicate func(int) bool
		want      []int
	}{
		{
			name:     "filter even numbers",
			elements: []int{1, 2, 3, 4, 5, 6},
			predicate: func(n int) bool {
				return n%2 == 0
			},
			want: []int{2, 4, 6},
		},
		{
			name:     "filter positive numbers",
			elements: []int{-3, -2, -1, 0, 1, 2, 3},
			predicate: func(n int) bool {
				return n > 0
			},
			want: []int{1, 2, 3},
		},
		{
			name:     "no elements match",
			elements: []int{1, 2, 3},
			predicate: func(n int) bool {
				return n > 10
			},
			want: []int{},
		},
		{
			name:     "all elements match",
			elements: []int{1, 2, 3},
			predicate: func(n int) bool {
				return n > 0
			},
			want: []int{1, 2, 3},
		},
		{
			name:     "empty slice",
			elements: []int{},
			predicate: func(n int) bool {
				return true
			},
			want: []int{},
		},
		{
			name:     "nil slice",
			elements: nil,
			predicate: func(n int) bool {
				return true
			},
			want: []int{},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			got := Filter(tc.elements, tc.predicate)
			assert.Equal(t, tc.want, got)
		})
	}
}

func TestFilter_strings(t *testing.T) {
	elements := []string{"apple", "banana", "avocado", "blueberry", "apricot"}
	got := Filter(elements, func(s string) bool {
		return len(s) > 0 && s[0] == 'a'
	})
	assert.Equal(t, []string{"apple", "avocado", "apricot"}, got)
}
