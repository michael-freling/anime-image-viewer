// TreeView hasn't been supported by a Joy UI yet: https://github.com/mui/mui-x/issues/14687
import FolderIcon from "@mui/icons-material/Folder";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import { RichTreeView, TreeViewBaseItem } from "@mui/x-tree-view";
import React, { FC, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  Directory,
  DirectoryService,
  Tag,
} from "../../bindings/github.com/michael-freling/anime-image-viewer/internal/frontend";
import { ExplorerTreeItem } from "./ExplorerTreeItem";
import { Typography } from "@mui/joy";

export function directoryToTreeViewBaseItems(
  directory: Directory,
  allTags: { [id: number]: Tag },
  directoryTagMap: { [id: number]: number[] }
): TreeViewBaseItem<{
  id: string;
  label: string;
  tags: string[];
}> {
  const tagsMap = directoryTagMap[directory.id];

  return {
    id: String(directory.id),
    label: directory.name,
    tags: tagsMap ? tagsMap.map((tagId) => allTags[tagId].fullName) : [],

    children: directory.children.map((child) => {
      return directoryToTreeViewBaseItems(child, allTags, directoryTagMap);
    }),
  };
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
}

export const getDirectoryMap = (
  directory: Directory
): { [id: number]: Directory } => {
  const map: { [id: number]: Directory } = {};
  map[directory.id] = directory;
  directory.children.forEach((child) => {
    Object.assign(map, getDirectoryMap(child));
  });
  return map;
};

const DirectoryExplorer: FC = () => {
  const [rootDirectory, setRootDirectory] = useState<Directory>();
  const [directoryMap, setDirectoryMap] = useState<{ [id: number]: Directory }>(
    {}
  );

  const navigate = useNavigate();
  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    const { rootDirectory } = await DirectoryService.ReadDirectoryTree();
    if (!rootDirectory) {
      return;
    }
    setRootDirectory(rootDirectory);
    setDirectoryMap(getDirectoryMap(rootDirectory));
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

  if (!rootDirectory) {
    return <Typography>Loading...</Typography>;
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
      items={[directoryToTreeViewBaseItems(rootDirectory, {}, {})]}
      {...otherProps}
    />
  );
};
export default DirectoryExplorer;
