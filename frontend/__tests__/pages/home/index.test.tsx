/**
 * Tests for the Home page (Phase D1, ui-design §3.1).
 *
 * The page composes:
 *   - PageHeader (title "AnimeVault", subtitle with counts, + New anime action)
 *   - SearchBar (client-side substring filter over the anime list)
 *   - AnimeGrid (skeletons / cards / empty-state / error-state)
 *   - ImportProgressBar + HomeImportDialog, both gated on `?create=1`
 *
 * We stub `@/lib/api`, `@/components/ui/toaster`, and `react-router`'s
 * `useNavigate` so we can assert on navigation intent without mounting the
 * full route tree. React Query + React Router contexts come from
 * `renderWithClient` (real Chakra, real router, real store).
 */

const listAnimeMock = jest.fn();
const listUnassignedMock = jest.fn();
const importFoldersMock = jest.fn();

jest.mock("../../../src/lib/api", () => ({
  __esModule: true,
  AnimeService: {
    ListAnime: (...args: unknown[]) => listAnimeMock(...args),
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

// Intercept react-router's `useNavigate` so navigation to `/anime/:id` is
// observable as a plain jest mock call. We preserve the rest of react-router
// (useSearchParams, MemoryRouter, Outlet, …) via `jest.requireActual`.
const navigateMock = jest.fn();
jest.mock("react-router", () => {
  const actual = jest.requireActual<typeof import("react-router")>(
    "react-router",
  );
  return {
    __esModule: true,
    ...actual,
    useNavigate: () => navigateMock,
  };
});

import { act } from "react-dom/test-utils";

import { HomePage } from "../../../src/pages/home";
import { useImportProgressStore } from "../../../src/stores/import-progress-store";
import { renderWithClient, waitFor } from "../../test-utils";

// Helper: drive a controlled input via the prototype setter so React's
// change tracker fires synthetic onChange.
function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function resetStores() {
  act(() => {
    useImportProgressStore.setState({ imports: new Map() });
  });
}

const ANIME = [
  { id: 1, name: "Cowboy Bebop", imageCount: 30 },
  { id: 2, name: "Attack on Titan", imageCount: 42 },
  { id: 3, name: "One Piece", imageCount: 100 },
];

describe("HomePage", () => {
  beforeEach(() => {
    listAnimeMock.mockReset();
    listUnassignedMock.mockReset();
    importFoldersMock.mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();
    navigateMock.mockReset();
    resetStores();
  });

  test("renders the page header with the AnimeVault title", async () => {
    listAnimeMock.mockResolvedValue(ANIME);
    const r = renderWithClient(<HomePage />);
    try {
      await waitFor(() =>
        (r.container.textContent ?? "").includes("AnimeVault"),
      );
      const h1 = r.container.querySelector("h1");
      expect(h1?.textContent).toBe("AnimeVault");
    } finally {
      r.unmount();
    }
  });

  test("shows skeleton tiles while the anime list is loading", async () => {
    // Promise never resolves -> loading state persists.
    listAnimeMock.mockReturnValue(new Promise(() => undefined));
    const r = renderWithClient(<HomePage />);
    try {
      await waitFor(
        () =>
          r.container.querySelectorAll(
            "[data-testid='anime-card-skeleton']",
          ).length > 0,
      );
      const skeletons = r.container.querySelectorAll(
        "[data-testid='anime-card-skeleton']",
      );
      expect(skeletons.length).toBeGreaterThanOrEqual(10);
      // No real cards yet.
      expect(
        r.container.querySelectorAll("[data-testid='anime-card']").length,
      ).toBe(0);
    } finally {
      r.unmount();
    }
  });

  test("renders one card per anime + a New anime trailing tile on success", async () => {
    listAnimeMock.mockResolvedValue(ANIME);
    const r = renderWithClient(<HomePage />);
    try {
      await waitFor(
        () =>
          r.container.querySelectorAll("[data-testid='anime-card']").length ===
          ANIME.length,
      );
      expect(
        r.container.querySelectorAll("[data-testid='anime-card']").length,
      ).toBe(ANIME.length);
      expect(
        r.container.querySelector("[data-testid='new-anime-card']"),
      ).not.toBeNull();
      const text = r.container.textContent ?? "";
      expect(text).toContain("Cowboy Bebop");
      expect(text).toContain("Attack on Titan");
      expect(text).toContain("One Piece");
      // Subtitle counts anime + images (3 anime · 172 images).
      expect(text).toContain("3 anime");
      expect(text).toContain("172 images");
    } finally {
      r.unmount();
    }
  });

  test("renders the empty state + import CTA when there are no anime", async () => {
    listAnimeMock.mockResolvedValue([]);
    const r = renderWithClient(<HomePage />);
    try {
      await waitFor(() =>
        (r.container.textContent ?? "").includes("No anime yet"),
      );
      expect(r.container.textContent).toContain("No anime yet");
      expect(
        r.container.querySelector("[data-testid='empty-state-import']"),
      ).not.toBeNull();
      // No card grid in empty state.
      expect(
        r.container.querySelectorAll("[data-testid='anime-card']").length,
      ).toBe(0);
    } finally {
      r.unmount();
    }
  });

  test("renders the error alert with a Retry button when the query fails", async () => {
    listAnimeMock.mockRejectedValue(new Error("boom from server"));
    const r = renderWithClient(<HomePage />);
    try {
      await waitFor(
        () => (r.container.textContent ?? "").includes("boom from server"),
      );
      // Role=alert marks the error container; retry button fires a refetch.
      const alert = r.container.querySelector("[role='alert']");
      expect(alert).not.toBeNull();
      expect(alert!.textContent).toContain("Couldn't load anime");
      expect(alert!.textContent).toContain("boom from server");
      // Cards and skeletons are absent in the error state.
      expect(
        r.container.querySelectorAll("[data-testid='anime-card']").length,
      ).toBe(0);
    } finally {
      r.unmount();
    }
  });

  test("typing in the search bar filters the rendered cards (case-insensitive)", async () => {
    listAnimeMock.mockResolvedValue(ANIME);
    const r = renderWithClient(<HomePage />);
    try {
      await waitFor(
        () =>
          r.container.querySelectorAll("[data-testid='anime-card']").length ===
          ANIME.length,
      );
      const input = r.container.querySelector<HTMLInputElement>(
        "input[role='searchbox']",
      );
      expect(input).not.toBeNull();
      setInputValue(input!, "attack");
      // After filter, only "Attack on Titan" remains.
      const cards = r.container.querySelectorAll("[data-testid='anime-card']");
      expect(cards.length).toBe(1);
      expect(cards[0].getAttribute("data-anime-id")).toBe("2");
      expect(cards[0].textContent).toContain("Attack on Titan");
    } finally {
      r.unmount();
    }
  });

  test("empty search match shows the 'No matches' state", async () => {
    listAnimeMock.mockResolvedValue(ANIME);
    const r = renderWithClient(<HomePage />);
    try {
      await waitFor(
        () =>
          r.container.querySelectorAll("[data-testid='anime-card']").length ===
          ANIME.length,
      );
      const input = r.container.querySelector<HTMLInputElement>(
        "input[role='searchbox']",
      );
      setInputValue(input!, "nonexistent anime");
      await waitFor(
        () => (r.container.textContent ?? "").includes("No matches"),
      );
      expect(
        r.container.querySelectorAll("[data-testid='anime-card']").length,
      ).toBe(0);
      expect(r.container.textContent).toContain("No matches");
    } finally {
      r.unmount();
    }
  });

  test("clicking an AnimeCard navigates to /anime/:id", async () => {
    listAnimeMock.mockResolvedValue(ANIME);
    const r = renderWithClient(<HomePage />);
    try {
      await waitFor(
        () =>
          r.container.querySelectorAll("[data-testid='anime-card']").length ===
          ANIME.length,
      );
      const cards = r.container.querySelectorAll<HTMLElement>(
        "[data-testid='anime-card']",
      );
      // Click the third card (id=3).
      act(() => {
        cards[2].click();
      });
      expect(navigateMock).toHaveBeenCalledWith("/anime/3");
    } finally {
      r.unmount();
    }
  });

  test("clicking the trailing +New anime tile opens the import dialog via ?create=1", async () => {
    listAnimeMock.mockResolvedValue(ANIME);
    listUnassignedMock.mockResolvedValue([{ id: 9, name: "staged-folder" }]);
    const r = renderWithClient(<HomePage />);
    try {
      await waitFor(
        () =>
          r.container.querySelector("[data-testid='new-anime-card']") !==
          null,
      );
      const trailing = r.container.querySelector<HTMLElement>(
        "[data-testid='new-anime-card']",
      );
      expect(trailing).not.toBeNull();
      act(() => {
        trailing!.click();
      });
      // The dialog mounts after the query-param toggles to `?create=1`.
      await waitFor(
        () =>
          document.body.querySelector(
            "[data-testid='import-folders-dialog']",
          ) !== null,
      );
      // And the dialog fetched the unassigned folders.
      expect(listUnassignedMock).toHaveBeenCalled();
    } finally {
      r.unmount();
    }
  });

  test("empty-state CTA also opens the import dialog", async () => {
    listAnimeMock.mockResolvedValue([]);
    listUnassignedMock.mockResolvedValue([{ id: 9, name: "staged-folder" }]);
    const r = renderWithClient(<HomePage />);
    try {
      await waitFor(() =>
        (r.container.textContent ?? "").includes("No anime yet"),
      );
      const cta = r.container.querySelector<HTMLElement>(
        "[data-testid='empty-state-import']",
      );
      expect(cta).not.toBeNull();
      act(() => {
        cta!.click();
      });
      await waitFor(
        () =>
          document.body.querySelector(
            "[data-testid='import-folders-dialog']",
          ) !== null,
      );
      expect(listUnassignedMock).toHaveBeenCalled();
    } finally {
      r.unmount();
    }
  });

  test("starting on /?create=1 opens the dialog immediately", async () => {
    listAnimeMock.mockResolvedValue(ANIME);
    listUnassignedMock.mockResolvedValue([]);
    const r = renderWithClient(<HomePage />, {
      routerInitialEntries: ["/?create=1"],
    });
    try {
      // Dialog mounts without a click because the query param is already set.
      await waitFor(
        () =>
          document.body.querySelector(
            "[data-testid='import-folders-dialog']",
          ) !== null,
      );
    } finally {
      r.unmount();
    }
  });

  test("header New anime button opens the import dialog", async () => {
    listAnimeMock.mockResolvedValue(ANIME);
    listUnassignedMock.mockResolvedValue([]);
    const r = renderWithClient(<HomePage />);
    try {
      await waitFor(
        () =>
          r.container.querySelectorAll("[data-testid='anime-card']").length ===
          ANIME.length,
      );
      const headerBtn = r.container.querySelector<HTMLElement>(
        "[data-testid='home-new-anime']",
      );
      expect(headerBtn).not.toBeNull();
      act(() => {
        headerBtn!.click();
      });
      await waitFor(
        () =>
          document.body.querySelector(
            "[data-testid='import-folders-dialog']",
          ) !== null,
      );
    } finally {
      r.unmount();
    }
  });

  test("closing the import dialog strips ?create=1 from the URL", async () => {
    listAnimeMock.mockResolvedValue(ANIME);
    listUnassignedMock.mockResolvedValue([]);
    const r = renderWithClient(<HomePage />, {
      routerInitialEntries: ["/?create=1"],
    });
    try {
      // Dialog mounts from the query param.
      await waitFor(
        () =>
          document.body.querySelector(
            "[data-testid='import-folders-dialog']",
          ) !== null,
      );
      // Close button lives inside the dialog; both the Cancel button and
      // the overlay's close wire up to `onClose`. The dialog exposes a
      // cancel button we can click to drive the `closeImportDialog` branch.
      const cancelBtn = document.body.querySelector<HTMLElement>(
        "[data-testid='import-folders-cancel']",
      );
      expect(cancelBtn).not.toBeNull();
      act(() => {
        cancelBtn!.click();
      });
      await waitFor(
        () =>
          document.body.querySelector(
            "[data-testid='import-folders-dialog']",
          ) === null,
      );
    } finally {
      r.unmount();
    }
  });

  test("Retry button on the ErrorAlert refetches the anime list", async () => {
    let calls = 0;
    listAnimeMock.mockImplementation(() => {
      calls += 1;
      if (calls === 1) {
        return Promise.reject(new Error("network off"));
      }
      return Promise.resolve(ANIME);
    });
    const r = renderWithClient(<HomePage />);
    try {
      await waitFor(
        () => (r.container.textContent ?? "").includes("network off"),
      );
      const retry = Array.from(
        r.container.querySelectorAll("button"),
      ).find((b) => (b.textContent ?? "").trim() === "Retry") as
        | HTMLButtonElement
        | undefined;
      expect(retry).toBeDefined();
      act(() => {
        retry!.click();
      });
      await waitFor(
        () =>
          r.container.querySelectorAll("[data-testid='anime-card']").length ===
          ANIME.length,
      );
      expect(
        r.container.querySelectorAll("[data-testid='anime-card']").length,
      ).toBe(ANIME.length);
    } finally {
      r.unmount();
    }
  });
});
