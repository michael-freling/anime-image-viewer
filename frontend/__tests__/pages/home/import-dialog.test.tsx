/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * Tests for `HomeImportDialog`.
 *
 * The dialog wraps the shared `ImportFoldersDialog` with:
 *   1. An effect that fetches `AnimeService.ListUnassignedTopFolders()`
 *      on the closed→open edge.
 *   2. An `onImport` callback that drives `AnimeService.ImportMultipleFoldersAsAnime`
 *      and pushes progress into `useImportProgressStore`.
 *   3. Toast + cache invalidation on success.
 *
 * We stub `@chakra-ui/react` + `lucide-react` via the shared chakra-stub
 * factory so the Dialog primitive renders its children inline (see
 * `__tests__/components/shared/import-folders-dialog.test.tsx` for the same
 * pattern). `useImportProgressStore` is the real Zustand store — reset
 * between tests. `AnimeService` is mocked at the api re-export layer so both
 * the dialog's effect and its submit path hit the same jest mock.
 */

jest.mock("@chakra-ui/react", () =>
  require("../../components/chakra-stub").chakraStubFactory(),
);
jest.mock("lucide-react", () =>
  require("../../components/chakra-stub").lucideStubFactory(),
);

const listUnassignedMock = jest.fn();
const importFoldersMock = jest.fn();
jest.mock("../../../src/lib/api", () => ({
  __esModule: true,
  AnimeService: {
    ListUnassignedTopFolders: (...args: unknown[]) =>
      listUnassignedMock(...args),
    ImportMultipleFoldersAsAnime: (...args: unknown[]) =>
      importFoldersMock(...args),
  },
}));

const toastSuccess = jest.fn();
const toastError = jest.fn();
jest.mock("../../../src/components/ui/toaster", () => ({
  __esModule: true,
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";

import { HomeImportDialog } from "../../../src/pages/home/import-dialog";
import { useImportProgressStore } from "../../../src/stores/import-progress-store";
import { qk } from "../../../src/lib/query-keys";

interface Rendered {
  container: HTMLDivElement;
  root: Root;
  client: QueryClient;
  unmount: () => void;
  rerender: (el: React.ReactElement) => void;
}

function render(
  el: React.ReactElement,
  client?: QueryClient,
): Rendered {
  const queryClient =
    client ??
    new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Infinity, gcTime: Infinity },
        mutations: { retry: false },
      },
    });
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root!: Root;
  act(() => {
    root = createRoot(container);
    root.render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(MemoryRouter, null, el),
      ),
    );
  });
  return {
    container,
    root,
    client: queryClient,
    rerender(next) {
      act(() => {
        root.render(
          createElement(
            QueryClientProvider,
            { client: queryClient },
            createElement(MemoryRouter, null, next),
          ),
        );
      });
    },
    unmount() {
      act(() => {
        root.unmount();
      });
      container.parentNode?.removeChild(container);
    },
  };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

function resetImportProgress() {
  act(() => {
    useImportProgressStore.setState({ imports: new Map() });
  });
}

const FOLDERS = [
  { id: 1, name: "Folder One" },
  { id: 2, name: "Folder Two" },
];

