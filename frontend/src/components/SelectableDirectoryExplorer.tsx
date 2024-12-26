// TreeView hasn't been supported by a Joy UI yet: https://github.com/mui/mui-x/issues/14687
import FolderIcon from "@mui/icons-material/Folder";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import { Button, Stack, Typography } from "@mui/joy";
import { RichTreeView, TreeViewBaseItem } from "@mui/x-tree-view";
import React, { FC, useEffect, useState } from "react";
import { createSearchParams, useNavigate } from "react-router";
import {
  Directory,
  DirectoryService,
} from "../../bindings/github.com/michael-freling/anime-image-viewer/internal/image";
import { ExplorerTreeItemWithCheckbox } from "./ExplorerTreeItem";

function directoriesToTreeViewBaseItems(
  directories: Directory[]
): TreeViewBaseItem<{}>[] {
  return directories.map((directory) => {
    return {
      id: directory.id,
      label: directory.name,
      children: directoriesToTreeViewBaseItems(
        directory.children.filter((child) => child != null)
      ),
    };
  });
}

const getDirectoryMap = (
  directories: Directory[]
): { [id: number]: Directory } => {
  const map: { [id: number]: Directory } = {};
  directories.forEach((directory) => {
    map[directory.id] = directory;
    Object.assign(
      map,
      getDirectoryMap(directory.children.filter((child) => child != null))
    );
  });
  return map;
};

interface DirectoryExplorerProps {}

const SelectableDirectoryExplorer: FC<DirectoryExplorerProps> = ({}) => {
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
};
export default SelectableDirectoryExplorer;
