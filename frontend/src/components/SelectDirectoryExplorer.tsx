// TreeView hasn't been supported by a Joy UI yet: https://github.com/mui/mui-x/issues/14687
import FolderIcon from "@mui/icons-material/Folder";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import { RichTreeView, TreeViewBaseItem } from "@mui/x-tree-view";
import React, { FC, useEffect, useState } from "react";
import {
  Directory,
  DirectoryService,
} from "../../bindings/github.com/michael-freling/anime-image-viewer/internal/frontend";
import { ExplorerTreeItemWithCheckbox } from "./ExplorerTreeItem";
import { getDefaultExpandedItems, getDirectoryMap } from "./DirectoryExplorer";
import { Typography } from "@mui/joy";

function directoryToTreeViewBaseItems(directory: Directory): TreeViewBaseItem {
  return {
    id: String(directory.id),
    label: directory.name,
    children: directory.children.map((child) =>
      directoryToTreeViewBaseItems(child)
    ),
  };
}

type SelectDirectoryExplorerProps =
  | {
      isMultiSelect: true;
      onSelect: (directoryIds: number[]) => void;
      selectedDirectoryIds: number[];
    }
  | {
      isMultiSelect: false;
      selectedDirectoryId?: number;
      onSelect: (directory: Directory | null) => void;
    };

const SelectDirectoryExplorer: FC<SelectDirectoryExplorerProps> = ({
  isMultiSelect,
  onSelect,
  ...props
}) => {
  const [rootDirectory, setRootDirectory] = useState<Directory>();
  const [directoryMap, setDirectoryMap] = useState<{
    [id: number]: Directory;
  }>({});

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    const directory = await DirectoryService.ReadDirectoryTree();
    setRootDirectory(directory);
    setDirectoryMap(getDirectoryMap(directory));
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

  if (!rootDirectory) {
    return <Typography>Loading...</Typography>;
  }

  let selectedDirectoryIds: number[] = [];
  if ("selectedDirectoryIds" in props && props.selectedDirectoryIds) {
    selectedDirectoryIds = props.selectedDirectoryIds;
  } else if ("selectedDirectoryId" in props && props.selectedDirectoryId) {
    selectedDirectoryIds = [props.selectedDirectoryId];
  }
  const defaultSelectedItems = selectedDirectoryIds.map((id) => String(id));
  const defaultExpandedItems = getDefaultExpandedItems(
    selectedDirectoryIds,
    directoryMap
  );

  return (
    <RichTreeView
      expansionTrigger="content"
      defaultSelectedItems={defaultSelectedItems}
      defaultExpandedItems={defaultExpandedItems}
      slots={{
        // todo: RichTreeView doesn't allow to pass a type other than TreeItem2Props
        item: ExplorerTreeItemWithCheckbox as any,
        expandIcon: (props) => <FolderIcon color="primary" {...props} />,
        collapseIcon: (props) => <FolderOpenIcon color="primary" {...props} />,
        endIcon: (props) => <FolderOpenIcon color="primary" {...props} />,
      }}
      items={[directoryToTreeViewBaseItems(rootDirectory)]}
      onSelectedItemsChange={onSelectedItemsChange}
      multiSelect={isMultiSelect}
      checkboxSelection={true}
    />
  );
};
export default SelectDirectoryExplorer;