describe("HomeImportDialog", () => {
  beforeEach(() => {
    listUnassignedMock.mockReset();
    importFoldersMock.mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();
    resetImportProgress();
  });

  test("does not fetch folders when open=false", () => {
    listUnassignedMock.mockResolvedValue(FOLDERS);
    const r = render(
      createElement(HomeImportDialog, { open: false, onClose: jest.fn() }),
    );
    expect(listUnassignedMock).not.toHaveBeenCalled();
    r.unmount();
  });

  test("fetches folders on the closed→open transition and lists them", async () => {
    listUnassignedMock.mockResolvedValue(FOLDERS);
    const r = render(
      createElement(HomeImportDialog, { open: true, onClose: jest.fn() }),
    );
    // First render schedules the fetch; drain the microtask queue.
    await flush();
    expect(listUnassignedMock).toHaveBeenCalledTimes(1);
    const rows = r.container.querySelectorAll(
      "[data-testid='import-folder-row']",
    );
    expect(rows.length).toBe(FOLDERS.length);
    r.unmount();
  });

  test("coerces a null response into an empty list", async () => {
    listUnassignedMock.mockResolvedValue(null);
    const r = render(
      createElement(HomeImportDialog, { open: true, onClose: jest.fn() }),
    );
    await flush();
    // No rows rendered; the dialog still shows its title.
    expect(
      r.container.querySelectorAll("[data-testid='import-folder-row']").length,
    ).toBe(0);
    expect(r.container.textContent).toContain(
      "No unassigned top-level folders available.",
    );
    r.unmount();
  });

  test("surfaces a fetch error inside the dialog", async () => {
    listUnassignedMock.mockRejectedValue(new Error("fetch boom"));
    const r = render(
      createElement(HomeImportDialog, { open: true, onClose: jest.fn() }),
    );
    await flush();
    expect(r.container.textContent).toContain("fetch boom");
    r.unmount();
  });

  test("submitting runs ImportMultipleFoldersAsAnime, fires toast, invalidates cache, and closes", async () => {
    listUnassignedMock.mockResolvedValue(FOLDERS);
    importFoldersMock.mockResolvedValue(undefined);
    const onClose = jest.fn();
    const r = render(
      createElement(HomeImportDialog, { open: true, onClose }),
    );
    // Prime the cache for qk.anime.list() so we can observe invalidation.
    r.client.setQueryData(qk.anime.list(), [
      { id: 5, name: "Existing", imageCount: 0 },
    ]);
    await flush();
    // Select-all toggles the submit on.
    const selectAll = r.container.querySelector(
      "[data-testid='import-folders-select-all']",
    ) as HTMLElement | null;
    expect(selectAll).not.toBeNull();
    act(() => {
      selectAll!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const submit = r.container.querySelector(
      "[data-testid='import-folders-submit']",
    ) as HTMLButtonElement | null;
    expect(submit).not.toBeNull();
    expect(submit!.disabled).toBe(false);
    await act(async () => {
      submit!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(importFoldersMock).toHaveBeenCalledWith([1, 2]);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(toastSuccess).toHaveBeenCalled();
    // qk.anime.list entry was marked stale after the import completed.
    const state = r.client.getQueryState(qk.anime.list());
    expect(state?.isInvalidated).toBe(true);
    r.unmount();
  });

  test("import failure keeps dialog open, surfaces toast, and leaves progress bar cleared", async () => {
    listUnassignedMock.mockResolvedValue(FOLDERS);
    importFoldersMock.mockRejectedValue(new Error("import boom"));
    const onClose = jest.fn();
    const r = render(
      createElement(HomeImportDialog, { open: true, onClose }),
    );
    await flush();
    const selectAll = r.container.querySelector(
      "[data-testid='import-folders-select-all']",
    ) as HTMLElement;
    act(() => {
      selectAll.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const submit = r.container.querySelector(
      "[data-testid='import-folders-submit']",
    ) as HTMLButtonElement;
    await act(async () => {
      submit.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(importFoldersMock).toHaveBeenCalled();
    // Dialog stays open and the error message is rendered.
    expect(onClose).not.toHaveBeenCalled();
    expect(r.container.textContent).toContain("import boom");
    expect(toastError).toHaveBeenCalled();
    // The in-progress entry was finished (done=true) — the store does not
    // auto-remove on failure but ImportProgressBar shows dismiss buttons.
    const entries = Array.from(
      useImportProgressStore.getState().imports.values(),
    );
    expect(entries.length).toBe(1);
    expect(entries[0].done).toBe(true);
    r.unmount();
  });

  test("does not refetch when `open` stays true across rerenders", async () => {
    listUnassignedMock.mockResolvedValue(FOLDERS);
    const onClose = jest.fn();
    const r = render(
      createElement(HomeImportDialog, { open: true, onClose }),
    );
    await flush();
    expect(listUnassignedMock).toHaveBeenCalledTimes(1);
    r.rerender(
      createElement(HomeImportDialog, { open: true, onClose }),
    );
    await flush();
    expect(listUnassignedMock).toHaveBeenCalledTimes(1);
    r.unmount();
  });

  test("under StrictMode the open->open guard prevents a duplicate fetch", async () => {
    // React.StrictMode mounts effects twice in development. The dialog's
    // `lastOpenRef` guard exists specifically so the second mount short-
    // circuits the fetch. Verify by wrapping the dialog in <StrictMode>.
    const { StrictMode } = jest.requireActual<typeof import("react")>("react");
    listUnassignedMock.mockResolvedValue(FOLDERS);
    const onClose = jest.fn();
    const r = render(
      createElement(
        StrictMode,
        null,
        createElement(HomeImportDialog, { open: true, onClose }),
      ),
    );
    await flush();
    // Only ONE fetch despite the double-mount.
    expect(listUnassignedMock).toHaveBeenCalledTimes(1);
    r.unmount();
  });

  test("rejects with a string error and the dialog renders that string verbatim", async () => {
    // The extractErrorMessage helper has three branches: Error instance,
    // bare string, and the catch-all "Unexpected error". Throwing a bare
    // string from the listing mock proves the second branch works.
    listUnassignedMock.mockRejectedValue("plain-string-error");
    const r = render(
      createElement(HomeImportDialog, { open: true, onClose: jest.fn() }),
    );
    await flush();
    expect(r.container.textContent).toContain("plain-string-error");
    r.unmount();
  });

  test("rejects with a plain object — error message falls back to 'Unexpected error'", async () => {
    listUnassignedMock.mockRejectedValue({ unhelpful: true });
    const r = render(
      createElement(HomeImportDialog, { open: true, onClose: jest.fn() }),
    );
    await flush();
    expect(r.container.textContent).toContain("Unexpected error");
    r.unmount();
  });
});
