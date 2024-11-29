// TreeView hasn't been supported by a Joy UI yet: https://github.com/mui/mui-x/issues/14687
import { SimpleTreeView } from "@mui/x-tree-view";
import {
  Directory,
  Service,
} from "../bindings/github.com/michael-freling/anime-image-viewer/internal/image";
import FolderIcon from "@mui/icons-material/Folder";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import React, { FC, useEffect, useState } from "react";
import { useTreeItem2 } from "@mui/x-tree-view/useTreeItem2";
import {
  TreeItem2Content,
  TreeItem2Root,
  TreeItem2Props,
  TreeItem2GroupTransition,
  TreeItem2IconContainer,
  TreeItem2Label,
} from "@mui/x-tree-view/TreeItem2";
import { TreeItem2Icon } from "@mui/x-tree-view/TreeItem2Icon";
import { TreeItem2Provider } from "@mui/x-tree-view/TreeItem2Provider";
import { TreeItem2LabelInput } from "@mui/x-tree-view/TreeItem2LabelInput";

const CustomTreeItem = React.forwardRef(function CustomTreeItem(
  { id, itemId, label, disabled, children }: TreeItem2Props,
  ref: React.Ref<HTMLLIElement>
) {
  // https://deploy-preview-14551--material-ui-x.netlify.app/x/react-tree-view/tree-item-customization/#usetreeitem2
  const {
    getRootProps,
    getContentProps,
    getLabelProps,
    getGroupTransitionProps,
    getIconContainerProps,
    getLabelInputProps,
    status,
  } = useTreeItem2({ id, itemId, label, disabled, children, rootRef: ref });

  return (
    <TreeItem2Provider itemId={itemId}>
      <TreeItem2Root {...getRootProps()}>
        <TreeItem2Content {...getContentProps()}>
          <TreeItem2IconContainer {...getIconContainerProps()}>
            <TreeItem2Icon status={status} />
          </TreeItem2IconContainer>

          {status.editing ? (
            <TreeItem2LabelInput {...getLabelInputProps()} />
          ) : (
            <TreeItem2Label {...getLabelProps()} />
          )}
        </TreeItem2Content>
        {children && (
          <TreeItem2GroupTransition {...getGroupTransitionProps()} />
        )}
      </TreeItem2Root>
    </TreeItem2Provider>
  );
});

const DirectoryTreeItem: FC<{
  directory: Directory;
}> = ({ directory }) => (
  <CustomTreeItem label={directory.Name} itemId={directory.Path}>
    {directory.Children &&
      directory.Children.map((child, index) => (
        <DirectoryTreeItem key={index} directory={child} />
      ))}
  </CustomTreeItem>
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
