import { useCallback } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useImportProgressStore } from "../stores/import-progress-store";
import { useWailsEvent } from "./use-wails-event";
import { BatchImportImageService } from "../lib/api";
import { qk } from "../lib/query-keys";

interface ImportProgressEvent {
  total: number;
  completed: number;
  failed: number;
}

/**
 * Single, stable progress-row id for image imports.
 *
 * The backend emits ONE global `ImportImages:progress` event with no import
 * identifier, so the app can only ever track a single image import at a time.
 * Keying the store entry by a stable id (rather than `Date.now()`) guarantees
 * a single progress row: repeated or overlapping uploads update the same bar
 * instead of stacking up frozen, never-updated rows.
 */
const IMAGE_IMPORT_ID = "image-import";

/** React Query prefix for every search query (see `qk.search`). */
const SEARCH_QUERY_PREFIX = ["search"] as const;

export function useImageImport() {
  const start = useImportProgressStore((s) => s.start);
  const update = useImportProgressStore((s) => s.update);
  const finish = useImportProgressStore((s) => s.finish);
  const queryClient = useQueryClient();

  // Route global Wails progress events to the single active import row.
  useWailsEvent<ImportProgressEvent>("ImportImages:progress", (data) => {
    // Validate data before forwarding to the store.
    if (!Number.isFinite(data.total)) {
      console.warn("[useImageImport] Wails event has non-finite total:", data);
      return;
    }

    const entry = useImportProgressStore.getState().imports.get(IMAGE_IMPORT_ID);
    // No import is currently being tracked — ignore stray events.
    if (!entry) return;
    // Skip updates for an entry that already finished to prevent late Wails
    // events from overwriting the final state.
    if (entry.done) {
      console.warn("[useImageImport] Skipping late progress event for finished import:", IMAGE_IMPORT_ID);
      return;
    }

    update(IMAGE_IMPORT_ID, {
      total: data.total,
      completed: data.completed,
      failed: data.failed,
    });
  });

  const importImages = useCallback(
    async (directoryId: number, label: string, invalidateKey?: QueryKey) => {
      const id = IMAGE_IMPORT_ID;
      // `start` overwrites any prior (possibly finished) row at the same id, so
      // there is always exactly one image-import bar on screen.
      start(id, label, 0);
      try {
        const result = await BatchImportImageService.ImportImages(directoryId);
        const count = Array.isArray(result) ? result.length : 0;
        update(id, { total: count, completed: count });
        finish(id);
        // Refresh every surface that can render the freshly-imported images so
        // they appear immediately in grids and the viewer: the caller's key
        // (e.g. anime detail counts), all anime image grids, and any active
        // search/season results.
        if (invalidateKey) {
          await queryClient.invalidateQueries({ queryKey: invalidateKey });
        }
        await queryClient.invalidateQueries({ queryKey: qk.anime.all });
        await queryClient.invalidateQueries({ queryKey: SEARCH_QUERY_PREFIX });
      } catch {
        finish(id);
      }
    },
    [start, update, finish, queryClient],
  );

  return { importImages };
}
