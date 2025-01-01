// TreeView hasn't been supported by a Joy UI yet: https://github.com/mui/mui-x/issues/14687
import FolderIcon from "@mui/icons-material/Folder";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import { RichTreeView, TreeViewBaseItem } from "@mui/x-tree-view";
import React, { FC, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  Directory,
  DirectoryService,
} from "../../bindings/github.com/michael-freling/anime-image-viewer/internal/image";
import { ExplorerTreeItem } from "./ExplorerTreeItem";

export function directoriesToTreeViewBaseItems(
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

export function getDefaultExpandedItems(
  _: number[],
  directoryMap: { [id: number]: Directory }
) {
  let defaultExpandedItems: string[] = [];
  for (let directoryId of Object.keys(directoryMap)) {
    defaultExpandedItems.push(directoryId);
  }
  return defaultExpandedItems;
  //   expand only selected items
  //   let defaultExpandedItems: string[] = [];
  //   for (let selectedDirectoryId of selectedDirectoryIds) {
  //     let directoryId = selectedDirectoryId;
  //     while (true) {
  //       defaultExpandedItems.push(String(directoryId));
  //       let directory = directoryMap[directoryId];
  //       if (directory === undefined) {
  //         break;
  //       }
  //       if (directory.parentId === 0) {
  //         break;
  //       }
  //       directoryId = directory.parentId;
  //     }
  //   }
}

export const getDirectoryMap = (
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

const DirectoryExplorer: FC = () => {
  const [rootDirectory, setRootDirectory] = useState<string>("");
  const [children, setChildren] = useState<Directory[]>([]);
  const [directoryMap, setDirectoryMap] = useState<{ [id: number]: Directory }>(
    {}
  );

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

  const otherProps = {
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
    },
  };

  if (rootDirectory === "" || children.length === 0) {
    return null;
  }

  return (
    <RichTreeView
      expansionTrigger="content"
      defaultExpandedItems={getDefaultExpandedItems([], directoryMap)}
      slots={{
        // todo: RichTreeView doesn't allow to pass a type other than TreeItem2Props
        item: ExplorerTreeItem as any,
        expandIcon: (props) => <FolderIcon color="primary" {...props} />,
        collapseIcon: (props) => <FolderOpenIcon color="primary" {...props} />,
        endIcon: (props) => <FolderOpenIcon color="primary" {...props} />,
      }}
      items={directoriesToTreeViewBaseItems(children)}
      {...otherProps}
    />
  );
};
export default DirectoryExplorer;
