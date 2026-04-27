/**
 * Tag row rendered inside a `CategoryPanel`.
 *
 * Visual layout (ui-design §3.5 wireframe 05-tag-management-desktop.svg):
 *   [ TagChip  ] [usage count] [ edit pencil ] [ delete X ]
 *
 * Clicking the chip opens the edit dialog. The edit pencil and the delete X
 * buttons sit outside the chip and `stopPropagation` so they do not trigger
 * the chip click — the wireframe shows them as separate affordances.
 */
import { Box, IconButton } from "@chakra-ui/react";
import { Pencil, Search, X } from "lucide-react";

import { TagChip } from "../../components/shared/tag-chip";
import { formatCount } from "../../lib/format";
import type { Tag } from "../../types";

export interface TagRowProps {
  tag: Tag;
  /** Number of files this tag is attached to (optional, hidden when null). */
  usageCount?: number | null;
  onEdit: (tag: Tag) => void;
  onDelete: (tag: Tag) => void;
  /** Navigate to search filtered by this tag. */
  onSearch?: (tag: Tag) => void;
}

export function TagRow({
  tag,
  usageCount,
  onEdit,
  onDelete,
  onSearch,
}: TagRowProps): JSX.Element {
  const handleEdit = () => onEdit(tag);
  const handleDelete = () => onDelete(tag);
  const handleSearch = () => onSearch?.(tag);

  return (
    <Box
      data-testid="tag-row"
      data-tag-id={tag.id}
      display="inline-flex"
      alignItems="center"
      gap="8px"
      px="2"
      py="1"
      borderRadius="md"
      bg="bg.surface"
      borderWidth="1px"
      borderColor="border"
      _hover={{ borderColor: "primary" }}
    >
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
        aria-label={`Edit tag ${tag.name}`}
        data-testid="tag-row-edit"
        onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
          event.stopPropagation();
          handleEdit();
        }}
        color="fg.secondary"
        _hover={{ color: "fg", bg: "bg.surfaceAlt" }}
      >
        <Pencil size={12} aria-hidden="true" />
      </IconButton>
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
