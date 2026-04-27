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
    update(id, { total: data.total, completed: data.completed, failed: data.failed });
  });

  const importImages = useCallback(
    async (directoryId: number, label: string, invalidateKey?: QueryKey) => {
      const id = `img-import-${Date.now()}`;
      activeIdRef.current = id;
      start(id, label, 0);
      try {
        await BatchImportImageService.ImportImages(directoryId);
        finish(id);
        if (invalidateKey) {
          await queryClient.invalidateQueries({ queryKey: invalidateKey });
        }
      } catch {
        finish(id);
      } finally {
        activeIdRef.current = null;
      }
    },
    [start, finish, queryClient],
  );

  return { importImages };
}
