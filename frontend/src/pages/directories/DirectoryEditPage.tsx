import { Add } from "@mui/icons-material";
import FolderIcon from "@mui/icons-material/Folder";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import { IconButton, Typography } from "@mui/joy";
import { RichTreeView } from "@mui/x-tree-view";
import { FC, useEffect, useState } from "react";
import { ImportService } from "../../../bindings/github.com/michael-freling/anime-image-viewer/internal/frontend";
import {
  Directory,
  DirectoryService,
} from "../../../bindings/github.com/michael-freling/anime-image-viewer/internal/image";
import {
  directoriesToTreeViewBaseItems,
  getDirectoryMap,
} from "../../components/DirectoryExplorer";
import {
  ExplorerTreeItem,
  ExplorerTreeItemProps,
} from "../../components/ExplorerTreeItem";
import Layout from "../../Layout";

const DirectoryEditPage: FC = () => {
  const [rootDirectory, setRootDirectory] = useState<string>("");
  const [children, setChildren] = useState<Directory[]>([]);
  const [, setDirectoryMap] = useState<{
    [id: number]: Directory;
  }>({});

  useEffect(() => {
    DirectoryService.ReadInitialDirectory().then(async (directory) => {
      setRootDirectory(directory);
    });
  }, []);

  useEffect(() => {
    if (!rootDirectory) {
      return;
    }
    refresh();
  }, [rootDirectory]);

  async function refresh() {
    // todo: stop hardcoding root directory ID 0
    const children = await DirectoryService.ReadChildDirectoriesRecursively(0);
    await setChildren(children);
    setDirectoryMap(getDirectoryMap(children));
  }

  const newDirectoryName = "New Directory";
  return (
    <Layout.Main
      actionHeader={
        <>
          <Typography>Edit directories</Typography>
          <IconButton
            variant="outlined"
            color="primary"
            onClick={async (event) => {
              await DirectoryService.CreateTopDirectory(newDirectoryName);
              // todo: don't reload all directories
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
        slots={{
          // todo: RichTreeView doesn't allow to pass a type other than TreeItem2Props
          item: ExplorerTreeItem as any,
          expandIcon: (props) => <FolderIcon color="primary" {...props} />,
          collapseIcon: (props) => (
            <FolderOpenIcon color="primary" {...props} />
          ),
          endIcon: (props) => <FolderOpenIcon color="primary" {...props} />,
        }}
        slotProps={{
          item: {
            addNewChild: async (parentID: string) => {
              await DirectoryService.CreateDirectory(
                newDirectoryName,
                parseInt(parentID, 10)
              );
              await refresh();
            },
            importImages: async (parentID: string) => {
              await ImportService.ImportImages(parseInt(parentID, 10));
              await refresh();
            },
          } as ExplorerTreeItemProps,
        }}
        items={directoriesToTreeViewBaseItems(children)}
        isItemEditable={() => true}
        experimentalFeatures={{ labelEditing: true }}
        onItemLabelChange={async (itemId, newLabel) => {
          const directoryID = parseInt(itemId, 10);
          console.debug("DirectoryExplorer.onItemLabelChange", {
            directoryID,
            newLabel,
          });
          await DirectoryService.UpdateName(directoryID, newLabel);
          await refresh();
          // The label doesn't add a child tag correctly
        }}
      />
    </Layout.Main>
  );
};

export default DirectoryEditPage;
