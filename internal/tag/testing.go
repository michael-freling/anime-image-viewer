package tag

import "github.com/michael-freling/anime-image-viewer/internal/db"

type TestTagBuilder struct {
	tags map[uint]*Tag
}

func NewTestTagBuilder() *TestTagBuilder {
	return &TestTagBuilder{
		tags: make(map[uint]*Tag),
	}
}

func (b *TestTagBuilder) Add(tag Tag) *TestTagBuilder {
	b.tags[tag.ID] = &tag
	return b
}

func (b TestTagBuilder) Build(id uint) Tag {
	return *b.tags[id]
}

func (b TestTagBuilder) BuildDBTag(id uint) db.Tag {
	tag := *b.tags[id]
	return db.Tag{
		ID:   tag.ID,
		Name: tag.Name,
	}
}
