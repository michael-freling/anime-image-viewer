package xslices

func Filter[T any](elements []T, f func(T) bool) []T {
	result := make([]T, 0)
	for _, element := range elements {
		if f(element) {
			result = append(result, element)
		}
	}
	return result
}
