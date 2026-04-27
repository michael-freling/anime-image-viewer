/**
 * Tests for `useImageImport`.
 *
 * Verifies the core upload-with-progress feature: starting an import, routing
 * Wails progress events to the Zustand store, finishing on success or error,
 * and invalidating the query cache when requested.
 */

const onMock = jest.fn();
const offMock = jest.fn();
jest.mock("@wailsio/runtime", () => ({
  Events: {
    On: (name: string, cb: (...args: unknown[]) => void) => onMock(name, cb),
    Off: (name: string) => offMock(name),
  },
}));

const importImagesMock = jest.fn();
jest.mock("../../src/lib/api", () => ({
  __esModule: true,
  BatchImportImageService: {
    ImportImages: (...args: unknown[]) => importImagesMock(...args),
  },
}));

import { act } from "react-dom/test-utils";
import { useImageImport } from "../../src/hooks/use-image-import";
import { useImportProgressStore } from "../../src/stores/import-progress-store";
import { renderHookWithClient, flushPromises } from "../test-utils";

describe("useImageImport", () => {
  beforeEach(() => {
    onMock.mockReset();
    offMock.mockReset();
    importImagesMock.mockReset();
    // Reset the Zustand store to a clean state before each test.
    useImportProgressStore.setState({ imports: new Map() });
    // Default: Events.On returns a cleanup function.
    onMock.mockReturnValue(jest.fn());
  });

  test("importImages calls start, then ImportImages, then finish in the progress store", async () => {
    importImagesMock.mockResolvedValue(undefined);

    const { result, unmount } = renderHookWithClient(() => useImageImport());
    try {
      await act(async () => {
        await result.current.importImages(42, "Naruto");
      });

      // The store should have exactly one entry that is marked done.
      const imports = useImportProgressStore.getState().imports;
      expect(imports.size).toBe(1);
      const entry = Array.from(imports.values())[0];
      expect(entry.label).toBe("Naruto");
      expect(entry.done).toBe(true);

      // ImportImages was called with the directory id.
      expect(importImagesMock).toHaveBeenCalledWith(42);
    } finally {
      unmount();
    }
  });

  test("Wails progress events update the store during import", async () => {
    // ImportImages returns a promise that we control.
    let resolveImport!: () => void;
    importImagesMock.mockReturnValue(
      new Promise<void>((r) => {
        resolveImport = r;
      }),
    );

    const { result, unmount } = renderHookWithClient(() => useImageImport());
    try {
      // Start the import but don't await it yet.
      let importPromise: Promise<void>;
      act(() => {
        importPromise = result.current.importImages(42, "Naruto");
      });
      await flushPromises();

      // The store should have a pending entry.
      let imports = useImportProgressStore.getState().imports;
      expect(imports.size).toBe(1);
      let entry = Array.from(imports.values())[0];
      expect(entry.done).toBe(false);

      // Capture the Wails event callback and fire a progress event.
      const wailsCallback = onMock.mock.calls[0][1] as (
        event: { name: string; data: { total: number; completed: number; failed: number } },
      ) => void;
      act(() => {
        wailsCallback({
          name: "ImportImages:progress",
          data: { total: 100, completed: 50, failed: 2 },
        });
      });

      // The store entry should be updated.
      imports = useImportProgressStore.getState().imports;
      entry = Array.from(imports.values())[0];
      expect(entry.total).toBe(100);
      expect(entry.completed).toBe(50);
      expect(entry.failed).toBe(2);

      // Resolve the import so cleanup runs.
      await act(async () => {
        resolveImport();
        await importPromise!;
      });
    } finally {
      unmount();
    }
  });

  test("importImages invalidates the query cache on success", async () => {
    importImagesMock.mockResolvedValue(undefined);

    const { result, client, unmount } = renderHookWithClient(() =>
      useImageImport(),
    );
    try {
      const spy = jest.spyOn(client, "invalidateQueries");

      await act(async () => {
        await result.current.importImages(42, "Naruto", ["anime", "detail", 42]);
      });

      expect(spy).toHaveBeenCalledWith({
        queryKey: ["anime", "detail", 42],
      });
      spy.mockRestore();
    } finally {
      unmount();
    }
  });

  test("importImages calls finish even when ImportImages throws", async () => {
    importImagesMock.mockRejectedValue(new Error("upload failed"));

    const { result, unmount } = renderHookWithClient(() => useImageImport());
    try {
      await act(async () => {
        await result.current.importImages(42, "Naruto");
      });

      // The store entry should still be marked done.
      const imports = useImportProgressStore.getState().imports;
      expect(imports.size).toBe(1);
      const entry = Array.from(imports.values())[0];
      expect(entry.done).toBe(true);
    } finally {
      unmount();
    }
  });

  test("progress events are ignored when no import is active", () => {
    const { unmount } = renderHookWithClient(() => useImageImport());
    try {
      // Fire a progress event before any import is started.
      const wailsCallback = onMock.mock.calls[0][1] as (
        event: { name: string; data: { total: number; completed: number; failed: number } },
      ) => void;
      act(() => {
        wailsCallback({
          name: "ImportImages:progress",
          data: { total: 100, completed: 50, failed: 0 },
        });
      });

      // The store should remain empty.
      const imports = useImportProgressStore.getState().imports;
      expect(imports.size).toBe(0);
    } finally {
      unmount();
    }
  });

  test("after import finishes, activeIdRef is cleared and events are ignored", async () => {
    importImagesMock.mockResolvedValue(undefined);

    const { result, unmount } = renderHookWithClient(() => useImageImport());
    try {
      await act(async () => {
        await result.current.importImages(42, "Naruto");
      });

      // Now fire a progress event after the import has finished.
      const wailsCallback = onMock.mock.calls[0][1] as (
        event: { name: string; data: { total: number; completed: number; failed: number } },
      ) => void;
      act(() => {
        wailsCallback({
          name: "ImportImages:progress",
          data: { total: 200, completed: 200, failed: 0 },
        });
      });

      // The store should still have just the one finished entry, unchanged.
      const imports = useImportProgressStore.getState().imports;
      expect(imports.size).toBe(1);
      const entry = Array.from(imports.values())[0];
      // The entry was finished by the first import with total=0, not updated to 200.
      expect(entry.done).toBe(true);
    } finally {
      unmount();
    }
  });
});
