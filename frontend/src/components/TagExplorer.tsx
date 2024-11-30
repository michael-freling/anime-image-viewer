// TreeView hasn't been supported by a Joy UI yet: https://github.com/mui/mui-x/issues/14687
import { SimpleTreeView, TreeItem2 as TreeItem } from "@mui/x-tree-view";
import {
  Tag,
  TagService,
} from "../../bindings/github.com/michael-freling/anime-image-viewer/internal/image";
import { Bookmark, BookmarkBorder } from "@mui/icons-material";
import React, { FC, useEffect, useState } from "react";

const TagTreeItem: FC<{
  tag: Tag;
}> = ({ tag }) => (
  <TreeItem label={tag.Name} itemId={String(tag.ID)}>
    {tag.Children &&
      tag.Children.map((child) => <TagTreeItem key={child.ID} tag={child} />)}
  </TreeItem>
);

interface TagExplorerProps {
  selectTag: (tag: Tag) => Promise<void>;
}

const getTagMap = (tags: Tag[]): { [id: number]: Tag } => {
  const map: { [id: number]: Tag } = {};
  tags.forEach((tag) => {
    map[tag.ID] = tag;
    if (tag.Children) {
      Object.assign(map, getTagMap(tag.Children));
    }
  });
  return map;
};

const TagExplorer: FC<TagExplorerProps> = ({ selectTag }) => {
  const [children, setChildren] = useState<Tag[]>([]);
  const [map, setMap] = useState<{
    [id: number]: Tag;
  }>({});

  useEffect(() => {
    if (children.length > 0) {
      return;
    }

    TagService.GetAll().then(async (tags) => {
      setChildren(tags);
      setMap(getTagMap(tags));
    });
  }, []);

  async function handleSelect(
    event: React.SyntheticEvent,
    itemId: string | null
  ) {
    if (!itemId) {
      return;
    }

    selectTag(map[itemId]);
  }

  return (
    <SimpleTreeView
      defaultExpandedItems={["Tags"]}
      slots={{
        expandIcon: (props) => <Bookmark color="primary" {...props} />,
        collapseIcon: (props) => <BookmarkBorder color="primary" {...props} />,
        endIcon: (props) => <BookmarkBorder color="primary" {...props} />,
      }}
      onSelectedItemsChange={handleSelect}
    >
      <TagTreeItem
        tag={{
          ID: 0,
          Name: "Tags",
          Children: children,
        }}
      />
    </SimpleTreeView>
  );
};
export default TagExplorer;
