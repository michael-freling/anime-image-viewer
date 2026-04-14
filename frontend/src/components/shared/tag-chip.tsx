/**
 * Colored tag pill used across search filters, anime detail and tag
 * management (ui-design.md §4.3, wireframes 02c / 04 / 05).
 *
 * The chip's background / foreground colors come from the tag category,
 * resolved via `tagCategoryKey` so both normalised keys ("scene") and
 * display labels ("Scene/Action") pick the same token pair.
 *
 * Two visual states:
 *   - inactive (ghost/outline)   -- transparent bg, category fg as text
 *   - active (filled)            -- category bg + category fg
 * An optional `onRemove` renders a small `X` inside the chip. The handler
 * stops click propagation so it does not trigger `onClick` on the chip.
 */
import { Box, chakra } from "@chakra-ui/react";
import { X } from "lucide-react";

import { TAG_CATEGORY_TOKENS, tagCategoryKey } from "../../lib/constants";
import type { Tag } from "../../types";

const ChipButton = chakra("button");
const RemoveButton = chakra("button");

export type TagChipSize = "sm" | "md";

export interface TagChipProps {
  tag: Tag;
  /** Filled vs ghost style. Default: inactive (ghost). */
  active?: boolean;
  /** Click on the chip body. */
  onClick?: () => void;
  /**
   * When provided a small X is rendered inside the chip; clicking it calls
   * the handler and stops propagation so the chip body onClick does not
   * fire.
   */
  onRemove?: () => void;
  /** Visual size preset. */
  size?: TagChipSize;
  /** Optional explicit label override (defaults to `tag.name`). */
  label?: string;
}

interface SizeConfig {
  px: string;
  py: string;
  fontSize: string;
  iconSize: number;
  height: string;
}

const SIZE_CONFIGS: Record<TagChipSize, SizeConfig> = {
  sm: {
    px: "8px",
    py: "2px",
    fontSize: "11px",
    iconSize: 10,
    height: "22px",
  },
  md: {
    px: "12px",
    py: "4px",
    fontSize: "12px",
    iconSize: 12,
    height: "28px",
  },
};

export function TagChip({
  tag,
  active = false,
  onClick,
  onRemove,
  size = "md",
  label,
}: TagChipProps): JSX.Element {
  const categoryKey = tagCategoryKey(tag.category);
  const tokens = TAG_CATEGORY_TOKENS[categoryKey];
  const sizing = SIZE_CONFIGS[size];
  const displayLabel = label ?? tag.name;

  const bodyBg = active ? tokens.bg : "transparent";

  return (
    <ChipButton
      type="button"
      onClick={onClick}
      disabled={!onClick}
      data-testid="tag-chip"
      data-category={categoryKey}
      data-active={active || undefined}
      aria-pressed={onClick ? active : undefined}
      display="inline-flex"
      alignItems="center"
      gap="6px"
      height={sizing.height}
      px={sizing.px}
      py={sizing.py}
      fontSize={sizing.fontSize}
      fontWeight="500"
      bg={bodyBg}
      color={tokens.fg}
      border="1px solid"
      borderColor={tokens.fg}
      borderRadius="pill"
      cursor={onClick ? "pointer" : "default"}
      transition="background 0.15s ease-out, transform 0.1s ease-out"
      _hover={
        onClick
          ? {
              bg: active ? tokens.bg : tokens.bg,
              transform: "translateY(-1px)",
            }
          : undefined
      }
      _active={onClick ? { transform: "translateY(0)" } : undefined}
      _focusVisible={{
        outline: "2px solid",
        outlineColor: "primary",
        outlineOffset: "2px",
      }}
      _disabled={{
        cursor: "default",
        opacity: 1,
      }}
    >
      <Box as="span" data-testid="tag-chip-label">
        {displayLabel}
      </Box>
      {onRemove && (
        <RemoveButton
          as="span"
          data-testid="tag-chip-remove"
          aria-label={`Remove ${displayLabel}`}
          onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
            event.stopPropagation();
            event.preventDefault();
            onRemove();
          }}
          display="inline-flex"
          alignItems="center"
          justifyContent="center"
          width="14px"
          height="14px"
          borderRadius="pill"
          bg="transparent"
          color={tokens.fg}
          border="none"
          cursor="pointer"
          p="0"
          _hover={{ opacity: 0.7 }}
          _focusVisible={{
            outline: "2px solid",
            outlineColor: "primary",
            outlineOffset: "1px",
          }}
        >
          <X size={sizing.iconSize} strokeWidth={2.5} aria-hidden="true" />
        </RemoveButton>
      )}
    </ChipButton>
  );
}

export default TagChip;
