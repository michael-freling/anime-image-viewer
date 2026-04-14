/**
 * Image import progress store.
 *
 * Replaces the existing `ImportImageContext` provider with a Zustand store so
 * the toast/progress surface can read state without a Context wrapper around
 * the whole app.
 *
 * An import is identified by an arbitrary caller-supplied string id — the
 * frontend-side nonce, NOT the backend job id — so the same UI can track
 * several concurrent imports from different entries.
 */

import { create } from "zustand";

export interface ImportProgress {
  total: number;
  completed: number;
  /** Human label shown in the toast (e.g. "Naruto · Season 1"). */
  label: string;
  /** True once the whole batch finishes. UI can GC after reading. */
  done?: boolean;
  /** Count of individual file failures if the backend reports any. */
  failed?: number;
}

export interface ImportProgressState {
  imports: Map<string, ImportProgress>;

  /** Start tracking an import. Overwrites any existing entry at the same id. */
  start: (id: string, label: string, total: number) => void;

  /**
   * Update an in-flight import. `progress` is a partial so callers can
   * forward the backend's ImportProgressEvent directly.
   */
  update: (id: string, progress: Partial<Omit<ImportProgress, "label">>) => void;

  /** Mark an import as finished. Does not remove it — the UI can animate out. */
  finish: (id: string) => void;

  /** Remove an entry from the store once the UI has animated it out. */
  dismiss: (id: string) => void;
}

export const useImportProgressStore = create<ImportProgressState>()(
  (set) => ({
    imports: new Map(),

    start: (id, label, total) =>
      set((state) => {
        const next = new Map(state.imports);
        next.set(id, { total, completed: 0, label, done: false });
        return { imports: next };
      }),

    update: (id, progress) =>
      set((state) => {
        const current = state.imports.get(id);
        if (!current) return state;
        const next = new Map(state.imports);
        next.set(id, { ...current, ...progress });
        return { imports: next };
      }),

    finish: (id) =>
      set((state) => {
        const current = state.imports.get(id);
        if (!current) return state;
        const next = new Map(state.imports);
        next.set(id, {
          ...current,
          done: true,
          completed: current.total,
        });
        return { imports: next };
      }),

    dismiss: (id) =>
      set((state) => {
        if (!state.imports.has(id)) return state;
        const next = new Map(state.imports);
        next.delete(id);
        return { imports: next };
      }),
  }),
);
