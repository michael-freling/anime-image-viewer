package tag

type tagBuilder struct {
	tags map[uint]*Tag
}

func newTagBuilder() *tagBuilder {
	return &tagBuilder{
		tags: make(map[uint]*Tag),
	}
}

func (b *tagBuilder) add(tag Tag) *tagBuilder {
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

func (b tagBuilder) build(id uint) Tag {
	return *b.tags[id]
}
