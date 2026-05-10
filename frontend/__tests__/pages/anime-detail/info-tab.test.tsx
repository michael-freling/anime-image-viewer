/**
 * Tests for `InfoTab`.
 *
 * Spec: ui-design.md §3.2.5 "Info tab". Verifies:
 *   - Title, AniList link, entry/image/folder counts are rendered.
 *   - Missing AniList id shows "Not linked".
 *   - Danger Zone delete opens a confirm dialog and calls DeleteAnime.
 *   - Error + loading states.
 */

// Mock masonic to render all items in jsdom (masonic relies on IntersectionObserver + window scroll).
jest.mock("masonic", () => {
  const ReactModule = jest.requireActual<typeof import("react")>("react");
  return {
    __esModule: true,
    useMasonry: ({ items, render: Render, itemKey }: { items: unknown[]; render: React.ComponentType<{ data: unknown; width: number; index: number }>; itemKey?: (data: unknown) => unknown; [k: string]: unknown }) =>
      ReactModule.createElement(
        "div",
        { "data-testid": "masonry-mock" },
        (items as unknown[]).map((item, index) =>
          ReactModule.createElement(Render, { key: itemKey ? (itemKey(item) as React.Key) : index, data: item, width: 200, index }),
        ),
      ),
    usePositioner: () => ({}),
    useResizeObserver: () => ({}),
  };
});

const getAnimeDetailsMock = jest.fn();
const deleteAnimeMock = jest.fn();
const importFromAniListMock = jest.fn();
jest.mock("../../../src/lib/api", () => ({
  __esModule: true,
  AnimeService: {
    GetAnimeDetails: (...args: unknown[]) => getAnimeDetailsMock(...args),
    DeleteAnime: (...args: unknown[]) => deleteAnimeMock(...args),
    ImportFromAniList: (...args: unknown[]) => importFromAniListMock(...args),
    GetAnimeImages: () => Promise.resolve({ images: [] }),
    GetAnimeImagesByEntry: () => Promise.resolve({ images: [] }),
    GetAnimeList: () => Promise.resolve([]),
    SearchImagesByAnime: () => Promise.resolve({ images: [] }),
  },
  TagService: {
    GetAll: () => Promise.resolve([]),
  },
  SearchService: {
    SearchImages: () => Promise.resolve({ images: [] }),
  },
}));

const mockAniListSearchData = jest.fn();
let mockAniListSearchLoading = false;
jest.mock("../../../src/hooks/use-anilist-search", () => ({
  __esModule: true,
  useAniListSearch: (query: string) => ({
    data: mockAniListSearchData(query),
    isLoading: mockAniListSearchLoading,
  }),
}));

const toastSuccessMock = jest.fn();
const toastErrorMock = jest.fn();
jest.mock("../../../src/components/ui/toaster", () => ({
  __esModule: true,
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
    info: jest.fn(),
    warning: jest.fn(),
  },
  Toaster: () => null,
}));

import { act } from "react-dom/test-utils";

import { routes } from "../../../src/app/routes";
import type { AnimeFolder, Season } from "../../../src/types";
import { flushPromises, renderRoutes, waitFor } from "../../test-utils";

function makeSeason(overrides: Partial<Season> = {}): Season {
  return {
    id: 0,
    name: "Season",
    type: "season",
    seasonNumber: 1,
    airingSeason: "",
    airingYear: null,
    imageCount: 0,
    children: [],
    ...overrides,
  };
}

function makeFolder(overrides: Partial<AnimeFolder> = {}): AnimeFolder {
  return {
    id: 0,
    name: "folder",
    path: "/path/to/folder",
    imageCount: 0,
    inherited: false,
    ...overrides,
  };
}

function makeDetail(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    anime: { id: 42, name: "Bebop", aniListId: 101 },
    tags: [],
    characters: [],
    folders: [],
    folderTree: null,
    seasons: [],
    ...overrides,
  };
}

