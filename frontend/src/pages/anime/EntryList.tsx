import {
  Add,
  Delete,
  Edit,
  Folder as FolderIcon,
  Movie as MovieIcon,
  MoreVert,
  Tv,
  Upload,
} from "@mui/icons-material";
import {
  Box,
  Dropdown,
  IconButton,
  ListDivider,
  Menu,
  MenuButton,
  MenuItem,
  ListItemDecorator,
  Stack,
  Typography,
} from "@mui/joy";
import { FC } from "react";
import { AnimeEntryInfo } from "../../../bindings/github.com/michael-freling/anime-image-viewer/internal/frontend";

interface EntryListProps {
  entries: AnimeEntryInfo[];
  totalImageCount: number;
  selectedEntryId: number | null;
  onSelectEntry: (entryId: number | null) => void; // null = All Images
  onAddEntry: () => void;
  onAddSubEntry: (parentId: number) => void;
  onUploadImages: (entryId: number) => void;
  onRenameEntry: (entryId: number, currentName: string) => void;
  onDeleteEntry: (entryId: number, name: string) => void;
}

function totalEntryImageCount(entry: AnimeEntryInfo): number {
  let count = entry.imageCount;
  for (const child of entry.children) {
    count += child.imageCount;
  }
  return count;
}

function entryBadge(type: string, number?: number): string {
  switch (type) {
    case "season":
      return `S${number ?? ""}`;
    case "movie":
      return "M";
    case "other":
      return "O";
    default:
      return "";
  }
}

function entryColor(type: string): string {
  switch (type) {
    case "season":
      return "#1976d2";
    case "movie":
      return "#7b1fa2";
    default:
      return "#757575";
  }
}

function entryBgColor(type: string): string {
  switch (type) {
    case "season":
      return "#bbdefb";
    case "movie":
      return "#e1bee7";
    default:
      return "#e0e0e0";
  }
}

function entryIcon(type: string) {
  switch (type) {
    case "season":
      return <Tv sx={{ fontSize: 14 }} />;
    case "movie":
      return <MovieIcon sx={{ fontSize: 14 }} />;
    default:
      return <FolderIcon sx={{ fontSize: 14 }} />;
  }
}

