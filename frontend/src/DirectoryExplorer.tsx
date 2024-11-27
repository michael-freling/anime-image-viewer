import { SimpleTreeView, TreeItem2 as TreeItem } from "@mui/x-tree-view";
import {
  Directory,
  Service,
} from "../bindings/github.com/michael-freling/anime-image-viewer/internal/image";
import FolderIcon from "@mui/icons-material/Folder";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import { useEffect, useState } from "react";

export function DirectoryTreeItem({ directory }: { directory: Directory }) {
  return (
    <TreeItem label={directory.Name} itemId={directory.Path}>
      {directory.Children &&
        directory.Children.map((child, index) => (
          <DirectoryTreeItem key={index} directory={child} />
        ))}
    </TreeItem>
  );
}

export default function DirectoryExplorer() {
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

  async function readImages(dirPath: string) {
    const images = await Service.ReadImageFiles(dirPath);
    console.log(images);
  }

  async function handleSelect(
    event: React.SyntheticEvent,
    itemId: string | null
  ) {
    if (!itemId) {
      return;
    }
    await readImages(itemId);
  }

  // todo: SimpleTreeView was hard to add elements dynamically
  return (
    <SimpleTreeView
      defaultExpandedItems={[rootDirectory]}
      slots={{
        expandIcon: FolderIcon,
        collapseIcon: FolderOpenIcon,
        endIcon: FolderOpenIcon,
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
}
