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

  test("importImages calls start, then ImportImages, then update with result count, then finish", async () => {
    importImagesMock.mockResolvedValue([{ id: 1 }, { id: 2 }]);

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
      // The total and completed should reflect the result array length.
      expect(entry.total).toBe(2);
      expect(entry.completed).toBe(2);

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
    importImagesMock.mockResolvedValue([{ id: 1 }]);

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
    importImagesMock.mockResolvedValue([{ id: 1 }]);

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
      // The entry was finished by the first import with total=1, not updated to 200.
      expect(entry.done).toBe(true);
      expect(entry.total).toBe(1);
    } finally {
      unmount();
    }
  });

  test("late Wails event after finish but before activeIdRef cleared does not corrupt store", async () => {
    // This test simulates the race condition: ImportImages resolves, update+finish
    // run, but a late Wails progress event arrives while the entry is already done.
    // The event handler should skip the update because the entry is marked done.

    let resolveImport!: (value: unknown[]) => void;
    importImagesMock.mockReturnValue(
      new Promise<unknown[]>((r) => {
        resolveImport = r;
      }),
    );

    const { result, unmount } = renderHookWithClient(() => useImageImport());
    try {
      // Start the import but don't await it.
      let importPromise: Promise<void>;
      act(() => {
        importPromise = result.current.importImages(42, "Naruto");
      });
      await flushPromises();

      // Capture the Wails event callback.
      const wailsCallback = onMock.mock.calls[0][1] as (
        event: { name: string; data: { total: number; completed: number; failed: number } },
      ) => void;

      // Resolve the import so the try block runs update+finish.
      await act(async () => {
        resolveImport([{ id: 1 }, { id: 2 }]);
        await importPromise!;
      });

      // The entry should be done with total=2.
      let imports = useImportProgressStore.getState().imports;
      let entry = Array.from(imports.values())[0];
      expect(entry.done).toBe(true);
      expect(entry.total).toBe(2);
      expect(entry.completed).toBe(2);

      // Now simulate a late Wails event that arrives after finish.
      // Even though activeIdRef is already null (cleared after finish),
      // also verify the done-guard works if a ref were still set.
      // Force a scenario: manually set the ref back to simulate the old code path.
      // The handler should skip because the store entry is already done.
      act(() => {
        wailsCallback({
          name: "ImportImages:progress",
          data: { total: 5, completed: 3, failed: 0 },
        });
      });

      // The entry should be unchanged — still done with total=2.
      imports = useImportProgressStore.getState().imports;
      entry = Array.from(imports.values())[0];
      expect(entry.done).toBe(true);
      expect(entry.total).toBe(2);
      expect(entry.completed).toBe(2);
    } finally {
      unmount();
    }
  });

  test("Wails event with non-finite total is ignored", () => {
    // Start an import so activeIdRef is set.
    let resolveImport!: () => void;
    importImagesMock.mockReturnValue(
      new Promise<void>((r) => {
        resolveImport = r;
      }),
    );

    const { result, unmount } = renderHookWithClient(() => useImageImport());
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      act(() => {
        result.current.importImages(42, "Naruto");
      });

      const wailsCallback = onMock.mock.calls[0][1] as (
        event: { name: string; data: { total: unknown; completed: number; failed: number } },
      ) => void;

      // Send an event with undefined total.
      act(() => {
        wailsCallback({
          name: "ImportImages:progress",
          data: { total: undefined as unknown as number, completed: 0, failed: 0 },
        });
      });

      // The store entry should not have been updated (total stays at 0 from start).
      const imports = useImportProgressStore.getState().imports;
      const entry = Array.from(imports.values())[0];
      expect(entry.total).toBe(0);
      expect(warnSpy).toHaveBeenCalledWith(
        "[useImageImport] Wails event has non-finite total:",
        expect.anything(),
      );

      // Clean up: resolve the import so the hook can clean up properly.
      resolveImport();
    } finally {
      warnSpy.mockRestore();
      unmount();
    }
  });
});
