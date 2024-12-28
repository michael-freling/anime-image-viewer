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

export interface TagExplorerProps {
  title: string;
}
const TagExplorer: FC<TagExplorerProps> = (props) => {
  const navigate = useNavigate();
  const [children, setChildren] = useState<Tag[]>([]);

  useEffect(() => {
    if (children.length > 0) {
      return;
    }

    refresh();
  }, []);

  async function refresh() {
    const tags = await TagFrontendService.GetAll();
    setChildren(tags);
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
