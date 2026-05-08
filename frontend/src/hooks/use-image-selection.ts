/**
 * Click-event semantics over the selection store.
 *
 * Spec: ui-design.md §5.1 Selection Methods.
 *
 *   | Click        | Toggle single image                |
 *   | Shift+Click  | Select range from last selected    |
 *   | Ctrl+Click   | Add/remove without clearing        |
 *   | Ctrl+A       | Select all in current view         |
 *
 * Why `toggleOne` for a plain click (not "replace selection"):
 *   - The design spec column literally says "Toggle single image", not
 *     "replace selection with this image". This matches how Pinterest /
 *     Google Photos behave in select mode — tapping an already-selected
 *     image deselects it rather than wiping the rest of the selection.
 *   - Replace-semantics would be surprising when a user drags a rubber
 *     band to accumulate a selection and then plain-clicks the last item
 *     to confirm; they'd lose everything.
 *
 * Ctrl+A binding: active only while `selectMode` is true so that normal
 * text selection in inputs elsewhere on the page is untouched.
 */
import { useCallback, useMemo } from "react";
import { useHotkeys } from "@mantine/hooks";
import { useSelectionStore } from "../stores/selection-store";

export interface ImageClickEvent {
  /** The mouse event (or pointer event) we read key modifiers from. */
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

export interface UseImageSelectionReturn {
  selectMode: boolean;
  selectedIds: Set<number>;
  /** Predicate form that avoids `.has(id)` at each call site. */
  isSelected: (id: number) => boolean;
  /**
   * The main click handler for image tiles. Reads key modifiers off the
   * event and dispatches to the correct store action.
   *
   * Outside select mode this is a no-op; the tile should probably open the
   * image viewer instead — that decision belongs to the consumer.
   */
  handleClick: (event: ImageClickEvent, id: number) => void;
  /**
   * Explicit range-click. Ignores modifiers and always performs a range
   * select from the current anchor. Useful for UI affordances that mean
   * "range" unconditionally (e.g. a "Select from here" context menu item).
   */
  handleRangeClick: (event: ImageClickEvent, id: number) => void;
}

export function useImageSelection(
  allIds: readonly number[],
): UseImageSelectionReturn {
  const selectMode = useSelectionStore((s) => s.selectMode);
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const lastSelectedId = useSelectionStore((s) => s.lastSelectedId);
  const toggleOne = useSelectionStore((s) => s.toggleOne);
  const selectRange = useSelectionStore((s) => s.selectRange);
  const setSelected = useSelectionStore((s) => s.setSelected);

  const isSelected = useCallback(
    (id: number) => selectedIds.has(id),
    [selectedIds],
  );

  const handleClick = useCallback(
    (event: ImageClickEvent, id: number) => {
      if (!selectMode) return;
      if (event.shiftKey) {
        selectRange(lastSelectedId, id, allIds);
        return;
      }
      // Ctrl on Windows/Linux, Cmd on macOS.
      if (event.ctrlKey || event.metaKey) {
        toggleOne(id);
        return;
      }
      // Plain click in select mode: toggle. See header comment for why we
      // do not use replace semantics.
      toggleOne(id);
    },
    [allIds, lastSelectedId, selectMode, selectRange, toggleOne],
  );

  const handleRangeClick = useCallback(
    (_event: ImageClickEvent, id: number) => {
      if (!selectMode) return;
      selectRange(lastSelectedId, id, allIds);
    },
    [allIds, lastSelectedId, selectMode, selectRange],
  );

  // Ctrl+A / Cmd+A selects all visible ids while in select mode.
  // `mod` matches ctrl on Windows/Linux and cmd on macOS. `useHotkeys`
  // installs a single window-level listener; attaching it conditionally
  // based on `selectMode` lets the browser's native Ctrl+A work outside
  // select mode.
  useHotkeys(
    selectMode
      ? [
          [
            "mod+A",
            (event) => {
              event.preventDefault();
              setSelected(allIds);
            },
          ],
        ]
      : [],
  );

  return useMemo(
    () => ({
      selectMode,
      selectedIds,
      isSelected,
      handleClick,
      handleRangeClick,
    }),
    [handleClick, handleRangeClick, isSelected, selectMode, selectedIds],
  );
}