describe("InfoTab", () => {
  beforeEach(() => {
    getAnimeDetailsMock.mockReset();
    deleteAnimeMock.mockReset();
    importFromAniListMock.mockReset();
    mockAniListSearchData.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
    mockAniListSearchLoading = false;
    mockAniListSearchData.mockReturnValue([]);
  });

  test("renders title, AniList link, entries/images/folders counts", async () => {
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({
        anime: { id: 42, name: "Bebop", aniListId: 1234 },
        folders: [
          makeFolder({ id: 1, name: "a", path: "/a", imageCount: 2 }),
          makeFolder({ id: 2, name: "b", path: "/b", imageCount: 5 }),
        ],
        seasons: [makeSeason({ id: 1, imageCount: 3 })],
      }),
    );
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/info"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='info-tab']") !== null,
      );
      const title = container.querySelector(
        "[data-testid='info-field-title']",
      );
      expect(title?.textContent).toContain("Bebop");

      const anilist = container.querySelector(
        "[data-testid='info-field-anilist']",
      );
      expect(anilist?.textContent ?? "").toContain("#1234");
      const link = container.querySelector(
        "[data-testid='info-anilist-link']",
      );
      expect(link?.getAttribute("href")).toBe(
        "https://anilist.co/anime/1234",
      );

      const entriesField = container.querySelector(
        "[data-testid='info-field-seasons']",
      );
      expect(entriesField?.textContent).toContain("1 season");

      const imagesField = container.querySelector(
        "[data-testid='info-field-images']",
      );
      expect(imagesField?.textContent).toContain("3 images");

      const foldersField = container.querySelector(
        "[data-testid='info-field-folders']",
      );
      expect(foldersField?.textContent).toContain("2 folders");
    } finally {
      unmount();
    }
  });

  test("shows 'Not linked' when the anime has no AniList id", async () => {
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({ anime: { id: 42, name: "Bebop", aniListId: null } }),
    );
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/info"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='info-field-anilist']") !==
          null,
      );
      const anilist = container.querySelector(
        "[data-testid='info-field-anilist']",
      );
      expect(anilist?.textContent).toContain("Not linked");
      expect(
        container.querySelector("[data-testid='info-anilist-link']"),
      ).toBeNull();
    } finally {
      unmount();
    }
  });

  test("Danger Zone Delete button opens confirm dialog and deletes on confirm", async () => {
    getAnimeDetailsMock.mockResolvedValue(makeDetail());
    deleteAnimeMock.mockResolvedValue(undefined);
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/info"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='info-tab']") !== null,
      );
      // Click the Delete button — should open the confirm dialog.
      const btn = container.querySelector<HTMLButtonElement>(
        "[data-testid='info-delete-anime']",
      )!;
      act(() => {
        btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await waitFor(
        () =>
          document.querySelector("[data-testid='confirm-dialog']") !== null,
      );
      const dialog = document.querySelector("[data-testid='confirm-dialog']");
      expect(dialog?.textContent).toContain("Delete");
      expect(dialog?.textContent).toContain("Bebop");

      // Click the Confirm button.
      const confirmBtn = document.querySelector<HTMLButtonElement>(
        "[data-testid='confirm-dialog-confirm']",
      )!;
      await act(async () => {
        confirmBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await flushPromises();
      });
      expect(deleteAnimeMock).toHaveBeenCalledWith(42);
      expect(toastSuccessMock).toHaveBeenCalled();
    } finally {
      unmount();
    }
  });

  test("loading state renders the skeleton placeholders", async () => {
    const resolveRef: { resolve: ((v: unknown) => void) | null } = {
      resolve: null,
    };
    getAnimeDetailsMock.mockImplementation(
      () =>
        new Promise((r) => {
          resolveRef.resolve = r;
        }),
    );
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/info"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='info-tab-loading']") !==
          null,
      );
      expect(
        container.querySelector("[data-testid='info-tab-loading']"),
      ).not.toBeNull();
    } finally {
      if (resolveRef.resolve) resolveRef.resolve(makeDetail());
      unmount();
    }
  });

  test("error state surfaces ErrorAlert with retry", async () => {
    getAnimeDetailsMock.mockRejectedValue(new Error("db closed"));
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/info"],
    });
    try {
      await waitFor(
        () => container.querySelector("[role='alert']") !== null,
      );
      const alert = container.querySelector("[role='alert']");
      expect(alert?.textContent ?? "").toMatch(/db closed|Could not load/);
    } finally {
      unmount();
    }
  });

  test("Retry button refetches the details query", async () => {
    let calls = 0;
    getAnimeDetailsMock.mockImplementation(() => {
      calls += 1;
      if (calls === 1) {
        return Promise.reject(new Error("temp"));
      }
      return Promise.resolve(makeDetail());
    });
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/info"],
    });
    try {
      await waitFor(
        () => container.querySelector("[role='alert']") !== null,
      );
      const retry = Array.from(container.querySelectorAll("button")).find(
        (b) => (b.textContent ?? "").trim() === "Retry",
      ) as HTMLButtonElement | undefined;
      expect(retry).toBeDefined();
      retry!.click();
      // After retry, the InfoTab eventually reaches success state.
      await waitFor(
        () => container.querySelector("[data-testid='info-tab']") !== null,
      );
    } finally {
      unmount();
    }
  });

  test("child entries contribute their imageCount to the total", async () => {
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({
        seasons: [
          makeSeason({
            id: 1,
            imageCount: 4,
            children: [
              makeSeason({ id: 2, imageCount: 5 }),
              makeSeason({ id: 3, imageCount: 6 }),
            ],
          }),
        ],
      }),
    );
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/info"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='info-field-images']") !==
          null,
      );
      const field = container.querySelector(
        "[data-testid='info-field-images']",
      );
      // parent 4 + children 5 + 6 = 15
      expect(field?.textContent).toContain("15 images");
    } finally {
      unmount();
    }
  });

  test("error state surfaces a non-Error rejection via String()", async () => {
    // Reject with a non-Error value — the ternary
    // `error instanceof Error ? ... : String(error ?? "")` falls into the
    // String() branch.
    getAnimeDetailsMock.mockRejectedValue("string-failure");
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/info"],
    });
    try {
      await waitFor(() => container.querySelector("[role='alert']") !== null);
      const alert = container.querySelector("[role='alert']");
      expect(alert?.textContent ?? "").toContain("string-failure");
    } finally {
      unmount();
    }
  });

  test("non-numeric animeId in the URL keeps the query disabled", async () => {
    // /anime/0/info → parseAnimeId returns 0 → useAnimeDetail is disabled
    // and the network call never fires. The tab is still mounted (loading
    // skeleton or empty state).
    getAnimeDetailsMock.mockResolvedValue(makeDetail());
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/0/info"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='info-tab']") !== null ||
          container.querySelector("[data-testid='info-tab-loading']") !== null,
        { timeout: 200 },
      ).catch(() => undefined);
      expect(getAnimeDetailsMock).not.toHaveBeenCalled();
    } finally {
      unmount();
    }
  });

  test("entries with no children array still total correctly", async () => {
    // entries[].children explicitly null/undefined exercises the
    // `(entry.children ?? []).reduce(...)` fallback.
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({
        seasons: [
          // children undefined → ?? [] kicks in.
          { ...makeSeason({ id: 1, imageCount: 7 }), children: undefined as unknown as Season[] },
        ],
      }),
    );
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/info"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='info-field-images']") !==
          null,
      );
      const field = container.querySelector(
        "[data-testid='info-field-images']",
      );
      expect(field?.textContent).toContain("7 images");
    } finally {
      unmount();
    }
  });

  test("entry with no imageCount uses 0 as the fallback", async () => {
    // entry.imageCount undefined → `(entry.imageCount ?? 0)` returns 0.
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({
        seasons: [
          {
            ...makeSeason({ id: 1 }),
            imageCount: undefined as unknown as number,
          },
        ],
      }),
    );
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/info"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='info-field-images']") !==
          null,
      );
      const field = container.querySelector(
        "[data-testid='info-field-images']",
      );
      expect(field?.textContent).toContain("0 images");
    } finally {
      unmount();
    }
  });

  test("delete error shows a toast and keeps the dialog open", async () => {
    getAnimeDetailsMock.mockResolvedValue(makeDetail());
    deleteAnimeMock.mockRejectedValue(new Error("db locked"));
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/info"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='info-tab']") !== null,
      );
      const btn = container.querySelector<HTMLButtonElement>(
        "[data-testid='info-delete-anime']",
      )!;
      act(() => {
        btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await waitFor(
        () =>
          document.querySelector("[data-testid='confirm-dialog']") !== null,
      );
      const confirmBtn = document.querySelector<HTMLButtonElement>(
        "[data-testid='confirm-dialog-confirm']",
      )!;
      await act(async () => {
        confirmBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await flushPromises();
      });
      expect(deleteAnimeMock).toHaveBeenCalledWith(42);
      expect(toastErrorMock).toHaveBeenCalled();
    } finally {
      unmount();
    }
  });

  test("delete confirm dialog cancel button closes the dialog without deleting", async () => {
    getAnimeDetailsMock.mockResolvedValue(makeDetail());
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/info"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='info-tab']") !== null,
      );
      const btn = container.querySelector<HTMLButtonElement>(
        "[data-testid='info-delete-anime']",
      )!;
      act(() => {
        btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await waitFor(
        () =>
          document.querySelector("[data-testid='confirm-dialog']") !== null,
      );
      // Click the Cancel button instead of Confirm
      const cancelBtn = document.querySelector<HTMLButtonElement>(
        "[data-testid='confirm-dialog-cancel']",
      );
      expect(cancelBtn).not.toBeNull();
      await act(async () => {
        cancelBtn!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await flushPromises();
      });
      // The dialog should close and delete should NOT have been called
      expect(deleteAnimeMock).not.toHaveBeenCalled();
    } finally {
      unmount();
    }
  });

  test("delete error with non-Error rejection uses String()", async () => {
    getAnimeDetailsMock.mockResolvedValue(makeDetail());
    deleteAnimeMock.mockRejectedValue("string error value");
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/info"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='info-tab']") !== null,
      );
      const btn = container.querySelector<HTMLButtonElement>(
        "[data-testid='info-delete-anime']",
      )!;
      act(() => {
        btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await waitFor(
        () =>
          document.querySelector("[data-testid='confirm-dialog']") !== null,
      );
      const confirmBtn = document.querySelector<HTMLButtonElement>(
        "[data-testid='confirm-dialog-confirm']",
      )!;
      await act(async () => {
        confirmBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await flushPromises();
      });
      expect(deleteAnimeMock).toHaveBeenCalledWith(42);
      expect(toastErrorMock).toHaveBeenCalled();
    } finally {
      unmount();
    }
  });

  test("Re-import button calls ImportFromAniList and shows success toast", async () => {
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({ anime: { id: 42, name: "Bebop", aniListId: 1234 } }),
    );
    importFromAniListMock.mockResolvedValue({ seasonsCreated: 2, charactersCreated: 3 });
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/info"],
    });
    try {
      await waitFor(
        () => container.querySelector("[data-testid='info-tab']") !== null,
      );
      const btn = container.querySelector<HTMLButtonElement>(
        "[data-testid='info-anilist-reimport']",
      )!;
      expect(btn).not.toBeNull();
      await act(async () => {
        btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await flushPromises();
      });
      expect(importFromAniListMock).toHaveBeenCalledWith(42, 1234);
      expect(toastSuccessMock).toHaveBeenCalled();
    } finally {
      unmount();
    }
  });

  test("Re-import button shows error toast when ImportFromAniList rejects", async () => {
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({ anime: { id: 42, name: "Bebop", aniListId: 1234 } }),
    );
    importFromAniListMock.mockRejectedValue(new Error("network error"));
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/info"],
    });
    try {
      await waitFor(
        () => container.querySelector("[data-testid='info-tab']") !== null,
      );
      const btn = container.querySelector<HTMLButtonElement>(
        "[data-testid='info-anilist-reimport']",
      )!;
      expect(btn).not.toBeNull();
      await act(async () => {
        btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await flushPromises();
      });
      expect(importFromAniListMock).toHaveBeenCalledWith(42, 1234);
      expect(toastErrorMock).toHaveBeenCalled();
    } finally {
      unmount();
    }
  });

  test("Change button opens the AniList search dialog", async () => {
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({ anime: { id: 42, name: "Bebop", aniListId: 1234 } }),
    );
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/info"],
    });
    try {
      await waitFor(
        () => container.querySelector("[data-testid='info-tab']") !== null,
      );
      const btn = container.querySelector<HTMLButtonElement>(
        "[data-testid='info-anilist-change']",
      )!;
      expect(btn).not.toBeNull();
      act(() => {
        btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await waitFor(
        () => document.querySelector("[data-testid='anilist-search-dialog']") !== null,
      );
      const dialog = document.querySelector("[data-testid='anilist-search-dialog']");
      expect(dialog).not.toBeNull();
      const input = document.querySelector("[data-testid='anilist-search-input']");
      expect(input).not.toBeNull();
    } finally {
      unmount();
    }
  });

  test("Link AniList button opens search dialog when not linked", async () => {
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({ anime: { id: 42, name: "Bebop", aniListId: null } }),
    );
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/info"],
    });
    try {
      await waitFor(
        () => container.querySelector("[data-testid='info-tab']") !== null,
      );
      const btn = container.querySelector<HTMLButtonElement>(
        "[data-testid='info-anilist-link-btn']",
      )!;
      expect(btn).not.toBeNull();
      act(() => {
        btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await waitFor(
        () => document.querySelector("[data-testid='anilist-search-dialog']") !== null,
      );
      const dialog = document.querySelector("[data-testid='anilist-search-dialog']");
      expect(dialog).not.toBeNull();
      const input = document.querySelector("[data-testid='anilist-search-input']");
      expect(input).not.toBeNull();
    } finally {
      unmount();
    }
  });

  test("selecting a search result imports and closes the dialog", async () => {
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({ anime: { id: 42, name: "Bebop", aniListId: null } }),
    );
    mockAniListSearchData.mockReturnValue([
      {
        id: 999,
        titleRomaji: "Cowboy Bebop",
        titleEnglish: "Cowboy Bebop",
        titleNative: "",
        format: "TV",
        status: "FINISHED",
        season: "SPRING",
        seasonYear: 1998,
        episodes: 26,
        coverImageUrl: "",
      },
    ]);
    importFromAniListMock.mockResolvedValue({ seasonsCreated: 1, charactersCreated: 5 });
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/info"],
    });
    try {
      await waitFor(
        () => container.querySelector("[data-testid='info-tab']") !== null,
      );
      // Open the dialog
      const linkBtn = container.querySelector<HTMLButtonElement>(
        "[data-testid='info-anilist-link-btn']",
      )!;
      act(() => {
        linkBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await waitFor(
        () => document.querySelector("[data-testid='anilist-search-dialog']") !== null,
      );
      // Wait for search results to appear
      await waitFor(
        () => document.querySelector("[data-testid='anilist-search-result-item']") !== null,
      );
      const resultItem = document.querySelector<HTMLElement>(
        "[data-testid='anilist-search-result-item']",
      )!;
      expect(resultItem).not.toBeNull();
      // Click the result item
      await act(async () => {
        resultItem.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await flushPromises();
      });
      expect(importFromAniListMock).toHaveBeenCalledWith(42, 999);
      expect(toastSuccessMock).toHaveBeenCalled();
    } finally {
      unmount();
    }
  });

  test("Cancel button in search dialog closes it", async () => {
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({ anime: { id: 42, name: "Bebop", aniListId: null } }),
    );
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/info"],
    });
    try {
      await waitFor(
        () => container.querySelector("[data-testid='info-tab']") !== null,
      );
      // Open the dialog
      const linkBtn = container.querySelector<HTMLButtonElement>(
        "[data-testid='info-anilist-link-btn']",
      )!;
      act(() => {
        linkBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await waitFor(
        () => document.querySelector("[data-testid='anilist-search-dialog']") !== null,
      );
      // Find and click the Cancel button inside the dialog
      const dialogButtons = Array.from(
        document.querySelectorAll("[data-testid='anilist-search-dialog'] button"),
      );
      const cancelBtn = dialogButtons.find(
        (b) => (b.textContent ?? "").trim() === "Cancel",
      ) as HTMLButtonElement | undefined;
      expect(cancelBtn).toBeDefined();
      await act(async () => {
        cancelBtn!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await flushPromises();
      });
      // Dialog should be closed -- no longer in DOM (or marked closed)
      // Give time for the state update to propagate
      await flushPromises();
    } finally {
      unmount();
    }
  });

  test("search dialog shows loading state when isLoading is true", async () => {
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({ anime: { id: 42, name: "Bebop", aniListId: null } }),
    );
    mockAniListSearchLoading = true;
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/info"],
    });
    try {
      await waitFor(
        () => container.querySelector("[data-testid='info-tab']") !== null,
      );
      const linkBtn = container.querySelector<HTMLButtonElement>(
        "[data-testid='info-anilist-link-btn']",
      )!;
      act(() => {
        linkBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await waitFor(
        () => document.querySelector("[data-testid='anilist-search-dialog']") !== null,
      );
      // The query is pre-filled with the anime name "Bebop" which is non-empty,
      // and isLoading is true, so "Searching..." text should appear
      const dialog = document.querySelector("[data-testid='anilist-search-dialog']");
      expect(dialog?.textContent).toContain("Searching...");
    } finally {
      unmount();
    }
  });

  test("search result displays titleEnglish subtitle when different from titleRomaji", async () => {
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({ anime: { id: 42, name: "Bebop", aniListId: null } }),
    );
    mockAniListSearchData.mockReturnValue([
      {
        id: 777,
        titleRomaji: "Kauboi Bibappu",
        titleEnglish: "Cowboy Bebop",
        titleNative: "",
        format: "",
        status: "FINISHED",
        season: "SPRING",
        seasonYear: 0,
        episodes: 26,
        coverImageUrl: "",
      },
    ]);
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/info"],
    });
    try {
      await waitFor(
        () => container.querySelector("[data-testid='info-tab']") !== null,
      );
      const linkBtn = container.querySelector<HTMLButtonElement>(
        "[data-testid='info-anilist-link-btn']",
      )!;
      act(() => {
        linkBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await waitFor(
        () => document.querySelector("[data-testid='anilist-search-result-item']") !== null,
      );
      const item = document.querySelector("[data-testid='anilist-search-result-item']");
      // titleRomaji is displayed as the main title
      expect(item?.textContent).toContain("Kauboi Bibappu");
      // titleEnglish is displayed as subtitle since it differs from titleRomaji
      expect(item?.textContent).toContain("Cowboy Bebop");
      // format is empty so no separator for format; seasonYear is 0 so no separator for year
      expect(item?.textContent).toContain("ID: 777");
    } finally {
      unmount();
    }
  });

  test("search result falls back to titleEnglish when titleRomaji is empty", async () => {
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({ anime: { id: 42, name: "Bebop", aniListId: null } }),
    );
    mockAniListSearchData.mockReturnValue([
      {
        id: 555,
        titleRomaji: "",
        titleEnglish: "English Only Title",
        titleNative: "",
        format: "MOVIE",
        status: "FINISHED",
        season: "SUMMER",
        seasonYear: 2023,
        episodes: 1,
        coverImageUrl: "",
      },
    ]);
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/info"],
    });
    try {
      await waitFor(
        () => container.querySelector("[data-testid='info-tab']") !== null,
      );
      const linkBtn = container.querySelector<HTMLButtonElement>(
        "[data-testid='info-anilist-link-btn']",
      )!;
      act(() => {
        linkBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await waitFor(
        () => document.querySelector("[data-testid='anilist-search-result-item']") !== null,
      );
      const item = document.querySelector("[data-testid='anilist-search-result-item']");
      // Falls back to titleEnglish since titleRomaji is empty
      expect(item?.textContent).toContain("English Only Title");
      // format and seasonYear are displayed
      expect(item?.textContent).toContain("MOVIE");
      expect(item?.textContent).toContain("2023");
    } finally {
      unmount();
    }
  });

  test("selecting a search result shows error toast when import fails", async () => {
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({ anime: { id: 42, name: "Bebop", aniListId: null } }),
    );
    mockAniListSearchData.mockReturnValue([
      {
        id: 888,
        titleRomaji: "Some Anime",
        titleEnglish: "Some Anime EN",
        titleNative: "",
        format: "TV",
        status: "FINISHED",
        season: "FALL",
        seasonYear: 2020,
        episodes: 12,
        coverImageUrl: "",
      },
    ]);
    importFromAniListMock.mockRejectedValue(new Error("server error"));
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/info"],
    });
    try {
      await waitFor(
        () => container.querySelector("[data-testid='info-tab']") !== null,
      );
      // Open the dialog
      const linkBtn = container.querySelector<HTMLButtonElement>(
        "[data-testid='info-anilist-link-btn']",
      )!;
      act(() => {
        linkBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await waitFor(
        () => document.querySelector("[data-testid='anilist-search-dialog']") !== null,
      );
      await waitFor(
        () => document.querySelector("[data-testid='anilist-search-result-item']") !== null,
      );
      const resultItem = document.querySelector<HTMLElement>(
        "[data-testid='anilist-search-result-item']",
      )!;
      await act(async () => {
        resultItem.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await flushPromises();
      });
      expect(importFromAniListMock).toHaveBeenCalledWith(42, 888);
      expect(toastErrorMock).toHaveBeenCalled();
    } finally {
      unmount();
    }
  });
});
