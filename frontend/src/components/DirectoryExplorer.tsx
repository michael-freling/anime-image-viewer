// TreeView hasn't been supported by a Joy UI yet: https://github.com/mui/mui-x/issues/14687
import { Add } from "@mui/icons-material";
import FolderIcon from "@mui/icons-material/Folder";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import { Button, IconButton, Stack, Typography } from "@mui/joy";
import { RichTreeView, TreeViewBaseItem } from "@mui/x-tree-view";
import React, { FC, useEffect, useState } from "react";
import { createSearchParams, useNavigate } from "react-router";
import {
  Directory,
  DirectoryService,
} from "../../bindings/github.com/michael-freling/anime-image-viewer/internal/image";
import {
  ExplorerTreeItem,
  ExplorerTreeItemProps,
  ExplorerTreeItemWithCheckbox,
} from "./ExplorerTreeItem";

interface DirectoryExplorerProps {
  editable?: boolean;
  selectable?: boolean;
  selectDirectory?: (directory: string) => Promise<void>;
}

function directoriesToTreeViewBaseItems(
  directories: Directory[]
): TreeViewBaseItem<{}>[] {
  return directories.map((directory) => {
    return {
      id: directory.ID,
      label: directory.Name,
      children: directoriesToTreeViewBaseItems(directory.Children),
    };
  });
}

const getDirectoryMap = (
  directories: Directory[]
): { [id: number]: Directory } => {
  const map: { [id: number]: Directory } = {};
  directories.forEach((directory) => {
    map[directory.ID] = directory;
    Object.assign(map, getDirectoryMap(directory.Children));
  });
  return map;
};

const DirectoryExplorer: FC<DirectoryExplorerProps> = ({
  editable,
  selectable,
}) => {
  const [rootDirectory, setRootDirectory] = useState<string>("");
  const [children, setChildren] = useState<Directory[]>([]);
  const [, setDirectoryMap] = useState<{
    [id: number]: Directory;
  }>({});

  const navigate = useNavigate();
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

  if (selectable) {
    const [directoriesIds, setDirectoriesIds] = useState<string[]>([]);

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
          <Typography>Select directories to update tags</Typography>
          <Button
            variant="outlined"
            disabled={directoriesIds.length === 0}
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
        </Stack>

        <RichTreeView
          expansionTrigger="content"
          defaultExpandedItems={[rootDirectory]}
          slots={{
            // todo: RichTreeView doesn't allow to pass a type other than TreeItem2Props
            item: ExplorerTreeItemWithCheckbox as any,
            expandIcon: (props) => <FolderIcon color="primary" {...props} />,
            collapseIcon: (props) => (
              <FolderOpenIcon color="primary" {...props} />
            ),
            endIcon: (props) => <FolderOpenIcon color="primary" {...props} />,
          }}
          items={directoriesToTreeViewBaseItems(children)}
          onSelectedItemsChange={(
            event: React.SyntheticEvent,
            directoryIds: string[]
          ) => {
            if (!directoryIds) {
              return;
            }

            setDirectoriesIds(directoryIds);
          }}
          multiSelect={true}
          checkboxSelection={true}
        />
      </Stack>
    );
  }

  let otherProps = {};
  if (editable) {
    otherProps = {
      isItemEditable: () => true,
      experimentalFeatures: { labelEditing: true },
      onItemLabelChange: async (itemId, newLabel) => {
        const directoryID = parseInt(itemId, 10);
        console.debug("DirectoryExplorer.onItemLabelChange", {
          directoryID,
          newLabel,
        });
        await DirectoryService.UpdateName(directoryID, newLabel);
        await refresh();
        // The label doesn't add a child tag correctly
      },
    };
  } else {
    otherProps = {
      onSelectedItemsChange: async (
        event: React.SyntheticEvent,
        itemId: string | null
      ) => {
        if (!itemId) {
          return;
        }

        console.debug("DirectoryExplorer.onSelectedItemsChange", {
          directoryId: itemId,
        });
        navigate(`/directories/${itemId}`);
        // const directoryId = parseInt(itemId, 10);
        // const directory = directoryMap[directoryId];
        // TODO: Look up a directory by ID later
        // selectDirectory!(directory.Path);
      },
    };
  }

  if (rootDirectory === "") {
    return null;
  }

  const newDirectoryName = "New Directory";
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
        <Typography>{rootDirectory}</Typography>
        {!editable ? null : (
          <Stack
            direction="row"
            sx={{
              justifyContent: "flex-end",
            }}
            spacing={2}
          >
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
          </Stack>
        )}
      </Stack>

      <RichTreeView
        expansionTrigger="content"
        defaultExpandedItems={[rootDirectory]}
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
              await DirectoryService.ImportImages(parseInt(parentID, 10));
              await refresh();
            },
          } as ExplorerTreeItemProps,
        }}
        items={directoriesToTreeViewBaseItems(children)}
        {...otherProps}
      />
    </Stack>
  );
};
export default DirectoryExplorer;