const SubEntryRow: FC<{
  entry: AnimeEntryInfo;
  isLast: boolean;
  selectedEntryId: number | null;
  onSelectEntry: (entryId: number | null) => void;
  onUploadImages: (entryId: number) => void;
  onRenameEntry: (entryId: number, currentName: string) => void;
  onDeleteEntry: (entryId: number, name: string) => void;
}> = ({
  entry,
  isLast,
  selectedEntryId,
  onSelectEntry,
  onUploadImages,
  onRenameEntry,
  onDeleteEntry,
}) => {
  const isSelected = selectedEntryId === entry.id;

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        pl: 4,
        pr: 0.5,
        py: 0.25,
        minHeight: 32,
        cursor: "pointer",
        borderRadius: "sm",
        bgcolor: isSelected ? "primary.softBg" : "transparent",
        "&:hover": {
          bgcolor: isSelected ? "primary.softBg" : "neutral.softHoverBg",
        },
        "&:hover .sub-entry-actions": { opacity: 1 },
        position: "relative",
      }}
      onClick={() => onSelectEntry(entry.id)}
    >
      {/* Tree-line connector */}
      <Box
        sx={{
          position: "absolute",
          left: 20,
          top: 0,
          bottom: isLast ? "50%" : 0,
          width: 1,
          bgcolor: "#e0e0e0",
        }}
      />
      <Box
        sx={{
          position: "absolute",
          left: 20,
          top: "50%",
          width: 12,
          height: 1,
          bgcolor: "#e0e0e0",
        }}
      />

      <Typography
        level="body-xs"
        sx={{
          flex: 1,
          ml: 2,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {entry.name}
      </Typography>
      <Typography
        level="body-xs"
        sx={{ color: "text.tertiary", mr: 0.5, flexShrink: 0 }}
      >
        {entry.imageCount}
      </Typography>
      <Stack
        direction="row"
        spacing={0.25}
        className="sub-entry-actions"
        sx={{ opacity: 0, transition: "opacity 0.15s", flexShrink: 0 }}
      >
        <IconButton
          size="sm"
          variant="plain"
          color="primary"
          title="Upload images"
          onClick={(e) => {
            e.stopPropagation();
            onUploadImages(entry.id);
          }}
          sx={{ minWidth: 24, minHeight: 24, p: 0.25 }}
        >
          <Upload sx={{ fontSize: 14 }} />
        </IconButton>
        <Dropdown>
          <MenuButton
            slots={{ root: IconButton }}
            slotProps={{
              root: {
                size: "sm",
                variant: "plain",
                color: "neutral",
                sx: { minWidth: 24, minHeight: 24, p: 0.25 },
              },
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreVert sx={{ fontSize: 14 }} />
          </MenuButton>
          <Menu size="sm" placement="bottom-start">
            <MenuItem
              onClick={() => onRenameEntry(entry.id, entry.name)}
            >
              <ListItemDecorator>
                <Edit fontSize="small" />
              </ListItemDecorator>
              Rename
            </MenuItem>
            <ListDivider />
            <MenuItem
              color="danger"
              onClick={() => onDeleteEntry(entry.id, entry.name)}
            >
              <ListItemDecorator>
                <Delete fontSize="small" />
              </ListItemDecorator>
              Delete
            </MenuItem>
          </Menu>
        </Dropdown>
      </Stack>
    </Box>
  );
};

const EntryRow: FC<{
  entry: AnimeEntryInfo;
  selectedEntryId: number | null;
  onSelectEntry: (entryId: number | null) => void;
  onAddSubEntry: (parentId: number) => void;
  onUploadImages: (entryId: number) => void;
  onRenameEntry: (entryId: number, currentName: string) => void;
  onDeleteEntry: (entryId: number, name: string) => void;
}> = ({
  entry,
  selectedEntryId,
  onSelectEntry,
  onAddSubEntry,
  onUploadImages,
  onRenameEntry,
  onDeleteEntry,
}) => {
  const isSelected = selectedEntryId === entry.id;
  const badge = entryBadge(entry.entryType, entry.entryNumber ?? undefined);
  const color = entryColor(entry.entryType);
  const bgColor = entryBgColor(entry.entryType);
  const hasChildren = entry.children && entry.children.length > 0;

  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          minHeight: 38,
          px: 0.5,
          py: 0.25,
          cursor: "pointer",
          borderRadius: "sm",
          bgcolor: isSelected ? "primary.softBg" : "transparent",
          "&:hover": {
            bgcolor: isSelected ? "primary.softBg" : "neutral.softHoverBg",
          },
          "&:hover .entry-actions": { opacity: 1 },
        }}
        onClick={() => onSelectEntry(entry.id)}
      >
        {/* Left color bar */}
        <Box
          sx={{
            width: 4,
            height: 24,
            borderRadius: 2,
            bgcolor: color,
            flexShrink: 0,
            mr: 1,
          }}
        />

        {/* Type badge */}
        {badge && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              bgcolor: bgColor,
              borderRadius: "xs",
              px: 0.75,
              py: 0.125,
              mr: 1,
              minWidth: 24,
              flexShrink: 0,
            }}
          >
            <Typography
              sx={{
                fontSize: 11,
                fontWeight: 700,
                color: color,
                lineHeight: 1.2,
              }}
            >
              {badge}
            </Typography>
          </Box>
        )}

        {/* Icon for legacy entries without a type */}
        {!badge && (
          <Box sx={{ mr: 1, display: "flex", alignItems: "center", flexShrink: 0 }}>
            {entryIcon(entry.entryType)}
          </Box>
        )}

        {/* Name */}
        <Typography
          level="body-sm"
          sx={{
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {entry.name}
        </Typography>

        {/* Image count (includes sub-entry images) */}
        <Typography
          level="body-xs"
          sx={{ color: "text.tertiary", mr: 0.5, flexShrink: 0 }}
        >
          {totalEntryImageCount(entry)}
        </Typography>

        {/* Hover actions */}
        <Stack
          direction="row"
          spacing={0.25}
          className="entry-actions"
          sx={{ opacity: 0, transition: "opacity 0.15s", flexShrink: 0 }}
        >
          <IconButton
            size="sm"
            variant="plain"
            color="primary"
            title="Upload images"
            onClick={(e) => {
              e.stopPropagation();
              onUploadImages(entry.id);
            }}
            sx={{ minWidth: 24, minHeight: 24, p: 0.25 }}
          >
            <Upload sx={{ fontSize: 16 }} />
          </IconButton>
          <IconButton
            size="sm"
            variant="plain"
            color="primary"
            title="Add sub-entry"
            onClick={(e) => {
              e.stopPropagation();
              onAddSubEntry(entry.id);
            }}
            sx={{ minWidth: 24, minHeight: 24, p: 0.25 }}
          >
            <Add sx={{ fontSize: 16 }} />
          </IconButton>
          <Dropdown>
            <MenuButton
              slots={{ root: IconButton }}
              slotProps={{
                root: {
                  size: "sm",
                  variant: "plain",
                  color: "neutral",
                  sx: { minWidth: 24, minHeight: 24, p: 0.25 },
                },
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVert sx={{ fontSize: 16 }} />
            </MenuButton>
            <Menu size="sm" placement="bottom-start">
              <MenuItem
                onClick={() => onRenameEntry(entry.id, entry.name)}
              >
                <ListItemDecorator>
                  <Edit fontSize="small" />
                </ListItemDecorator>
                Rename
              </MenuItem>
              <ListDivider />
              <MenuItem
                color="danger"
                onClick={() => onDeleteEntry(entry.id, entry.name)}
              >
                <ListItemDecorator>
                  <Delete fontSize="small" />
                </ListItemDecorator>
                Delete
              </MenuItem>
            </Menu>
          </Dropdown>
        </Stack>
      </Box>

      {/* Sub-entries */}
      {hasChildren &&
        entry.children.map((child, idx) => (
          <SubEntryRow
            key={child.id}
            entry={child}
            isLast={idx === entry.children.length - 1}
            selectedEntryId={selectedEntryId}
            onSelectEntry={onSelectEntry}
            onUploadImages={onUploadImages}
            onRenameEntry={onRenameEntry}
            onDeleteEntry={onDeleteEntry}
          />
        ))}
    </Box>
  );
};

const EntryList: FC<EntryListProps> = ({
  entries,
  totalImageCount,
  selectedEntryId,
  onSelectEntry,
  onAddSubEntry,
  onUploadImages,
  onRenameEntry,
  onDeleteEntry,
}) => {
  return (
    <Box
      sx={{
        border: "1px solid",
        borderColor: "divider",
        borderRadius: "sm",
        p: 0.5,
      }}
    >
      {/* All Images row */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          minHeight: 38,
          px: 1,
          py: 0.25,
          cursor: "pointer",
          borderRadius: "sm",
          bgcolor:
            selectedEntryId === null ? "primary.softBg" : "transparent",
          "&:hover": {
            bgcolor:
              selectedEntryId === null
                ? "primary.softBg"
                : "neutral.softHoverBg",
          },
        }}
        onClick={() => onSelectEntry(null)}
      >
        <Typography level="body-sm" sx={{ flex: 1, fontWeight: 600 }}>
          All Images
        </Typography>
        <Typography level="body-xs" sx={{ color: "text.tertiary" }}>
          {totalImageCount}
        </Typography>
      </Box>

      {entries.length > 0 && (
        <Box sx={{ mt: 0.5 }}>
          {entries.map((entry) => (
            <EntryRow
              key={entry.id}
              entry={entry}
              selectedEntryId={selectedEntryId}
              onSelectEntry={onSelectEntry}
              onAddSubEntry={onAddSubEntry}
              onUploadImages={onUploadImages}
              onRenameEntry={onRenameEntry}
              onDeleteEntry={onDeleteEntry}
            />
          ))}
        </Box>
      )}

      {entries.length === 0 && (
        <Typography
          level="body-xs"
          sx={{ color: "text.tertiary", px: 1, py: 1 }}
        >
          No entries yet. Click + to add one.
        </Typography>
      )}
    </Box>
  );
};

export default EntryList;
