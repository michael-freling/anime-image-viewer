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
  selectable: boolean;
  addNewChild: () => Promise<void>;
  toggleItemEditing: () => void;
  importImages: () => Promise<void> | null;
  count: number;
}

export function ExplorerTreeItemLabel({
  children,

  editable,
  toggleItemEditing, // only for editable
  addNewChild, // only for editable
  importImages, // only for editable

  selectable,
  count, // only for selectable
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
          {/*}
          <IconButton variant="outlined" color="danger">
            <Delete />
          </IconButton>
          */}
        </Stack>
      )}
      {selectable == false ? null : (
        <Stack direction="row" spacing={2}>
          <Chip>{count}</Chip>
        </Stack>
      )}
    </TreeItem2Label>
  );
}

export interface ExplorerTreeItemProps extends TreeItem2Props {
  labelComponent: React.ElementType<ExplorerTreeItemLabelProps>;
  // only for editable
  addNewChild: (parentID: string) => Promise<void>;
  importImages?: (parentID: string) => Promise<void>;

  // only for selectable
  selectable: boolean;
  count: number;
  selectItem?: (id: string) => Promise<void>;
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
  if (!props.selectable) {
    return null;
  }
  return <Checkbox ref={ref} {...props} />;
});

export const ExplorerTreeItem = React.forwardRef(function CustomTreeItem(
  { itemId, ...props }: TreeItem2Props & ExplorerTreeItemProps,
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

  const { addNewChild, labelComponent, importImages, selectable } =
    props as ExplorerTreeItemProps;

  return (
    <TreeItem2
      {...props}
      itemId={itemId}
      ref={ref}
      slots={{
        label: labelComponent,
        checkbox: ExplorerCheckbox,
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

          // selectable
          selectable: selectable == true,
          count: item.count ? item.count : 0,
        } as ExplorerTreeItemLabelProps,
        checkbox: {
          selectable,
          indeterminate: item.indeterminate,
          checked: status.selected,
          disabled: item.disabled,
          onChange: interactions.handleCheckboxSelection,
        } as ExplorerCheckboxProps,
      }}
    />
  );
});
