/**
 * Collapsible tag category group used by the Tag Management page
 * (wireframe 05-tag-management-desktop.svg, ui-design.md §3.5).
 *
 * Header row: colored indicator bar (4px) + name + tag-count badge +
 * expand/collapse chevron. The whole row is the toggle target so users can
 * click anywhere on it. Keyboard Enter/Space toggle to match ARIA button
 * semantics.
 *
 * The body renders `children` in a flex column with 8px gap. Collapse is
 * animated with a CSS `max-height` transition; we respect
 * `prefers-reduced-motion` via the global reducer in `globals.css`.
 */
import { Box, Flex, Text, chakra } from "@chakra-ui/react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useCallback, useState } from "react";

import type { TagCategoryKey } from "../../types";

const HeaderButton = chakra("button");

/**
 * The category payload the section needs to render. Tag-management works
 * with a rich `TagCategory` but the header only cares about a few fields, so
 * we accept a slim descriptor.
 */
export interface CategoryHeader {
  key: TagCategoryKey | string;
  label: string;
  /** Number of tags inside the category (rendered in the pill badge). */
  tagCount: number;
  /**
   * Optional color override for the indicator bar. Defaults to `primary`.
   * Accepts any Chakra color token (e.g. `"tag.scene.fg"`).
   */
  color?: string;
}

export interface CategorySectionProps {
  category: CategoryHeader;
  children: React.ReactNode;
  /** Whether the section starts expanded. Defaults to `true`. */
  defaultOpen?: boolean;
  /** Controlled mode — when provided the caller owns open/closed state. */
  open?: boolean;
  /** Fires whenever the visible open state changes. */
  onToggle?: (open: boolean) => void;
}

export function CategorySection({
  category,
  children,
  defaultOpen = true,
  open,
  onToggle,
}: CategorySectionProps): JSX.Element {
  const isControlled = open !== undefined;
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = isControlled ? open! : internalOpen;

  const toggle = useCallback(() => {
    const next = !isOpen;
    if (!isControlled) {
      setInternalOpen(next);
    }
    onToggle?.(next);
  }, [isOpen, isControlled, onToggle]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggle();
      }
    },
    [toggle],
  );

  const contentId = `category-${category.key}-content`;
  const Chevron = isOpen ? ChevronDown : ChevronRight;

  return (
    <Box
      data-testid="category-section"
      data-category-key={category.key}
      data-open={isOpen || undefined}
      borderRadius="md"
      overflow="hidden"
    >
      <HeaderButton
        type="button"
        onClick={toggle}
        onKeyDown={handleKeyDown}
        data-testid="category-section-header"
        aria-expanded={isOpen}
        aria-controls={contentId}
        display="flex"
        alignItems="center"
        gap="12px"
        width="100%"
        padding="10px 16px"
        bg="bg.surface"
        border="none"
        cursor="pointer"
        color="fg"
        textAlign="left"
        transition="background 0.15s ease-out"
        _hover={{ bg: "bg.surfaceAlt" }}
        _focusVisible={{
          outline: "2px solid",
          outlineColor: "primary",
          outlineOffset: "-2px",
        }}
      >
        <Chevron
          size={14}
          aria-hidden="true"
          data-testid="category-section-chevron"
        />
        {/* Colored indicator bar (4px wide) — ui-design §3.5. */}
        <Box
          data-testid="category-section-indicator"
          width="4px"
          height="16px"
          borderRadius="2px"
          bg={category.color ?? "primary"}
        />
        <Text fontSize="13px" fontWeight="600" flex="1">
          {category.label}
        </Text>
        <Flex
          data-testid="category-section-badge"
          align="center"
          justify="center"
          minWidth="24px"
          height="18px"
          px="6px"
          borderRadius="pill"
          bg="bg.surfaceAlt"
          color="fg.secondary"
          fontSize="10px"
          fontWeight="500"
        >
          {category.tagCount}
        </Flex>
      </HeaderButton>

      {/*
        Body. We keep the node in the tree (hidden rather than unmounted)
        so consumers can animate height and so focus-within selectors in
        ancestors still work while closed.
      */}
      <Box
        id={contentId}
        role="region"
        aria-labelledby={contentId}
        hidden={!isOpen}
        data-testid="category-section-content"
        bg="bg.base"
        padding={isOpen ? "12px 16px" : "0 16px"}
        transition="padding 0.15s ease-out, max-height 0.2s ease-out"
      >
        {isOpen && (
          <Flex direction="column" gap="8px">
            {children}
          </Flex>
        )}
      </Box>
    </Box>
  );
}

export default CategorySection;
