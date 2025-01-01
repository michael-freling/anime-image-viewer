// TreeView hasn't been supported by a Joy UI yet: https://github.com/mui/mui-x/issues/14687
import { Stack, Typography } from "@mui/joy";
import { RichTreeView, TreeViewBaseItem } from "@mui/x-tree-view";
import React, { FC, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  Tag,
  TagFrontendService,
} from "../../bindings/github.com/michael-freling/anime-image-viewer/internal/tag";
import { ExplorerTreeItem } from "./ExplorerTreeItem";

export const tagsToTreeViewBaseItems = (
  tags: Tag[],
  fileCount: number
): TreeViewBaseItem<{
  id: string;
  label: string;
}>[] => {
  return tags.map((child) => {
    return {
      id: String(child.id),
      label: child.name,
      children: tagsToTreeViewBaseItems(
        (child.children ?? []).filter((child) => child != null),
        fileCount
      ),
    };
  });
};

export const getTagMap = (tags: Tag[]): { [id: number]: Tag } => {
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

// function getAncestorIds(id: number, tagMap: { [id: number]: Tag }): number[] {
//   const result: number[] = [];
//   let selectedTag = tagMap[id];
//   while (selectedTag != null) {
//     result.push(selectedTag.id);
//     if (selectedTag.parentId == null) {
//       break;
//     }
//     selectedTag = tagMap[selectedTag.parentId];
//   }
//   return result;
// }

export function getDefaultExpandedItems(
  _: number[],
  tagMap: { [id: number]: Tag }
) {
  let defaultExpandedItems: string[] = [];
  for (let tagId of Object.keys(tagMap)) {
    defaultExpandedItems.push(tagId);
  }
  return defaultExpandedItems;

  // expand only selected and indeterminate items
  //   let defaultExpandedItems: string[] = [];
  //   for (let selectedItemId of selectedTagIds) {
  //     const ancestorIds = getAncestorIds(selectedItemId, tagMap);
  //     defaultExpandedItems.push(...ancestorIds.map((id) => String(id)));
  //   }
  //   // expand tags with indeterminate states
  //   if (tagStats != undefined) {
  //     for (let [tagId, count] of Object.entries(tagStats.TagCounts)) {
  //       if (0 < count && count < fileIds.length) {
  //         const ancestorIds = getAncestorIds(parseInt(tagId), tagMap);
  //         defaultExpandedItems.push(...ancestorIds.map((id) => String(id)));
  //       }
  //     }
  //   }
}

export interface TagExplorerProps {
  title: string;
}
const TagExplorer: FC<TagExplorerProps> = (props) => {
  const navigate = useNavigate();
  const [children, setChildren] = useState<Tag[]>([]);
  const [tagMap, setTagMap] = useState<{ [id: number]: Tag }>({});

  useEffect(() => {
    if (children.length > 0) {
      return;
    }

    refresh();
  }, []);

  async function refresh() {
    const tags = await TagFrontendService.GetAll();
    setChildren(tags);
    setTagMap(getTagMap(tags));
  }

  if (children.length === 0) {
    return <Typography>Loading...</Typography>;
  }

  const treeItems = tagsToTreeViewBaseItems(children, 0);

  const { title } = props;

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
        defaultExpandedItems={getDefaultExpandedItems([], tagMap)}
        slots={{
          // todo: RichTreeView doesn't allow to pass a type other than TreeItem2Props
          item: ExplorerTreeItem as any,
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
