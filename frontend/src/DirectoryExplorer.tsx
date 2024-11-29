// TreeView hasn't been supported by a Joy UI yet: https://github.com/mui/mui-x/issues/14687
import { SimpleTreeView, TreeItem2 as TreeItem } from "@mui/x-tree-view";
import {
  Directory,
  Service,
} from "../bindings/github.com/michael-freling/anime-image-viewer/internal/image";
import FolderIcon from "@mui/icons-material/Folder";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import React, { FC, useEffect, useState } from "react";

const DirectoryTreeItem: FC<{
  directory: Directory;
}> = ({ directory }) => (
  <TreeItem label={directory.Name} itemId={directory.Path}>
    {directory.Children &&
      directory.Children.map((child, index) => (
        <DirectoryTreeItem key={index} directory={child} />
      ))}
  </TreeItem>
);

interface DirectoryExplorerProps {
  selectDirectory: (directory: string) => Promise<void>;
}

const DirectoryExplorer: FC<DirectoryExplorerProps> = ({ selectDirectory }) => {
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

  async function handleSelect(
    event: React.SyntheticEvent,
    itemId: string | null
  ) {
    if (!itemId) {
      return;
    }
    selectDirectory(itemId);
  }

  if (rootDirectory === "") {
    return null;
  }

  // todo: SimpleTreeView was hard to add elements dynamically
  return (
    <SimpleTreeView
      defaultExpandedItems={[rootDirectory]}
      slots={{
        expandIcon: (props) => <FolderIcon color="primary" {...props} />,
        collapseIcon: (props) => <FolderOpenIcon color="primary" {...props} />,
        endIcon: (props) => <FolderOpenIcon color="primary" {...props} />,
      }}
      onSelectedItemsChange={handleSelect}
    >
      <DirectoryTreeItem
        directory={{
          Name: rootDirectory,
          Path: rootDirectory,
          IsDirectory: true,
          Children: children,
        }}
      />
    </SimpleTreeView>
  );
};
export default DirectoryExplorer;
