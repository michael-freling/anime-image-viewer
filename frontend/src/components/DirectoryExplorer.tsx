// TreeView hasn't been supported by a Joy UI yet: https://github.com/mui/mui-x/issues/14687
import FolderIcon from "@mui/icons-material/Folder";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import { RichTreeView, TreeViewBaseItem } from "@mui/x-tree-view";
import React, { FC, useEffect, useState } from "react";
import {
  Directory,
  Service,
} from "../../bindings/github.com/michael-freling/anime-image-viewer/internal/image";
import {
  ExplorerTreeItem,
  ExplorerTreeItemLabel,
  ExplorerTreeItemProps,
} from "./ExplorerTreeItem";

interface DirectoryExplorerProps {
  editable: boolean;
  selectDirectory?: (directory: string) => Promise<void>;
}

function directoriesToTreeViewBaseItems(
  directories: Directory[]
): TreeViewBaseItem<{}>[] {
  return directories.map((directory) => {
    return {
      id: directory.Path,
      label: directory.Name,
      children: directoriesToTreeViewBaseItems(directory.Children),
    };
  });
}

const DirectoryExplorer: FC<DirectoryExplorerProps> = ({
  editable,
  selectDirectory,
}) => {
  const [rootDirectory, setRootDirectory] = useState<string>("");
  const [children, setChildren] = useState<Directory[]>([]);

  useEffect(() => {
    Service.ReadInitialDirectory().then(async (directory) => {
      setRootDirectory(directory);
    });
  }, []);

  useEffect(() => {
    if (!rootDirectory) {
      return;
    }
    readDirectories(rootDirectory);
  }, [rootDirectory]);

  async function readDirectories(dirPath: string) {
    const children = await Service.ReadChildDirectoriesRecursively(dirPath);
    setChildren(children);
  }

  let otherProps = {};
  if (editable) {
    otherProps = {
      isItemEditable: () => true,
      experimentalFeatures: { labelEditing: true },
      handleSelect: async (
        event: React.SyntheticEvent,
        itemId: string | null
      ) => {
        if (!itemId) {
          return;
        }
        selectDirectory!(itemId);
      },
    };
  }

  if (rootDirectory === "") {
    return null;
  }

  return (
    <RichTreeView
      expansionTrigger="content"
      defaultExpandedItems={[rootDirectory]}
      slots={{
        // todo: RichTreeView doesn't allow to pass a type other than TreeItem2Props
        item: ExplorerTreeItem as any,
        expandIcon: (props) => <FolderIcon color="primary" {...props} />,
        collapseIcon: (props) => <FolderOpenIcon color="primary" {...props} />,
        endIcon: (props) => <FolderOpenIcon color="primary" {...props} />,
      }}
      slotProps={{
        item: {
          addNewChild: async (parentID: string) => {},
          importImages: async () => {},
          labelComponent: ExplorerTreeItemLabel,
        } as ExplorerTreeItemProps,
      }}
      items={directoriesToTreeViewBaseItems(children)}
      {...otherProps}
    />
  );
};
export default DirectoryExplorer;
