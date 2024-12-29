// TreeView hasn't been supported by a Joy UI yet: https://github.com/mui/mui-x/issues/14687
import FolderIcon from "@mui/icons-material/Folder";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import { RichTreeView, TreeViewBaseItem } from "@mui/x-tree-view";
import React, { FC, useEffect, useState } from "react";
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
      id: String(directory.id),
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

type SelectDirectoryExplorerProps =
  | {
      isMultiSelect: true;
      onSelect: (directoryIds: number[]) => void;
    }
  | {
      isMultiSelect: false;
      onSelect: (directory: Directory | null) => void;
    };

const SelectDirectoryExplorer: FC<SelectDirectoryExplorerProps> = ({
  isMultiSelect,
  onSelect,
}) => {
  const [rootDirectory, setRootDirectory] = useState<string>("");
  const [children, setChildren] = useState<Directory[]>([]);
  const [directoryMap, setDirectoryMap] = useState<{
    [id: number]: Directory;
  }>({});
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    DirectoryService.ReadInitialDirectory().then(async (directory) => {
      setRootDirectory(directory);
    });
  }, []);

  useEffect(() => {
    if (!rootDirectory) {
      return;
    }
    refresh().then(() => {
      setIsLoaded(true);
    });
  }, [rootDirectory]);

  async function refresh() {
    // todo: stop hardcoding root directory ID 0
    const children = await DirectoryService.ReadChildDirectoriesRecursively(0);
    await setChildren(children);
    setDirectoryMap(getDirectoryMap(children));
  }

  let onSelectedItemsChange;
  if (isMultiSelect) {
    onSelectedItemsChange = (
      event: React.SyntheticEvent,
      directoryIds: string[]
    ) => {
      if (!directoryIds) {
        return;
      }

      onSelect(directoryIds.map((id) => parseInt(id)));
    };
  } else {
    onSelectedItemsChange = (
      event: React.SyntheticEvent,
      directoryId: string | null
    ) => {
      if (!directoryId) {
        onSelect(null);
        return;
      }
      const selectedDirectoryId = parseInt(directoryId);
      onSelect(directoryMap[selectedDirectoryId]);
    };
  }

  if (!isLoaded) {
    return <div>Loading...</div>;
  }

  //   const defaultExpandedItems = Object.keys(directoryMap).map((directoryId) =>
  //     String(directoryId)
  //   );
  const defaultExpandedItems = [];
  return (
    <RichTreeView
      expansionTrigger="content"
      defaultExpandedItems={defaultExpandedItems}
      slots={{
        // todo: RichTreeView doesn't allow to pass a type other than TreeItem2Props
        item: ExplorerTreeItemWithCheckbox as any,
        expandIcon: (props) => <FolderIcon color="primary" {...props} />,
        collapseIcon: (props) => <FolderOpenIcon color="primary" {...props} />,
        endIcon: (props) => <FolderOpenIcon color="primary" {...props} />,
      }}
      items={directoriesToTreeViewBaseItems(children)}
      onSelectedItemsChange={onSelectedItemsChange}
      multiSelect={isMultiSelect}
      checkboxSelection={true}
    />
  );
};
export default SelectDirectoryExplorer;