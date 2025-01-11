import FolderIcon from "@mui/icons-material/Folder";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import { Button, Typography } from "@mui/joy";
import { RichTreeView } from "@mui/x-tree-view";
import { FC, useEffect, useState } from "react";
import {
  BatchImportImageService,
  Directory,
  DirectoryService,
} from "../../../bindings/github.com/michael-freling/anime-image-viewer/internal/frontend";
import {
  directoryToTreeViewBaseItems,
  getDefaultExpandedItems,
  getDirectoryMap,
} from "../../components/DirectoryExplorer";
import {
  ExplorerTreeItem,
  ExplorerTreeItemProps,
} from "../../components/ExplorerTreeItem";
import Layout from "../../Layout";
import ModeButtons from "../../components/ModeButtons";
import { createSearchParams, useNavigate } from "react-router";
import SelectDirectoryExplorer from "../../components/SelectDirectoryExplorer";

type Mode = "edit" | "selectTags";

const DirectoryEditPage: FC = () => {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("edit");
  const [rootDirectory, setRootDirectory] = useState<Directory>();
  const [directoryMap, setDirectoryMap] = useState<{
    [id: number]: Directory;
  }>({});
  const [directoriesIds, setDirectoriesIds] = useState<number[]>([]);

  function onSelect(directoryIds: number[]) {
    setDirectoriesIds(directoryIds);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    // todo: stop hardcoding root directory ID 0
    const rootDirectory = await DirectoryService.ReadDirectoryTree();
    setRootDirectory(rootDirectory);
    setDirectoryMap(getDirectoryMap(rootDirectory));
  }

  if (!rootDirectory) {
    return <Typography>Loading...</Typography>;
  }

  const newDirectoryName = "New Directory";
  return (
    <Layout.Main
      actionHeader={
        <>
          <ModeButtons
            onChange={setMode}
            defaultMode={mode}
            enabledModes={[
              { value: "edit", text: "Edit" },
              { value: "selectTags", text: "Select tags" },
            ]}
          />
          <Button
            variant="outlined"
            disabled={mode != "selectTags" || directoriesIds.length === 0}
            onClick={() => {
              const searchParams = createSearchParams({
                directoryIds: directoriesIds.join(","),
              }).toString();
              navigate({
                pathname: "/directories/tags/edit",
                search: `?${searchParams}`,
              });
            }}
          >
            Edit tags
          </Button>
        </>
      }
    >
      {mode === "edit" && (
        <RichTreeView
          expansionTrigger="content"
          defaultExpandedItems={getDefaultExpandedItems([], directoryMap)}
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
                await BatchImportImageService.ImportImages(
                  parseInt(parentID, 10)
                );
                await refresh();
              },
            } as ExplorerTreeItemProps,
          }}
          items={[directoryToTreeViewBaseItems(rootDirectory)]}
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
      )}
      {mode === "selectTags" && (
        <SelectDirectoryExplorer isMultiSelect={true} onSelect={onSelect} />
      )}
    </Layout.Main>
  );
};

export default DirectoryEditPage;
