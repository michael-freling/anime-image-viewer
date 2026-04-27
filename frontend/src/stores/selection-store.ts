/**
 * Selection state for the image grid.
 *
 * Spec: ui-design.md §5 "Select Mode Specification".
 *
 * The store is a `Set<number>` of image ids plus a `lastSelectedId` anchor
 * used to compute shift-click ranges. `selectRange` is driven by the caller:
 * it passes the current ordering of image ids in the grid so the range is
 * well-defined even when the view is filtered or sorted.
 *
 * Immutability rules Zustand relies on: we always return a new Set rather
 * than mutating the existing one, otherwise selectors using
 * `useStore(s => s.selectedIds)` would not re-render.
 */

import { create } from "zustand";

export interface SelectionState {
  selectMode: boolean;
  selectedIds: Set<number>;
  lastSelectedId: number | null;

  /** Toggle select mode on/off. Turning it off clears the selection. */
  toggleSelectMode: () => void;

  /** Replace the selection wholesale (e.g. Select All). */
  setSelected: (ids: Iterable<number>) => void;

  /** Add/remove a single id (Ctrl+click). */
  toggleOne: (id: number) => void;

  /**
   * Shift+click range. `allIds` is the ordered list of ids currently on
   * screen; the range is every id between `from` and `to` inclusive, where
   * `from` is `lastSelectedId` or the first visible id if no anchor exists.
   *
   * The range is ADDED to the existing selection (so shift+click doesn't
   * wipe already-selected items outside the range). If `from` is not in
   * `allIds`, behaviour degrades to `toggleOne(to)`.
   */
  selectRange: (from: number | null, to: number, allIds: readonly number[]) => void;

  /** Clear the selection. Does not exit select mode. */
  clearSelection: () => void;
}

export const useSelectionStore = create<SelectionState>()((set) => ({
  selectMode: false,
  selectedIds: new Set<number>(),
  lastSelectedId: null,

  toggleSelectMode: () =>
    set((state) =>
      state.selectMode
        ? {
            selectMode: false,
            // Exiting select mode always clears the selection (ui-design §5).
            selectedIds: new Set<number>(),
            lastSelectedId: null,
          }
        : { selectMode: true },
    ),

  setSelected: (ids) => {
    const next = new Set<number>(ids);
    set({ selectedIds: next });
  },

  toggleOne: (id) =>
    set((state) => {
      const next = new Set(state.selectedIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return { selectedIds: next, lastSelectedId: id };
    }),

  selectRange: (from, to, allIds) =>
    set((state) => {
      if (allIds.length === 0) return state;

      const toIndex = allIds.indexOf(to);
      if (toIndex === -1) return state;

      // If no anchor or the anchor is not in the current ordering, fall
      // back to toggling `to`.
      const fromIndex = from == null ? -1 : allIds.indexOf(from);
      if (fromIndex === -1) {
        const next = new Set(state.selectedIds);
        next.add(to);
        return { selectedIds: next, lastSelectedId: to };
      }

      const [start, end] =
        fromIndex <= toIndex ? [fromIndex, toIndex] : [toIndex, fromIndex];

      const next = new Set(state.selectedIds);
      for (let i = start; i <= end; i++) {
        next.add(allIds[i]);
      }
      return { selectedIds: next, lastSelectedId: to };
    }),

  clearSelection: () =>
    set({ selectedIds: new Set<number>(), lastSelectedId: null }),
}));
