import { IconButton, Typography } from "@mui/joy";
import { RichTreeView } from "@mui/x-tree-view";
import { FC, useEffect, useState } from "react";
import {
  Tag,
  TagFrontendService,
} from "../../../bindings/github.com/michael-freling/anime-image-viewer/internal/tag";
import {
  ExplorerTreeItem,
  ExplorerTreeItemProps,
} from "../../components/ExplorerTreeItem";
import { tagsToTreeViewBaseItems } from "../../components/TagExplorer";
import Layout from "../../Layout";
import { Add } from "@mui/icons-material";

export const TagsListPage: FC = () => {
  const [tags, setTags] = useState<Tag[]>([]);

  useEffect(() => {
    if (tags.length > 0) {
      return;
    }

    refresh();
  }, []);

  async function refresh() {
    const tags = await TagFrontendService.GetAll();
    setTags(tags);
  }

  if (tags.length === 0) {
    return <Typography>Loading...</Typography>;
  }

  const treeItems = tagsToTreeViewBaseItems(tags, 0);

  const addNewChild = async (parentID: string) => {
    await TagFrontendService.Create({
      Name: "New Tag",
      ParentID: parseInt(parentID, 10),
    });
    // todo: Update only added tag
    await refresh();
  };

  const rootID = "0";
  return (
    <Layout.Main
      actionHeader={
        <>
          <Typography>Edit tags</Typography>
          <IconButton
            variant="outlined"
            color="primary"
            onClick={async () => {
              await TagFrontendService.CreateTopTag("New Tag");
              // todo: Update only added tag
              await refresh();
            }}
          >
            <Add />
          </IconButton>
        </>
      }
    >
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
          await TagFrontendService.UpdateName(parseInt(itemId, 10), newLabel);
          // todo: Update only changed tag
          await refresh();
        }}
      />
    </Layout.Main>
  );
};

export default TagsListPage;
