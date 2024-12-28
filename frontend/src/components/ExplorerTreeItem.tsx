// TreeView hasn't been supported by a Joy UI yet: https://github.com/mui/mui-x/issues/14687
import { Add, EditOutlined, Upload } from "@mui/icons-material";
import { Checkbox, Chip, IconButton, Stack } from "@mui/joy";
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
  children,

  editable,
  toggleItemEditing, // only for editable
  addNewChild, // only for editable
  importImages, // only for editable
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
        <Stack direction="row" spacing={2}>
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
        </Stack>
      )}
    </TreeItem2Label>
  );
}

export interface ExplorerTreeItemLabelWithCountProps
  extends UseTreeItem2LabelSlotOwnProps {
  count?: number;
}

export function ExplorerTreeItemLabelWithCount({
  children,
  count,
  ...other
}: ExplorerTreeItemLabelWithCountProps) {
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
      {count == null ? null : (
        <Stack direction="row" spacing={2}>
          <Chip>{count}</Chip>
        </Stack>
      )}
    </TreeItem2Label>
  );
}

interface ExplorerCheckboxProps {
  selectable: boolean;
  checked: boolean;
  indeterminate: boolean;
  disabled: boolean;
  onChange: () => void;
}

const ExplorerCheckbox = React.forwardRef(function CustomCheckbox(
  props: ExplorerCheckboxProps,
  ref: React.Ref<HTMLInputElement>
) {
  return <Checkbox ref={ref} {...props} />;
});

export interface ExplorerTreeItemWithCheckboxProps extends TreeItem2Props {}
export const ExplorerTreeItemWithCheckbox = React.forwardRef(
  function CustomTreeItem(
    { itemId, ...props }: TreeItem2Props & ExplorerTreeItemWithCheckboxProps,
    ref: React.Ref<HTMLLIElement>
  ) {
    const { interactions, status, publicAPI } = useTreeItem2Utils({
      itemId: itemId,
      children: props.children,
    });
    const item = publicAPI.getItem(itemId);

    const handleContentDoubleClick: UseTreeItem2LabelSlotOwnProps["onDoubleClick"] =
      (event) => {
        event.defaultMuiPrevented = true;
      };

    return (
      <TreeItem2
        {...props}
        itemId={itemId}
        ref={ref}
        slots={{
          label: ExplorerTreeItemLabelWithCount,
          checkbox: ExplorerCheckbox,
        }}
        slotProps={{
          label: {
            onDoubleClick: handleContentDoubleClick,
            count: item.count,
          } as ExplorerTreeItemLabelWithCountProps,
          checkbox: {
            indeterminate: item.indeterminate,
            checked: status.selected,
            disabled: item.disabled,
            onChange: interactions.handleCheckboxSelection,
          } as ExplorerCheckboxProps,
        }}
      />
    );
  }
);

export interface ExplorerTreeItemProps extends TreeItem2Props {
  addNewChild: (parentID: string) => Promise<void>;
  importImages?: (parentID: string) => Promise<void>;
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

  const { addNewChild, importImages } = props as ExplorerTreeItemProps;

  return (
    <TreeItem2
      {...props}
      itemId={itemId}
      ref={ref}
      slots={{
        label: ExplorerTreeItemLabel,
      }}
      slotProps={{
        label: {
          onDoubleClick: handleContentDoubleClick,

          // editable
          editable: status.editable,
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
