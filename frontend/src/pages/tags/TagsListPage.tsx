import { IconButton, Typography } from "@mui/joy";
import { RichTreeView } from "@mui/x-tree-view";
import { FC, useEffect, useState } from "react";
import {
  Tag,
  TagService,
} from "../../../bindings/github.com/michael-freling/anime-image-viewer/internal/frontend";
import { TagFrontendService as LegacyTagFrontendService } from "../../../bindings/github.com/michael-freling/anime-image-viewer/internal/tag";
import {
  ExplorerTreeItem,
  ExplorerTreeItemProps,
} from "../../components/ExplorerTreeItem";
import {
  tagsToTreeViewBaseItems,
  getDefaultExpandedItems,
} from "../../components/TagExplorer";
import Layout from "../../Layout";
import { Add } from "@mui/icons-material";

export const TagsListPage: FC = () => {
  const [tags, setTags] = useState<Tag[]>([]);
  const [isTagLoaded, setTagLoaded] = useState(false);

  useEffect(() => {
    if (tags.length > 0) {
      return;
    }

    refresh();
  }, []);

  async function refresh() {
    const tags = await TagService.GetAll();
    setTags(tags);
    setTagLoaded(true);
  }

  const treeItems = tagsToTreeViewBaseItems(tags);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const addNewChild = async (_parentID: string) => {
    await LegacyTagFrontendService.CreateTopTag("New Tag");
    await refresh();
  };

  return (
    <Layout.Main
      actionHeader={
        <>
          <Typography>Edit tags</Typography>
          <IconButton
            variant="outlined"
            color="primary"
            onClick={async () => {
              await LegacyTagFrontendService.CreateTopTag("New Tag");
              // todo: Update only added tag
              await refresh();
            }}
          >
            <Add />
          </IconButton>
        </>
      }
    >
      {!isTagLoaded && <Typography>Loading...</Typography>}
      {isTagLoaded && (
        <RichTreeView
          expansionTrigger="content"
          defaultExpandedItems={getDefaultExpandedItems()}
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
            await LegacyTagFrontendService.UpdateName(
              parseInt(itemId, 10),
              newLabel
            );
            // todo: Update only changed tag
            await refresh();
          }}
        />
      )}
    </Layout.Main>
  );
};

export default TagsListPage;
