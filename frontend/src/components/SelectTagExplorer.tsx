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
import { getDefaultExpandedItems, getTagMap } from "./TagExplorer";

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

type SelectTagExplorerProps =
  | {
      isMultiSelect: true;
      onSelect: (addedTagIds: number[], deletedTagIds: number[]) => void;
      fileIds: number[];
    }
  | {
      isMultiSelect: false;
      onSelect: (tag: Tag | null) => void;
      selectedTagId?: number;
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
  let onItemSelectionToggle;
  if (isMultiSelect) {
    fileIds = (props as { fileIds: number[] }).fileIds;
    onItemSelectionToggle = (
      event: React.SyntheticEvent,
      itemId: string,
      isSelected: boolean
    ) => {
      let newAddedTagIds = {
        ...addedTagIds,
      };
      let newDeletedTagIds = {
        ...deletedTagIds,
      };
      if (isSelected) {
        if (deletedTagIds[itemId]) {
          delete newDeletedTagIds[itemId];
        }
        newAddedTagIds[itemId] = true;
      } else {
        if (addedTagIds[itemId]) {
          delete newAddedTagIds[itemId];
        }
        newDeletedTagIds[itemId] = true;
      }
      console.debug("onItemSelectionToggle", {
        newAddedTagIds,
        newDeletedTagIds,
      });
      setAddedTagIds(newAddedTagIds);
      setDeletedTagIds(newDeletedTagIds);
      onSelect(
        Object.keys(newAddedTagIds).map((id) => parseInt(id)),
        Object.keys(newDeletedTagIds).map((id) => parseInt(id))
      );
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
    if (tagStatsLoaded) {
      return <Typography>Please create a tag at first</Typography>;
    }
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

  let selectedTagIds: number[] = [];
  if ("selectedTagId" in props && props.selectedTagId) {
    selectedTagIds = [props.selectedTagId];
  } else if (tagStats != undefined) {
    for (let [tagId, count] of Object.entries(tagStats.TagCounts)) {
      if (count == fileIds.length) {
        selectedTagIds.push(parseInt(tagId));
      }
    }
  }
  const defaultSelectedItems = selectedTagIds.map((id) => String(id));
  // selected items should be visible as default.
  // So, we need to expand all parent items of selected items.
  const defaultExpandedItems = getDefaultExpandedItems(selectedTagIds, tagMap);

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
      onItemSelectionToggle={onItemSelectionToggle}
      items={treeItems}
      multiSelect={isMultiSelect}
      checkboxSelection={true}
    />
  );
};

export default SelectTagExplorer;
