/**
 * Full-width selection action bar.
 *
 * Spec: ui-design.md §5.3 "Action bar: Full-width indigo bar with count,
 *       Select All, Clear, Edit Tags, Done".
 * Wireframe: 09-select-mode-desktop.svg — indigo `primary.subtle` bar along
 *            the top of the content area (x=64..1440 on desktop).
 *
 * Visibility: the bar is mounted only when `selectMode` is true. Exit via
 * the "Done" button calls `toggleSelectMode`, which per the selection
 * store also clears the selection.
 *
 * Layout:
 *   [count]     [Select All] [Clear]                    [Edit Tags] [Done]
 *
 * The bar slides up from its own height on entry; the animation is disabled
 * under `prefers-reduced-motion: reduce` so motion-sensitive users see an
 * instant mount.
 */
import type { ReactElement } from "react";
import { Box, Button, Flex, Text } from "@chakra-ui/react";
import { useSelectionStore } from "../../stores/selection-store";

export interface SelectionActionBarProps {
  /**
   * Ids of every image currently rendered in the grid. Used by the
   * "Select All" action. If omitted, Select All is hidden.
   */
  visibleIds?: readonly number[];
  /**
   * Convenience display-only count. If provided and different from
   * `visibleIds.length`, this value wins for the "N / M selected" display.
   * Callers typically pass the total count of images that match the
   * current filter (some of which may be offscreen).
   */
  totalVisible?: number;
  /** Opens the Image Tag Editor for the selected ids. */
  onEditTags?: () => void;
}

/**
 * CSS keyframes for the slide-in animation. Inlined into a <style> so we
 * don't need to touch globals.css (Phase E2 owns that).
 */
const ANIMATION_CSS = `
@keyframes animevault-selection-bar-slide-in {
  from { transform: translateY(-100%); }
  to   { transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  .animevault-selection-bar {
    animation: none !important;
  }
}
`;

export function SelectionActionBar({
  visibleIds,
  totalVisible,
  onEditTags,
}: SelectionActionBarProps): ReactElement | null {
  const selectMode = useSelectionStore((s) => s.selectMode);
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const setSelected = useSelectionStore((s) => s.setSelected);
  const clearSelection = useSelectionStore((s) => s.clearSelection);
  const toggleSelectMode = useSelectionStore((s) => s.toggleSelectMode);

  if (!selectMode) return null;

  const count = selectedIds.size;
  const totalForLabel =
    typeof totalVisible === "number" ? totalVisible : visibleIds?.length;

  const canSelectAll = visibleIds != null && visibleIds.length > 0;

  return (
    <>
      <style>{ANIMATION_CSS}</style>
      <Box
        className="animevault-selection-bar"
        data-testid="selection-action-bar"
        role="toolbar"
        aria-label="Selection actions"
        bg="primary.subtle"
        color="fg"
        borderBottomWidth="1px"
        borderColor="border"
        position="sticky"
        top={0}
        zIndex={10}
        px={4}
        py={2}
        style={{
          animation:
            "animevault-selection-bar-slide-in 180ms ease-out both",
        }}
      >
        <Flex align="center" gap={3}>
          <Text
            fontWeight={600}
            fontSize="sm"
            data-testid="selection-count"
            aria-live="polite"
          >
            {count} selected
            {typeof totalForLabel === "number" && totalForLabel > 0
              ? ` / ${totalForLabel}`
              : ""}
          </Text>

          {canSelectAll ? (
            <Button
              size="xs"
              variant="subtle"
              onClick={() => setSelected(visibleIds!)}
              data-testid="selection-select-all"
              aria-label="Select all visible images"
            >
              Select All
            </Button>
          ) : null}

          <Button
            size="xs"
            variant="subtle"
            onClick={() => clearSelection()}
            disabled={count === 0}
            data-testid="selection-clear"
            aria-label="Clear selection"
          >
            Clear
          </Button>

          <Box flex="1" />

          {onEditTags ? (
            <Button
              size="xs"
              colorPalette="indigo"
              onClick={onEditTags}
              disabled={count === 0}
              data-testid="selection-edit-tags"
              aria-label="Edit tags for selected images"
            >
              Edit Tags
            </Button>
          ) : null}

          <Button
            size="xs"
            variant="outline"
            onClick={() => toggleSelectMode()}
            data-testid="selection-done"
            aria-label="Exit select mode"
          >
            Done
          </Button>
        </Flex>
      </Box>
    </>
  );
}

export default SelectionActionBar;
