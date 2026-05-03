/**
 * `usePendingCharacterChanges` — local hook that tracks a user's pending
 * character add/remove edits in the Image Editor.
 *
 * Mirrors the tag editor's `usePendingTagChanges` hook but adapted for
 * character assignments. Characters are either assigned or not (no
 * indeterminate state for a single character — but with multiple images
 * selected, a character can be partially assigned).
 */
import { useCallback, useMemo, useState } from "react";

export type CharacterBaselineState = "checked" | "indeterminate" | "unchecked";
export type CharacterPendingState = "adding" | "removing" | null;

export interface PendingCharacterChanges {
  adding: ReadonlySet<number>;
  removing: ReadonlySet<number>;
  count: number;
  getEffectiveState: (
    characterId: number,
    baseline: CharacterBaselineState,
  ) => { state: CharacterBaselineState; pending: CharacterPendingState };
  toggle: (characterId: number, baseline: CharacterBaselineState) => void;
  clear: () => void;
  hasChanges: boolean;
}

export function usePendingCharacterChanges(): PendingCharacterChanges {
  const [adding, setAdding] = useState<Set<number>>(() => new Set<number>());
  const [removing, setRemoving] = useState<Set<number>>(
    () => new Set<number>(),
  );

  const toggle = useCallback(
    (characterId: number, baseline: CharacterBaselineState) => {
      const isAdding = adding.has(characterId);
      const isRemoving = removing.has(characterId);

      if (isAdding) {
        const next = new Set(adding);
        next.delete(characterId);
        setAdding(next);
        return;
      }
      if (isRemoving) {
        const next = new Set(removing);
        next.delete(characterId);
        setRemoving(next);
        return;
      }

      if (baseline === "checked") {
        const next = new Set(removing);
        next.add(characterId);
        setRemoving(next);
      } else if (baseline === "indeterminate") {
        const next = new Set(adding);
        next.add(characterId);
        setAdding(next);
      } else {
        const next = new Set(adding);
        next.add(characterId);
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
      characterId: number,
      baseline: CharacterBaselineState,
    ): { state: CharacterBaselineState; pending: CharacterPendingState } => {
      if (adding.has(characterId)) {
        return { state: baseline, pending: "adding" };
      }
      if (removing.has(characterId)) {
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
 * Derive the baseline state for a character from the number of selected images
 * that have it assigned.
 */
export function deriveCharacterBaselineState(
  fileCount: number,
  totalSelected: number,
): CharacterBaselineState {
  if (totalSelected <= 0) return "unchecked";
  if (fileCount >= totalSelected) return "checked";
  if (fileCount > 0) return "indeterminate";
  return "unchecked";
}
