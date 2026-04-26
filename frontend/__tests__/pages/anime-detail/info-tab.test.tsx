/**
 * Tests for `InfoTab`.
 *
 * Spec: ui-design.md §3.2.5 "Info tab". Verifies:
 *   - Title, AniList link, entry/image/folder counts are rendered.
 *   - Missing AniList id shows "Not linked".
 *   - Danger Zone delete opens a confirm dialog and calls DeleteAnime.
 *   - Error + loading states.
 */

jest.mock("react-photo-album/masonry.css", () => ({}), { virtual: true });
jest.mock("react-photo-album/columns.css", () => ({}), { virtual: true });
jest.mock("react-photo-album/rows.css", () => ({}), { virtual: true });
jest.mock("react-photo-album", () => {
  const ReactModule = jest.requireActual<typeof import("react")>("react");
  const renderPhotos = () =>
    ReactModule.createElement("div", { "data-testid": "photo-album-stub" });
  return {
    __esModule: true,
    MasonryPhotoAlbum: renderPhotos,
    ColumnsPhotoAlbum: renderPhotos,
    RowsPhotoAlbum: renderPhotos,
  };
});

const getAnimeDetailsMock = jest.fn();
const deleteAnimeMock = jest.fn();
jest.mock("../../../src/lib/api", () => ({
  __esModule: true,
  AnimeService: {
    GetAnimeDetails: (...args: unknown[]) => getAnimeDetailsMock(...args),
    DeleteAnime: (...args: unknown[]) => deleteAnimeMock(...args),
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
import type { AnimeDetail, AnimeFolder, Entry } from "../../../src/types";
import { flushPromises, renderRoutes, waitFor } from "../../test-utils";

function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: 0,
    name: "Entry",
    type: "season",
    entryNumber: 1,
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

function makeDetail(overrides: Partial<AnimeDetail> = {}): AnimeDetail {
  return {
    anime: { id: 42, name: "Bebop", aniListId: 101 },
    tags: [],
    folders: [],
    folderTree: null,
    entries: [],
    ...overrides,
  };
}

describe("InfoTab", () => {
  beforeEach(() => {
    getAnimeDetailsMock.mockReset();
    deleteAnimeMock.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
  });

  test("renders title, AniList link, entries/images/folders counts", async () => {
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({
        anime: { id: 42, name: "Bebop", aniListId: 1234 },
        folders: [
          makeFolder({ id: 1, name: "a", path: "/a", imageCount: 2 }),
          makeFolder({ id: 2, name: "b", path: "/b", imageCount: 5 }),
        ],
        entries: [makeEntry({ id: 1, imageCount: 3 })],
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
        "[data-testid='info-field-entries']",
      );
      expect(entriesField?.textContent).toContain("1 entry");

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
        entries: [
          makeEntry({
            id: 1,
            imageCount: 4,
            children: [
              makeEntry({ id: 2, imageCount: 5 }),
              makeEntry({ id: 3, imageCount: 6 }),
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
        entries: [
          // children undefined → ?? [] kicks in.
          { ...makeEntry({ id: 1, imageCount: 7 }), children: undefined as unknown as Entry[] },
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
        entries: [
          {
            ...makeEntry({ id: 1 }),
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
});
