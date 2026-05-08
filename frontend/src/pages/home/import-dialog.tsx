/**
 * HomeImportDialog — wires the shared `ImportFoldersDialog` to the Wails
 * `AnimeService` endpoints used on the Home page.
 *
 * Responsibilities (kept out of `index.tsx` so the page stays thin):
 *   - Fetch unassigned top folders when the dialog opens.
 *   - Track an in-flight import via Zustand (`import-progress-store`).
 *   - On success, invalidate `qk.anime.list()` so the Home grid refreshes,
 *     show a toast, and close the dialog.
 *   - On failure, surface the error inside the dialog without closing it.
 *
 * The component is fully controlled: the parent decides `open` via the
 * `?create=1` query parameter and calls `onClose` to clear it.
 */
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import {
  ImportFoldersDialog,
  type ImportableFolder,
} from "../../components/shared/import-folders-dialog";
import { toast } from "../../components/ui/toaster";
import { AnimeService } from "../../lib/api";
import { formatCount } from "../../lib/format";
import { qk } from "../../lib/query-keys";
import { useImportProgressStore } from "../../stores/import-progress-store";

export interface HomeImportDialogProps {
  open: boolean;
  onClose: () => void;
}

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return typeof err === "string" ? err : "Unexpected error";
}

export function HomeImportDialog({
  open,
  onClose,
}: HomeImportDialogProps): JSX.Element {
  const [folders, setFolders] = useState<ImportableFolder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const progressStart = useImportProgressStore((s) => s.start);
  const progressFinish = useImportProgressStore((s) => s.finish);
  const queryClient = useQueryClient();
  // Track the previous `open` value so we only trigger a folder fetch on the
  // closed → open edge. `useRef` survives strict-mode double mounts.
  const lastOpenRef = useRef(false);

  useEffect(() => {
    if (!open) {
      lastOpenRef.current = false;
      return;
    }
    if (lastOpenRef.current) {
      return;
    }
    lastOpenRef.current = true;
    let cancelled = false;
    setFolders([]);
    setError(null);
    setLoading(true);
    (async () => {
      try {
        const response = (await AnimeService.ListUnassignedTopFolders()) as
          | ImportableFolder[]
          | null
          | undefined;
        if (cancelled) return;
        setFolders(response ?? []);
      } catch (err) {
        if (cancelled) return;
        setError(extractErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleImport = async (ids: number[]): Promise<void> => {
    if (ids.length === 0) return;
    setError(null);
    const progressId = `home-import-${Date.now()}`;
    // Surface the batch in the bottom progress bar so the user knows it is
    // running even after the dialog closes.
    progressStart(
      progressId,
      `Importing ${formatCount(ids.length, "folder")}`,
      ids.length,
    );
    try {
      await AnimeService.ImportMultipleFoldersAsAnime(ids);
      progressFinish(progressId);
      toast.success(
        "Import complete",
        `${formatCount(ids.length, "folder")} imported as anime`,
      );
      await queryClient.invalidateQueries({ queryKey: qk.anime.list() });
      onClose();
    } catch (err) {
      progressFinish(progressId);
      setError(extractErrorMessage(err));
      toast.error("Import failed", extractErrorMessage(err));
    }
  };

  return (
    <ImportFoldersDialog
      open={open}
      onClose={onClose}
      folders={folders}
      onImport={handleImport}
      loading={loading}
      error={error}
    />
  );
}

export default HomeImportDialog;
