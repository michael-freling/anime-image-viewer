// TreeView hasn't been supported by a Joy UI yet: https://github.com/mui/mui-x/issues/14687
import { Button, Stack, Typography } from "@mui/joy";
import { RichTreeView, TreeViewBaseItem } from "@mui/x-tree-view";
import React, { FC, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  Tag,
  TagService,
} from "../../bindings/github.com/michael-freling/anime-image-viewer/internal/image";
import { ExplorerTreeItem, ExplorerTreeItemProps } from "./ExplorerTreeItem";

const tagsToTreeViewBaseItems = (
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
  editable: boolean;
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
    const tags = await TagService.GetAll();
    setChildren(tags);
  }

  if (children.length === 0) {
    return <Typography>Loading...</Typography>;
  }

  const treeItems = tagsToTreeViewBaseItems(children, 0);

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
