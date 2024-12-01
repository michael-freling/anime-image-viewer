// TreeView hasn't been supported by a Joy UI yet: https://github.com/mui/mui-x/issues/14687
import { Button, Stack, Typography } from "@mui/joy";
import { RichTreeView, TreeViewBaseItem } from "@mui/x-tree-view";
import React, { FC, useEffect, useState } from "react";
import {
  Tag,
  TagService,
} from "../../bindings/github.com/michael-freling/anime-image-viewer/internal/image";
import {
  ExplorerTreeItem,
  ExplorerTreeItemLabel,
  ExplorerTreeItemProps,
} from "./ExplorerTreeItem";

export interface TagExplorerProps {
  editable: boolean;
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

const tagsToTreeViewBaseItems = (tags: Tag[]): TreeViewBaseItem<{}>[] => {
  return tags.map((child) => {
    return {
      id: String(child.ID),
      label: child.Name,
      children: tagsToTreeViewBaseItems(child.Children),
    };
  });
};

const TagExplorer: FC<TagExplorerProps> = ({ editable, selectTag }) => {
  const [children, setChildren] = useState<Tag[]>([]);
  const [map, setMap] = useState<{
    [id: number]: Tag;
  }>({});

  useEffect(() => {
    if (children.length > 0) {
      return;
    }

    refresh();
  }, []);

  async function refresh() {
    const tags = await TagService.GetAll();
    setChildren(tags);
    setMap(getTagMap(tags));
  }

  async function handleSelect(
    event: React.SyntheticEvent,
    itemId: string | null
  ) {
    if (!itemId) {
      return;
    }

    selectTag(map[itemId]);
  }

  const addNewChild = async (parentID: string) => {
    await TagService.Create({
      Name: "New Tag",
      ParentID: parseInt(parentID, 10),
    });
    await refresh();
    // todo: This doesn't add a child tag correctly
    // const newChildren = children.map((child) => {
    //   if (child.ID === parentID) {
    //     child.Children.push(newTag);
    //   }
    //   return child;
    // });
    // setChildren(newChildren);
    // setMap(getTagMap(newChildren));
  };
  const onItemLabelChange = async (itemId, newLabel) => {
    await TagService.UpdateName(parseInt(itemId, 10), newLabel);
    await refresh();
    // The label doesn't add a child tag correctly
    // const newChildren = children.map((child) => {
    //   if (child.ID !== newTag.ID) {
    //     return child;
    //   }
    //   newTag.Children = child.Children;
    //   return newTag;
    // });
    // setChildren(newChildren);
    // setMap(getTagMap(newChildren));
  };

  const rootID = "0";
  return (
    <Stack spacing={2}>
      <Stack
        spacing={2}
        direction="row"
        sx={{
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Typography>Tags</Typography>
        <Stack
          direction="row"
          sx={{
            justifyContent: "flex-end",
          }}
        >
          <Button
            variant="outlined"
            onClick={async () => {
              await TagService.CreateTopTag("New Tag");
              await refresh();
              // This doesn't sort the tags
              // children.push(tag);
              // setChildren(children);
              // setMap(getTagMap(children));
            }}
          >
            Add
          </Button>
        </Stack>
      </Stack>

      <RichTreeView
        expansionTrigger="content"
        defaultExpandedItems={[rootID]}
        slots={{
          // todo: RichTreeView doesn't allow to pass a type other than TreeItem2Props
          item: ExplorerTreeItem as any,
        }}
        slotProps={{
          item: {
            addNewChild,
            labelComponent: ExplorerTreeItemLabel,
          } as ExplorerTreeItemProps,
        }}
        onSelectedItemsChange={handleSelect}
        isItemEditable={() => editable}
        experimentalFeatures={{ labelEditing: editable }}
        items={tagsToTreeViewBaseItems(children)}
        onItemLabelChange={onItemLabelChange}
      />
    </Stack>
  );
};
export default TagExplorer;
