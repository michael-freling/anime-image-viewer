/**
 * `usePendingTagChanges` — local hook that tracks a user's pending tag
 * add/remove edits in the Image Tag Editor.
 *
 * The tri-state source of truth is `useTagStats(selectedImageIds)` in the
 * page; this hook layers a set of "adding" (user wants to apply to all) and
 * "removing" (user wants to strip from all) tag ids on top of that baseline.
 *
 * Semantics per ui-design.md §3.6:
 *   - Baseline `checked` tag toggled → pending `removing`.
 *   - Baseline `indeterminate` tag toggled → resolves to `checked` (add to
 *     all); second toggle → `removing`.
 *   - Baseline `unchecked` tag toggled → pending `adding`.
 *   - Toggling again on a pending row clears it (returns to baseline).
 *
 * Save dispatches the accumulated add/remove sets in one round; Cancel clears
 * them.
 */
import { useCallback, useMemo, useState } from "react";

export type PendingState = "adding" | "removing" | null;
export type BaselineState = "checked" | "indeterminate" | "unchecked";

export interface PendingTagChanges {
  /** Tag ids the user wants to add to every selected image. */
  adding: ReadonlySet<number>;
  /** Tag ids the user wants to remove from every selected image. */
  removing: ReadonlySet<number>;
  /** Total number of pending edits (|adding| + |removing|). */
  count: number;
  /**
   * Effective state for a given tag: baseline merged with user edits.
   * `adding`/`removing` are the pending states; the underlying `state` is
   * what the tri-state checkbox should render in terms of fill/dash/blank.
   */
  getEffectiveState: (
    tagId: number,
    baseline: BaselineState,
  ) => { state: BaselineState; pending: PendingState };
  /** Toggle a tag row. See file header for state-transition semantics. */
  toggle: (tagId: number, baseline: BaselineState) => void;
  /** Reset the pending sets (used by Cancel). */
  clear: () => void;
  /** True when the user has at least one pending add or remove. */
  hasChanges: boolean;
}

export function usePendingTagChanges(): PendingTagChanges {
  const [adding, setAdding] = useState<Set<number>>(() => new Set<number>());
  const [removing, setRemoving] = useState<Set<number>>(() => new Set<number>());

  const toggle = useCallback(
    (tagId: number, baseline: BaselineState) => {
      const isAdding = adding.has(tagId);
      const isRemoving = removing.has(tagId);

      // Clicking a pending row clears it (back to baseline).
      if (isAdding) {
        const next = new Set(adding);
        next.delete(tagId);
        setAdding(next);
        return;
      }
      if (isRemoving) {
        const next = new Set(removing);
        next.delete(tagId);
        setRemoving(next);
        return;
      }

      // No pending edit yet — branch on baseline.
      if (baseline === "checked") {
        // All images have the tag; user wants to strip it.
        const next = new Set(removing);
        next.add(tagId);
        setRemoving(next);
      } else if (baseline === "indeterminate") {
        // Some have it; clicking resolves to "add to all".
        const next = new Set(adding);
        next.add(tagId);
        setAdding(next);
      } else {
        // Nothing has it; user wants to add to all.
        const next = new Set(adding);
        next.add(tagId);
        setAdding(next);
      }
    },
    [adding, removing],
  );

  const clear = useCallback(() => {
    setAdding(new Set<number>());
    setRemoving(new Set<number>());
  }, []);

  const getEffectiveState = useCallback(
    (
      tagId: number,
      baseline: BaselineState,
    ): { state: BaselineState; pending: PendingState } => {
      if (adding.has(tagId)) {
        return { state: baseline, pending: "adding" };
      }
      if (removing.has(tagId)) {
        return { state: baseline, pending: "removing" };
      }
      return { state: baseline, pending: null };
    },
    [adding, removing],
  );

  const hasChanges = adding.size > 0 || removing.size > 0;
  const count = adding.size + removing.size;

  return useMemo(
    () => ({
      adding,
      removing,
      count,
      getEffectiveState,
      toggle,
      clear,
      hasChanges,
    }),
    [adding, removing, count, getEffectiveState, toggle, clear, hasChanges],
  );
}

/**
 * Derive the baseline tri-state for a tag from `useTagStats` output.
 *
 *  - fileCount === totalSelected  → checked (all selected images have it)
 *  - 0 < fileCount < totalSelected → indeterminate
 *  - fileCount === 0              → unchecked
 */
export function deriveBaselineState(
  fileCount: number,
  totalSelected: number,
): BaselineState {
  if (totalSelected <= 0) return "unchecked";
  if (fileCount >= totalSelected) return "checked";
  if (fileCount > 0) return "indeterminate";
  return "unchecked";
}
