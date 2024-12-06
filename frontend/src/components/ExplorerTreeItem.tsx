// TreeView hasn't been supported by a Joy UI yet: https://github.com/mui/mui-x/issues/14687
import { Add, Delete, EditOutlined, Upload } from "@mui/icons-material";
import { IconButton, Stack } from "@mui/joy";
import {
  TreeItem2,
  TreeItem2Label,
  TreeItem2Props,
  UseTreeItem2LabelSlotOwnProps,
  useTreeItem2Utils,
} from "@mui/x-tree-view";
import React, { SyntheticEvent } from "react";

export interface ExplorerTreeItemLabelProps
  extends UseTreeItem2LabelSlotOwnProps {
  editable: boolean;
  addNewChild: () => Promise<void>;
  toggleItemEditing: () => void;
  importImages: () => Promise<void> | null;
}

export function ExplorerTreeItemLabel({
  editable,
  children,
  toggleItemEditing,
  addNewChild,
  importImages,
  ...other
}: ExplorerTreeItemLabelProps) {
  return (
    <TreeItem2Label
      {...other}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 2,
        justifyContent: "space-between",
      }}
    >
      {children}
      {editable == false ? null : (
        <Stack direction="row">
          {/* Only DirectoryExplorer */}
          {importImages == null ? null : (
            <IconButton
              variant="outlined"
              color="primary"
              onClick={(event: SyntheticEvent) => {
                event.stopPropagation();
                importImages();
              }}
            >
              <Upload />
            </IconButton>
          )}

          <IconButton
            variant="outlined"
            color="primary"
            onClick={(event: SyntheticEvent) => {
              event.stopPropagation();
              addNewChild();
            }}
          >
            <Add />
          </IconButton>
          <IconButton
            variant="outlined"
            color="primary"
            onClick={(event: SyntheticEvent) => {
              event.stopPropagation();
              toggleItemEditing();
            }}
          >
            <EditOutlined fontSize="small" />
          </IconButton>
          <IconButton variant="outlined" color="danger">
            <Delete />
          </IconButton>
        </Stack>
      )}
    </TreeItem2Label>
  );
}

export interface ExplorerTreeItemProps extends TreeItem2Props {
  labelComponent: React.ElementType<ExplorerTreeItemLabelProps>;
  addNewChild: (parentID: string) => Promise<void>;
  importImages?: (parentID: string) => Promise<void>;
  selectItem?: (id: string) => Promise<void>;
}

export const ExplorerTreeItem = React.forwardRef(function CustomTreeItem(
  { itemId, ...props }: TreeItem2Props & ExplorerTreeItemProps,
  ref: React.Ref<HTMLLIElement>
) {
  const { interactions, status } = useTreeItem2Utils({
    itemId: itemId,
    children: props.children,
  });

  const handleContentDoubleClick: UseTreeItem2LabelSlotOwnProps["onDoubleClick"] =
    (event) => {
      event.defaultMuiPrevented = true;
    };

  const { addNewChild, labelComponent, importImages } =
    props as ExplorerTreeItemProps;

  return (
    <TreeItem2
      {...props}
      itemId={itemId}
      ref={ref}
      slots={{
        label: labelComponent,
      }}
      slotProps={{
        label: {
          editable: status.editable,
          onDoubleClick: handleContentDoubleClick,
          addNewChild: () => {
            addNewChild(itemId);
          },
          toggleItemEditing: interactions.toggleItemEditing,
          importImages:
            importImages == null
              ? null
              : () => {
                  importImages(itemId);
                },
        } as ExplorerTreeItemLabelProps,
      }}
    />
  );
});
