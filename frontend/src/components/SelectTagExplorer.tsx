// TreeView hasn't been supported by a Joy UI yet: https://github.com/mui/mui-x/issues/14687
import { Typography } from "@mui/joy";
import { RichTreeView, TreeViewBaseItem } from "@mui/x-tree-view";
import React, { FC, useEffect, useState } from "react";
import {
  ReadTagsByFileIDsResponse,
  Tag,
  TagFrontendService,
} from "../../bindings/github.com/michael-freling/anime-image-viewer/internal/tag";
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
  count?: number;
  indeterminate: boolean;
  checked: boolean;
}>[] => {
  return tags.map((child) => {
    const isAdded = addedTagIds[child.id];
    const isDeleted = deletedTagIds[child.id];

    let count: number | undefined = undefined;
    let disabled = false;
    let indeterminate = false;
    if (tagStats != undefined) {
      count = 0;
      const tagCount = tagStats.TagCounts[child.id];
      if (tagCount != null && tagCount > 0) {
        count = tagCount;
        indeterminate =
          isAdded == undefined &&
          isDeleted == undefined &&
          tagCount < fileCount;
      }
      if (tagStats.AncestorMap[child.id] != undefined) {
        disabled = true;
      }
    }

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
      indeterminate,
      checked: isAdded || count == fileCount,
      disabled,
    };
  });
};

const getTagMap = (tags: Tag[]): { [id: number]: Tag } => {
  const map: { [id: number]: Tag } = {};
  tags.forEach((tag) => {
    map[tag.id] = tag;
    Object.assign(
      map,
      getTagMap((tag.children || []).filter((child) => child != null))
    );
  });
  return map;
};

type SelectTagExplorerProps =
  | {
      isMultiSelect: true;
      onSelect: (addedTagIds: number[], deletedTagIds: number[]) => void;
      fileIds: number[];
    }
  | {
      isMultiSelect: false;
      onSelect: (tag: Tag | null) => void;
    };

export const SelectTagExplorer: FC<SelectTagExplorerProps> = ({
  isMultiSelect,
  onSelect,
  ...props
}) => {
  const [children, setChildren] = useState<Tag[]>([]);
  const [tagMap, setTagMap] = useState<{ [id: number]: Tag }>({});
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

  let fileIds: number[];
  let onSelectedItemsChange;
  if (isMultiSelect) {
    fileIds = (props as { fileIds: number[] }).fileIds;
    onSelectedItemsChange = (event: React.SyntheticEvent, tagIds: string[]) => {
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
    };
  } else {
    fileIds = [];
    onSelectedItemsChange = (
      event: React.SyntheticEvent,
      tagId: string | null
    ) => {
      if (!tagId) {
        onSelect(null);
        return;
      }

      onSelect(tagMap[parseInt(tagId, 10)]);
    };
  }

  async function refresh() {
    const tags = await TagFrontendService.GetAll();
    setChildren(tags);
    setTagMap(getTagMap(tags));

    if (tagStatsLoaded) {
      return;
    }

    if (isMultiSelect) {
      const response = await TagFrontendService.ReadTagsByFileIDs(fileIds);
      setTagStats(response);
    }
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

  const defaultSelectedItems =
    tagStats != undefined
      ? Object.keys(tagStats.TagCounts).filter((tagId) => {
          return tagStats?.TagCounts[tagId] == fileIds.length;
        })
      : [];
  // selected items should be visible as default.
  // So, we need to expand all parent items of selected items.
  let defaultExpandedItems: string[] = [];
  for (let selectedItemId of defaultSelectedItems) {
    let selectedItemIdInt = parseInt(selectedItemId);
    let selectedTag = tagMap[selectedItemIdInt];
    while (true) {
      defaultExpandedItems.push(String(selectedTag.id));
      if (selectedTag.parentId == null) {
        break;
      }
      let parentTag = tagMap[selectedTag.parentId];
      if (parentTag == null) {
        break;
      }
      selectedTag = parentTag;
    }
  }

  return (
    <RichTreeView
      expansionTrigger="content"
      defaultExpandedItems={defaultExpandedItems}
      defaultSelectedItems={defaultSelectedItems}
      slots={{
        // todo: RichTreeView doesn't allow to pass a type other than TreeItem2Props
        item: ExplorerTreeItemWithCheckbox as any,
      }}
      onSelectedItemsChange={onSelectedItemsChange}
      items={treeItems}
      multiSelect={isMultiSelect}
      checkboxSelection={true}
    />
  );
};

export default SelectTagExplorer;
