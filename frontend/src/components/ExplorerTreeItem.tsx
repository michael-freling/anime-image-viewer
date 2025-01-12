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
  tags: string[];
  addNewChild: () => Promise<void>;
  toggleItemEditing: (() => void) | null;
  importImages: () => Promise<void> | null;
}

export function ExplorerTreeItemLabel({
  children,

  editable,
  tags,
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
        width: "100%",
      }}
    >
      {tags == null ? (
        children
      ) : (
        <>
          <Stack
            direction="row"
            sx={{ alignItems: "center", overflow: "auto" }}
          >
            {children}
            <Stack direction="column" spacing={1} sx={{ pl: 1 }}>
              {tags.map((tag) => (
                <Chip key={tag}>{tag}</Chip>
              ))}
            </Stack>
          </Stack>
        </>
      )}

      {!editable ? null : (
        <Stack direction="row" spacing={1}>
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
          {toggleItemEditing == null ? null : (
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
          )}
        </Stack>
      )}
    </TreeItem2Label>
  );
}

export interface ExplorerTreeItemLabelWithCountProps
  extends UseTreeItem2LabelSlotOwnProps {
  tags?: string[];
  count?: number;
}

export function ExplorerTreeItemLabelWithCount({
  children,
  tags,
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
      {tags == null ? (
        children
      ) : (
        <Stack direction="row" sx={{ alignItems: "center", overflow: "auto" }}>
          {children}
          <Stack spacing={1} sx={{ pl: 1 }}>
            {tags.map((tag) => (
              <Chip key={tag}>{tag}</Chip>
            ))}
          </Stack>
        </Stack>
      )}
      {count == null ? null : (
        <Stack direction="row" spacing={2}>
          <Chip>{count}</Chip>
        </Stack>
      )}
    </TreeItem2Label>
  );
}

interface ExplorerCheckboxProps {
  itemId: string;
  selectable: boolean;
  checked: boolean;
  indeterminate: boolean;
  disabled: boolean;
  onChange: () => void;
}

const ExplorerCheckbox = React.forwardRef(function CustomCheckbox(
  { itemId, ...props }: ExplorerCheckboxProps,
  ref: React.Ref<HTMLInputElement>
) {
  if (itemId == "0") {
    return null;
  }

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
            tags: item.tags,
            count: item.count,
          } as ExplorerTreeItemLabelWithCountProps,
          checkbox: {
            itemId,
            disabled: item.disabled,
            indeterminate: item.indeterminate,
            checked: status.selected,
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
  const { interactions, status, publicAPI } = useTreeItem2Utils({
    itemId: itemId,
    children: props.children,
  });
  const item = publicAPI.getItem(itemId);

  const handleContentDoubleClick: UseTreeItem2LabelSlotOwnProps["onDoubleClick"] =
    (event) => {
      event.defaultMuiPrevented = true;
    };

  const { addNewChild, importImages } = props as ExplorerTreeItemProps;

  const onImportImages =
    importImages == null || itemId == "0"
      ? null
      : () => {
          importImages(itemId);
        };
  const onToggleItemEditing =
    !status.editable || itemId == "0" ? null : interactions.toggleItemEditing;

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
          tags: item.tags,
          addNewChild: () => {
            addNewChild(itemId);
          },
          toggleItemEditing: onToggleItemEditing,
          importImages: onImportImages,
        } as ExplorerTreeItemLabelProps,
      }}
    />
  );
});
