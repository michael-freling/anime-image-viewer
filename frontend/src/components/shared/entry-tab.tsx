/**
 * Horizontal entry sub-filter tab. Spec: ui-design.md §3.2.1 and wireframe
 * `02-anime-detail-desktop.svg` (entry sub-filter bar).
 *
 * Each tab is a button so keyboard users can activate it with Enter/Space,
 * and right-click exposes a context menu (rename, delete, upload…) via
 * `onContextMenu`. The count badge is only rendered when a number is given —
 * "All" tabs also pass the total so the UI stays consistent.
 *
 * The parent flex container should use `flex-wrap: wrap`; we do NOT use
 * horizontal scrolling because the wireframe shows tabs wrapping on narrow
 * screens.
 */
import { Box, chakra } from "@chakra-ui/react";
import { MouseEvent } from "react";

const ChakraButton = chakra("button");

export interface EntryTabProps {
  label: string;
  count?: number;
  active?: boolean;
  onClick?: () => void;
  onContextMenu?: (e: MouseEvent) => void;
}

export function EntryTab({
  label,
  count,
  active = false,
  onClick,
  onContextMenu,
}: EntryTabProps): JSX.Element {
  return (
    <ChakraButton
      type="button"
      role="tab"
      aria-selected={active}
      data-active={active ? "true" : undefined}
      onClick={onClick}
      onContextMenu={onContextMenu}
      display="inline-flex"
      alignItems="center"
      gap="2"
      px="3"
      py="1"
      borderRadius="md"
      bg={active ? "primary.subtle" : "transparent"}
      color={active ? "primary" : "fg.secondary"}
      fontSize="sm"
      fontWeight={active ? "600" : "500"}
      cursor="pointer"
      border="none"
      transition="background-color 120ms, color 120ms"
      _hover={{
        bg: active ? "primary.subtle" : "bg.surfaceAlt",
        color: active ? "primary" : "fg",
      }}
      _focusVisible={{
        outline: "2px solid",
        outlineColor: "primary",
        outlineOffset: "2px",
      }}
    >
      <Box as="span">{label}</Box>
      {typeof count === "number" && (
        <Box
          as="span"
          data-testid="entry-tab-count"
          display="inline-flex"
          alignItems="center"
          justifyContent="center"
          minWidth="20px"
          px="1"
          borderRadius="pill"
          fontSize="xs"
          fontWeight="500"
          bg={active ? "primary" : "bg.surfaceAlt"}
          color={active ? "bg.surface" : "fg.secondary"}
        >
          {count}
        </Box>
      )}
    </ChakraButton>
  );
}

export default EntryTab;
