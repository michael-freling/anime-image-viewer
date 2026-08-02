/**
 * Tag row rendered inside a `CategoryPanel`.
 *
 * Visual layout (ui-design §3.5):
 *   [ select ] [ TagChip ] [usage count] [ search ] [ delete X ]
 *
 * Tapping the chip opens the edit dialog — there is no separate edit button
 * (the chip itself is the edit affordance). The leading checkbox selects the
 * tag for batch actions (e.g. multi-delete); it and the trailing icon buttons
 * `stopPropagation` so they never trigger the chip's edit click.
 */
import { Box, IconButton, chakra } from "@chakra-ui/react";
import { Check, Search, X } from "lucide-react";

import { TagChip } from "../../components/shared/tag-chip";
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
  /** Whether this tag is currently selected for a batch action. */
  selected?: boolean;
  /** Toggle this tag's selection. When omitted, the checkbox is not rendered. */
  onToggleSelect?: (tag: Tag) => void;
}

export function TagRow({
  tag,
  usageCount,
  onEdit,
  onDelete,
  onSearch,
  selected = false,
  onToggleSelect,
}: TagRowProps): JSX.Element {
  const handleEdit = () => onEdit(tag);
  const handleDelete = () => onDelete(tag);
  const handleSearch = () => onSearch?.(tag);
  const handleToggleSelect = () => onToggleSelect?.(tag);

  return (
    <Box
      data-testid="tag-row"
      data-tag-id={tag.id}
      data-selected={selected ? "true" : undefined}
      display="inline-flex"
      alignItems="center"
      gap="8px"
      px="2"
      py="1"
      borderRadius="md"
      bg={selected ? "primary.subtle" : "bg.surface"}
      borderWidth="1px"
      borderColor={selected ? "primary" : "border"}
      _hover={{ borderColor: "primary" }}
    >
      {onToggleSelect && (
        <ChakraButton
          type="button"
          role="checkbox"
          aria-checked={selected}
          aria-label={`Select tag ${tag.name}`}
          data-testid="tag-row-select"
          onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
            event.stopPropagation();
            handleToggleSelect();
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
        onClick={handleEdit}
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
      {onSearch && (
        <IconButton
          type="button"
          size="xs"
          variant="ghost"
          aria-label={`Search images with tag ${tag.name}`}
          data-testid="tag-row-search"
          onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
            event.stopPropagation();
            handleSearch();
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
          handleDelete();
        }}
        color="danger"
        _hover={{ color: "danger", bg: "danger.bg" }}
      >
        <X size={12} aria-hidden="true" />
      </IconButton>
    </Box>
  );
}

export default TagRow;
