// TreeView hasn't been supported by a Joy UI yet: https://github.com/mui/mui-x/issues/14687
import {
  RichTreeView,
  TreeItem2,
  TreeItem2Label,
  TreeItem2Props,
  TreeViewBaseItem,
  UseTreeItem2LabelSlotOwnProps,
  useTreeItem2Utils,
} from "@mui/x-tree-view";
import {
  Tag,
  TagService,
} from "../../bindings/github.com/michael-freling/anime-image-viewer/internal/image";
import {
  Add,
  Bookmark,
  BookmarkBorder,
  Delete,
  EditOutlined,
} from "@mui/icons-material";
import React, { FC, useEffect, useState } from "react";
import { Button, IconButton, Stack, Typography } from "@mui/joy";

interface TagLabelProps extends UseTreeItem2LabelSlotOwnProps {
  editable: boolean;
  editing: boolean;
  addChild: () => Promise<void>;
  toggleItemEditing: () => void;
}

function TagLabel({
  editing,
  children,
  toggleItemEditing,
  addChild,
  ...other
}: TagLabelProps) {
  return (
    <TreeItem2Label
      {...other}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 2,
        justifyContent: "space-between",
      }}
    >
      {children}
      <Stack direction="row">
        <IconButton variant="outlined" color="primary" onClick={addChild}>
          <Add />
        </IconButton>
        <IconButton
          variant="outlined"
          color="primary"
          onClick={toggleItemEditing}
        >
          <EditOutlined fontSize="small" />
        </IconButton>
        <IconButton variant="outlined" color="danger">
          <Delete />
        </IconButton>
      </Stack>
    </TreeItem2Label>
  );
}

interface TagTreeItemProps extends TreeItem2Props {
  tag: Tag;
  addNewChild: (parentID: number) => Promise<void>;
}

const TagTreeItem = React.forwardRef(function CustomTreeItem(
  { itemId, ...props }: TreeItem2Props,
  ref: React.Ref<HTMLLIElement>
) {
  const { interactions } = useTreeItem2Utils({
    itemId: itemId,
    children: props.children,
  });

  const handleContentDoubleClick: UseTreeItem2LabelSlotOwnProps["onDoubleClick"] =
    (event) => {
      event.defaultMuiPrevented = true;
    };

  const addNewChild = (props as TagTreeItemProps)["addNewChild"];

  return (
    <TreeItem2
      {...props}
      itemId={itemId}
      ref={ref}
      slots={{
        label: TagLabel,
      }}
      slotProps={{
        label: {
          onDoubleClick: handleContentDoubleClick,
          addChild: () => {
            addNewChild(parseInt(itemId, 10));
          },
          toggleItemEditing: interactions.toggleItemEditing,
        } as TagLabelProps,
      }}
    />
  );
});

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

const tagsToTreeViewBaseItems = (
  tags: Tag[],
  addNewChild: (parentID: number) => Promise<void>
): TreeViewBaseItem<{}>[] => {
  return tags.map((child) => {
    return {
      id: String(child.ID),
      label: child.Name,
      children: tagsToTreeViewBaseItems(child.Children, addNewChild),
    };
  });
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

  const addNewChild = async (parentID: number) => {
    await TagService.Create({
      Name: "New Tag",
      ParentID: parentID,
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
          item: TagTreeItem,
          expandIcon: (props) => <Bookmark color="primary" {...props} />,
          collapseIcon: (props) => (
            <BookmarkBorder color="primary" {...props} />
          ),
          endIcon: (props) => <BookmarkBorder color="primary" {...props} />,
        }}
        slotProps={{
          item: {
            addNewChild,
          } as TagTreeItemProps,
        }}
        onSelectedItemsChange={handleSelect}
        isItemEditable={() => true}
        experimentalFeatures={{ labelEditing: true }}
        items={tagsToTreeViewBaseItems(children, addNewChild)}
        onItemLabelChange={onItemLabelChange}
      />
    </Stack>
  );
};
export default TagExplorer;
