import { useRef, useCallback } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useImportProgressStore } from "../stores/import-progress-store";
import { useWailsEvent } from "./use-wails-event";
import { BatchImportImageService } from "../lib/api";

interface ImportProgressEvent {
  total: number;
  completed: number;
  failed: number;
}

export function useImageImport() {
  const start = useImportProgressStore((s) => s.start);
  const update = useImportProgressStore((s) => s.update);
  const finish = useImportProgressStore((s) => s.finish);
  const activeIdRef = useRef<string | null>(null);
  const queryClient = useQueryClient();

  // Route global Wails progress events to the active import in the store
  useWailsEvent<ImportProgressEvent>("ImportImages:progress", (data) => {
    const id = activeIdRef.current;
    if (!id) return;

    // Validate data before forwarding to the store.
    if (!Number.isFinite(data.total)) {
      console.warn("[useImageImport] Wails event has non-finite total:", data);
      return;
    }

    // Skip updates for entries that are already finished to prevent late
    // Wails events from overwriting the final state.
    const entry = useImportProgressStore.getState().imports.get(id);
    if (entry?.done) {
      console.warn("[useImageImport] Skipping late progress event for finished import:", id);
      return;
    }

    update(id, { total: data.total, completed: data.completed, failed: data.failed });
  });

  const importImages = useCallback(
    async (directoryId: number, label: string, invalidateKey?: QueryKey) => {
      const id = `img-import-${Date.now()}`;
      activeIdRef.current = id;
      start(id, label, 0);
      try {
        const result = await BatchImportImageService.ImportImages(directoryId);
        const count = Array.isArray(result) ? result.length : 0;
        update(id, { total: count, completed: count });
        finish(id);
        // Clear immediately after finish to close the race window where a
        // late Wails event could arrive during the await below.
        activeIdRef.current = null;
        if (invalidateKey) {
          await queryClient.invalidateQueries({ queryKey: invalidateKey });
        }
      } catch {
        finish(id);
        activeIdRef.current = null;
      }
    },
    [start, update, finish, queryClient],
  );

  return { importImages };
}
