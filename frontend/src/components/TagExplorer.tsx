// TreeView hasn't been supported by a Joy UI yet: https://github.com/mui/mui-x/issues/14687
import { Button, Stack, Typography } from "@mui/joy";
import { RichTreeView, TreeViewBaseItem } from "@mui/x-tree-view";
import React, { FC, useEffect, useState } from "react";
import {
  ReadTagsByFileIDsResponse,
  Tag,
  TagService,
} from "../../bindings/github.com/michael-freling/anime-image-viewer/internal/image";
import {
  ExplorerTreeItem,
  ExplorerTreeItemLabel,
  ExplorerTreeItemProps,
} from "./ExplorerTreeItem";
import { useNavigate } from "react-router";

export type TagExplorerProps =
  | {
      title: string;
      editable: boolean;
    }
  | {
      selectable: boolean;
      onSelect: (addedTagIds: number[], deletedTagIds: number[]) => void;
      fileIds: number[];
    };

const tagsToTreeViewBaseItems = (
  tags: Tag[],
  fileCount: number,
  addedTagIds: { [key: number]: boolean },
  deletedTagIds: { [key: number]: boolean },
  tagStats?: ReadTagsByFileIDsResponse
): TreeViewBaseItem<{
  id: string;
  label: string;
  count: number;
  indeterminate: boolean;
  checked: boolean;
}>[] => {
  return tags.map((child) => {
    let count = 0;
    if (tagStats != undefined && tagStats.TagCounts[child.ID] > 0) {
      count = tagStats.TagCounts[child.ID];
    }

    const isAdded = addedTagIds[child.ID];
    const isDeleted = deletedTagIds[child.ID];

    return {
      id: String(child.ID),
      label: child.Name,
      children: tagsToTreeViewBaseItems(
        child.Children,
        fileCount,
        addedTagIds,
        deletedTagIds,
        tagStats
      ),
      count: count,
      indeterminate:
        isAdded == undefined &&
        isDeleted == undefined &&
        count > 0 &&
        count < fileCount,
      checked: isAdded || count == fileCount,
    };
  });
};

const TagExplorer: FC<TagExplorerProps> = (props) => {
  const navigate = useNavigate();
  const [children, setChildren] = useState<Tag[]>([]);
  const [tagStats, setTagStats] = useState<ReadTagsByFileIDsResponse>();
  const [tagStatsLoaded, setTagStatsLoaded] = useState(false);
  const [addedTagIds, setAddedTagIds] = useState<{ [key: number]: boolean }>(
    {}
  );
  const [deletedTagIds, setDeletedTagIds] = useState<{
    [key: number]: boolean;
  }>({});

  const selectable = "selectable" in props;
  useEffect(() => {
    if (children.length > 0) {
      return;
    }

    refresh();
  }, []);

  async function refresh() {
    const tags = await TagService.GetAll();
    setChildren(tags);
    // setMap(getTagMap(tags));
    if (tagStatsLoaded) {
      return;
    }

    if (selectable) {
      const fileIds = props.fileIds;
      const response = await TagService.ReadTagsByFileIDs(fileIds);
      setTagStats(response);
      setTagStatsLoaded(true);
    }
  }

  if (children.length === 0) {
    return <Typography>Loading...</Typography>;
  }

  const treeItems = tagsToTreeViewBaseItems(
    children,
    "fileIds" in props ? props.fileIds.length : 0,
    addedTagIds,
    deletedTagIds,
    tagStats
  );

  if (selectable) {
    if (!tagStatsLoaded) {
      return <Typography>Loading...</Typography>;
    }

    const { onSelect } = props;
    const getAllTreeItemIds = (
      items: TreeViewBaseItem<{
        id: string;
      }>[]
    ): string[] => {
      const itemIds: string[] = [];
      for (let item of items) {
        itemIds.push(item.id);
        if (!item.children) {
          continue;
        }
        itemIds.push(...getAllTreeItemIds(item.children));
      }

      return itemIds;
    };

    const defaultExpandedItems = getAllTreeItemIds(treeItems);
    const defaultSelectedItems = Object.keys(tagStats!.TagCounts).filter(
      (tagId) => {
        return tagStats?.TagCounts[tagId] == props.fileIds.length;
      }
    );
    return (
      <RichTreeView
        sx={{
          flexGrow: 1,
        }}
        expansionTrigger="content"
        defaultExpandedItems={defaultExpandedItems}
        defaultSelectedItems={defaultSelectedItems}
        slots={{
          // todo: RichTreeView doesn't allow to pass a type other than TreeItem2Props
          item: ExplorerTreeItem as any,
        }}
        slotProps={{
          item: {
            labelComponent: ExplorerTreeItemLabel,
            selectable: true,
          } as ExplorerTreeItemProps,
        }}
        onSelectedItemsChange={(
          event: React.SyntheticEvent,
          tagIds: string[]
        ) => {
          if (!tagIds) {
            return;
          }
          let initialSelectedTagIds: string[] = [];
          let initialAllTagIds: string[] = [];
          if (tagStats) {
            for (let [tagId, count] of Object.entries(tagStats.TagCounts)) {
              if (count == props.fileIds.length) {
                initialSelectedTagIds.push(tagId);
              }
              initialAllTagIds.push(tagId);
            }
          }

          const addedTagIds = tagIds
            .filter((tagId) => !initialSelectedTagIds.includes(tagId))
            .map((tagId) => parseInt(tagId, 10));
          const deletedTagIds = initialAllTagIds
            .filter((tagId) => !tagIds.includes(tagId))
            .map((tagId) => parseInt(tagId, 10));
          setAddedTagIds(
            addedTagIds.reduce((acc, tagId) => {
              acc[tagId] = true;
              return acc;
            }, {} as { [key: number]: boolean })
          );
          setDeletedTagIds(
            deletedTagIds.reduce((acc, tagId) => {
              acc[tagId] = true;
              return acc;
            }, {} as { [key: number]: boolean })
          );
          onSelect(addedTagIds, deletedTagIds);
        }}
        items={treeItems}
        multiSelect={true}
        checkboxSelection={true}
      />
    );
  }

  const { title, editable } = props;
  if (editable) {
    const addNewChild = async (parentID: string) => {
      await TagService.Create({
        Name: "New Tag",
        ParentID: parseInt(parentID, 10),
      });
      // todo: Update only added tag
      await refresh();
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
          <Typography>{title}</Typography>
          {!editable ? null : (
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
                  // todo: Update only added tag
                  await refresh();
                }}
              >
                Add
              </Button>
            </Stack>
          )}
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
              selectable: false,
            } as ExplorerTreeItemProps,
          }}
          isItemEditable={() => true}
          experimentalFeatures={{ labelEditing: true }}
          items={treeItems}
          onItemLabelChange={async (itemId, newLabel) => {
            await TagService.UpdateName(parseInt(itemId, 10), newLabel);
            // todo: Update only changed tag
            await refresh();
          }}
        />
      </Stack>
    );
  }

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
        <Typography>{title}</Typography>
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
            labelComponent: ExplorerTreeItemLabel,
            selectable: false,
          } as ExplorerTreeItemProps,
        }}
        onSelectedItemsChange={(
          event: React.SyntheticEvent,
          tagId: string | null
        ) => {
          if (!tagId) {
            return;
          }

          navigate(`/tags/${tagId}`);
        }}
        items={treeItems}
      />
    </Stack>
  );
};
export default TagExplorer;
