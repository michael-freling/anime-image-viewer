package xslices

func Map[T, U any](elements []T, f func(T) U) []U {
	result := make([]U, len(elements))
	for index, element := range elements {
		result[index] = f(element)
	}
	return result
}
