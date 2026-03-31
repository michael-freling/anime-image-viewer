package xslices

import (
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestMap(t *testing.T) {
	testCases := []struct {
		name     string
		elements []int
		f        func(int) int
		want     []int
	}{
		{
			name:     "double values",
			elements: []int{1, 2, 3, 4, 5},
			f: func(n int) int {
				return n * 2
			},
			want: []int{2, 4, 6, 8, 10},
		},
		{
			name:     "square values",
			elements: []int{1, 2, 3},
			f: func(n int) int {
				return n * n
			},
			want: []int{1, 4, 9},
		},
		{
			name:     "empty slice",
			elements: []int{},
			f: func(n int) int {
				return n
			},
			want: []int{},
		},
		{
			name:     "nil slice",
			elements: nil,
			f: func(n int) int {
				return n
			},
			want: []int{},
		},
		{
			name:     "single element",
			elements: []int{42},
			f: func(n int) int {
				return n + 1
			},
			want: []int{43},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			got := Map(tc.elements, tc.f)
			assert.Equal(t, tc.want, got)
		})
	}
}

func TestMap_intToString(t *testing.T) {
	elements := []int{1, 2, 3}
	got := Map(elements, func(n int) string {
		return fmt.Sprintf("item-%d", n)
	})
	assert.Equal(t, []string{"item-1", "item-2", "item-3"}, got)
}

func TestMap_structToField(t *testing.T) {
	type item struct {
		ID   uint
		Name string
	}
	elements := []item{
		{ID: 1, Name: "a"},
		{ID: 2, Name: "b"},
		{ID: 3, Name: "c"},
	}
	got := Map(elements, func(i item) uint {
		return i.ID
	})
	assert.Equal(t, []uint{1, 2, 3}, got)
}

func TestMap_preservesOrder(t *testing.T) {
	elements := []int{5, 3, 1, 4, 2}
	got := Map(elements, func(n int) int {
		return n * 10
	})
	assert.Equal(t, []int{50, 30, 10, 40, 20}, got)
}
