package tag

type TestTagBuilder struct {
	tags map[uint]*Tag
}

func NewTestTagBuilder() *TestTagBuilder {
	return &TestTagBuilder{
		tags: make(map[uint]*Tag),
	}
}

func (b *TestTagBuilder) Add(tag Tag) *TestTagBuilder {
	if tag.ParentID != 0 {
		parent := b.tags[tag.ParentID]
		tag.parent = parent
		tag.FullName = parent.FullName + " > " + tag.Name

		if parent.Children == nil {
			parent.Children = []*Tag{}
		}
		parent.Children = append(parent.Children, &tag)
	}
	if tag.FullName == "" {
		tag.FullName = tag.Name
	}

	b.tags[tag.ID] = &tag
	return b
}

func (b TestTagBuilder) Build(id uint) Tag {
	return *b.tags[id]
}
