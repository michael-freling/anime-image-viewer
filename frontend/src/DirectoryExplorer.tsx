import { SimpleTreeView, TreeItem } from "@mui/x-tree-view";
import {
  FileInfo,
  Service,
} from "../bindings/github.com/michael-freling/anime-image-viewer/internal/image";
import FolderIcon from "@mui/icons-material/Folder";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import { useEffect, useState } from "react";

export default function DirectoryExplorer({ root }: { root: string }) {
  const [directories, setDirectories] = useState<FileInfo[]>([]);

  async function readFiles(path: string) {
    const files = await Service.ReadDirectory(path);
    setDirectories(files.filter((file) => file.IsDirectory));
  }

  useEffect(() => {
    readFiles(root);
  }, [root]);

  return (
    <SimpleTreeView
      defaultExpandedItems={["root"]}
      slots={{
        expandIcon: FolderIcon,
        collapseIcon: FolderOpenIcon,
        endIcon: FolderIcon,
      }}
    >
      <TreeItem itemId="root" label={root}>
        {directories.map((file, index) => (
          <TreeItem key={index} label={file.Name} itemId={file.Path} />
        ))}
      </TreeItem>
    </SimpleTreeView>
  );
}
