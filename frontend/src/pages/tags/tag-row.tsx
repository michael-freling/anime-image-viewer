/**
 * Tag row rendered inside a `CategoryPanel`.
 *
 * Two interaction modes keep the click target unambiguous:
 *   - Normal mode: the row is just the tag chip. Tapping it opens the edit
 *     dialog (the chip is the edit affordance). The Search / Delete icon
 *     buttons stay hidden until the row is hovered or focused, so the default
 *     view is uncluttered.
 *   - Select mode: a leading checkbox appears and tapping the chip toggles
 *     selection instead of editing. The per-row action icons are hidden —
 *     deletion happens through the batch action in the page header.
 */
import { useState } from "react";
import { Box, IconButton, chakra } from "@chakra-ui/react";
import { Check, Search, X } from "lucide-react";

import { TagChip } from "../../components/shared/tag-chip";
import { useLongPress } from "../../hooks/use-long-press";
import { formatCount } from "../../lib/format";
import type { Tag } from "../../types";

const ChakraButton = chakra("button");

export interface TagRowProps {
  tag: Tag;
  /** Number of files this tag is attached to (optional, hidden when null). */
  usageCount?: number | null;
  onEdit: (tag: Tag) => void;
  onDelete: (tag: Tag) => void;
  /** Navigate to search filtered by this tag. */
  onSearch?: (tag: Tag) => void;
  /** When true, the chip toggles selection and the checkbox is shown. */
  selectMode?: boolean;
  /** Whether this tag is currently selected (select mode only). */
  selected?: boolean;
  /** Toggle this tag's selection. */
  onToggleSelect?: (tag: Tag) => void;
  /** Long-press (hold) the tag — used to enter select mode, like the image grid. */
  onLongPress?: (tag: Tag) => void;
}

export function TagRow({
  tag,
  usageCount,
  onEdit,
  onDelete,
  onSearch,
  selectMode = false,
  selected = false,
  onToggleSelect,
  onLongPress,
}: TagRowProps): JSX.Element {
  // Reveal the Search/Delete actions on hover or keyboard focus so the resting
  // row is just the chip. React's onFocus/onBlur bubble, so focusing either
  // action button flips this on.
  const [active, setActive] = useState(false);

  // Hold the tag to enter select mode (mirrors the image grid). firedRef lets
  // us swallow the click that a long-press releases into, so a hold never also
  // edits/toggles.
  const { firedRef, ...longPressHandlers } = useLongPress({
    onLongPress: () => onLongPress?.(tag),
  });

  const handleChipClick = () => {
    if (firedRef.current) {
      firedRef.current = false;
      return;
    }
    if (selectMode) onToggleSelect?.(tag);
    else onEdit(tag);
  };

  return (
    <Box
      {...longPressHandlers}
      data-testid="tag-row"
      data-tag-id={tag.id}
      data-selected={selected ? "true" : undefined}
      style={{ touchAction: "none" }}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
      display="inline-flex"
      alignItems="center"
      gap="8px"
      px="2"
      py="1"
      borderRadius="md"
      bg={selectMode && selected ? "primary.subtle" : "bg.surface"}
      borderWidth="1px"
      borderColor={selectMode && selected ? "primary" : "border"}
      _hover={{ borderColor: "primary" }}
    >
      {selectMode && (
        <ChakraButton
          type="button"
          role="checkbox"
          aria-checked={selected}
          aria-label={`Select tag ${tag.name}`}
          data-testid="tag-row-select"
          onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
            event.stopPropagation();
            onToggleSelect?.(tag);
          }}
          display="flex"
          alignItems="center"
          justifyContent="center"
          width="16px"
          height="16px"
          flexShrink={0}
          borderRadius="sm"
          borderWidth="1.5px"
          borderColor={selected ? "primary" : "border"}
          bg={selected ? "primary" : "transparent"}
          cursor="pointer"
          _focusVisible={{
            outline: "2px solid",
            outlineColor: "primary",
            outlineOffset: "1px",
          }}
        >
          {selected && <Check size={11} color="#ffffff" strokeWidth={3} aria-hidden="true" />}
        </ChakraButton>
      )}
      <TagChip
        tag={tag}
        active
        size="sm"
        onClick={handleChipClick}
      />
      {typeof usageCount === "number" && (
        <Box
          data-testid="tag-row-usage"
          fontSize="11px"
          color="fg.secondary"
          minWidth="60px"
        >
          {formatCount(usageCount, "image")}
        </Box>
      )}
      {!selectMode && (
        <Box
          display="inline-flex"
          alignItems="center"
          gap="1"
          opacity={active ? 1 : 0}
          pointerEvents={active ? "auto" : "none"}
          transition="opacity 120ms ease"
        >
          {onSearch && (
            <IconButton
              type="button"
              size="xs"
              variant="ghost"
              aria-label={`Search images with tag ${tag.name}`}
              data-testid="tag-row-search"
              onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
                event.stopPropagation();
                onSearch(tag);
              }}
              color="fg.secondary"
              _hover={{ color: "fg", bg: "bg.surfaceAlt" }}
            >
              <Search size={12} aria-hidden="true" />
            </IconButton>
          )}
          <IconButton
            type="button"
            size="xs"
            variant="ghost"
            aria-label={`Delete tag ${tag.name}`}
            data-testid="tag-row-delete"
            onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
              event.stopPropagation();
              onDelete(tag);
            }}
            color="danger"
            _hover={{ color: "danger", bg: "danger.bg" }}
          >
            <X size={12} aria-hidden="true" />
          </IconButton>
        </Box>
      )}
    </Box>
  );
}

export default TagRow;
