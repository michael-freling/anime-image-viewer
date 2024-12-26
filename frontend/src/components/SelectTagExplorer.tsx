// TreeView hasn't been supported by a Joy UI yet: https://github.com/mui/mui-x/issues/14687
import { Typography } from "@mui/joy";
import { RichTreeView, TreeViewBaseItem } from "@mui/x-tree-view";
import React, { FC, useEffect, useState } from "react";
import {
  ReadTagsByFileIDsResponse,
  Tag,
  TagService,
} from "../../bindings/github.com/michael-freling/anime-image-viewer/internal/image";
import { ExplorerTreeItemWithCheckbox } from "./ExplorerTreeItem";

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
    if (tagStats != undefined && tagStats.TagCounts[child.id] > 0) {
      count = tagStats.TagCounts[child.id];
    }
    let disabled = false;
    if (tagStats != undefined && tagStats.AncestorMap[child.id] != undefined) {
      disabled = true;
    }

    const isAdded = addedTagIds[child.id];
    const isDeleted = deletedTagIds[child.id];

    return {
      id: String(child.id),
      label: child.name,
      children: tagsToTreeViewBaseItems(
        (child.children ?? []).filter((child) => child != null),
        fileCount,
        addedTagIds,
        deletedTagIds,
        tagStats
      ),
      count,
      indeterminate:
        isAdded == undefined &&
        isDeleted == undefined &&
        count > 0 &&
        count < fileCount,
      checked: isAdded || count == fileCount,
      disabled,
    };
  });
};

interface SelectTagExplorerProps {
  onSelect: (addedTagIds: number[], deletedTagIds: number[]) => void;
  fileIds: number[];
}

export const SelectTagExplorer: FC<SelectTagExplorerProps> = ({
  onSelect,
  fileIds,
}) => {
  const [children, setChildren] = useState<Tag[]>([]);
  const [tagStats, setTagStats] = useState<ReadTagsByFileIDsResponse>();
  const [tagStatsLoaded, setTagStatsLoaded] = useState(false);
  const [addedTagIds, setAddedTagIds] = useState<{ [key: number]: boolean }>(
    {}
  );
  const [deletedTagIds, setDeletedTagIds] = useState<{
    [key: number]: boolean;
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
    // setMap(getTagMap(tags));
    if (tagStatsLoaded) {
      return;
    }

    const response = await TagService.ReadTagsByFileIDs(fileIds);
    setTagStats(response);
    setTagStatsLoaded(true);
  }

  if (children.length === 0) {
    return <Typography>Loading...</Typography>;
  }

  const treeItems = tagsToTreeViewBaseItems(
    children,
    fileIds.length,
    addedTagIds,
    deletedTagIds,
    tagStats
  );

  if (!tagStatsLoaded) {
    return <Typography>Loading...</Typography>;
  }

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
      return tagStats?.TagCounts[tagId] == fileIds.length;
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
        item: ExplorerTreeItemWithCheckbox as any,
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
            if (count == fileIds.length) {
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
};

export default SelectTagExplorer;
