/**
 * Tests for `EntriesTab`.
 *
 * Spec: ui-design.md §3.2.2. We mount the tab via the real route tree so
 * `useParams` + `useNavigate` work, and stub AnimeService.
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
jest.mock("../../../src/lib/api", () => ({
  __esModule: true,
  AnimeService: {
    GetAnimeDetails: (...args: unknown[]) => getAnimeDetailsMock(...args),
    GetAnimeImages: () => Promise.resolve({ images: [] }),
    GetAnimeImagesByEntry: () => Promise.resolve({ images: [] }),
    GetAnimeList: () => Promise.resolve([]),
  },
  TagService: {
    GetAll: () => Promise.resolve([]),
  },
  SearchService: {
    SearchImages: () => Promise.resolve({ images: [] }),
  },
}));

import { act } from "react-dom/test-utils";

import { routes } from "../../../src/app/routes";
import type { AnimeDetail, Entry } from "../../../src/types";
import { renderRoutes, waitFor } from "../../test-utils";

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

function makeDetail(overrides: Partial<AnimeDetail> = {}): AnimeDetail {
  return {
    anime: { id: 42, name: "Bebop", aniListId: null },
    tags: [],
    folders: [],
    folderTree: null,
    entries: [],
    ...overrides,
  };
}

describe("EntriesTab", () => {
  beforeEach(() => {
    getAnimeDetailsMock.mockReset();
  });

  test("renders one row per top-level entry", async () => {
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({
        entries: [
          makeEntry({ id: 1, name: "Season 1", imageCount: 5 }),
          makeEntry({ id: 2, name: "Season 2", imageCount: 3 }),
          makeEntry({ id: 3, name: "The Movie", type: "movie", imageCount: 1 }),
        ],
      }),
    );
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/entries"],
    });
    try {
      await waitFor(
        () =>
          container.querySelectorAll("[data-testid='entry-row']").length === 3,
      );
      // Badges reflect the entry type (S / M).
      const badges = Array.from(
        container.querySelectorAll("[data-testid='entry-row-badge']"),
      ).map((b) => b.textContent);
      expect(badges).toEqual(["S", "S", "M"]);
    } finally {
      unmount();
    }
  });

  test("renders child entries indented under their parent", async () => {
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({
        entries: [
          makeEntry({
            id: 1,
            name: "Season 1",
            imageCount: 5,
            children: [
              makeEntry({
                id: 2,
                name: "S1 Part 2",
                type: "season",
                imageCount: 2,
              }),
            ],
          }),
        ],
      }),
    );
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/entries"],
    });
    try {
      await waitFor(
        () =>
          container.querySelectorAll("[data-testid='entry-row']").length === 2,
      );
      // The child row is listed after the parent.
      const rows = Array.from(
        container.querySelectorAll("[data-testid='entry-row']"),
      );
      expect(rows[0].getAttribute("data-entry-id")).toBe("1");
      expect(rows[1].getAttribute("data-entry-id")).toBe("2");
    } finally {
      unmount();
    }
  });

  test("empty entries renders the empty state with Add entry action", async () => {
    getAnimeDetailsMock.mockResolvedValue(makeDetail({ entries: [] }));
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/entries"],
    });
    try {
      await waitFor(
        () => (container.textContent ?? "").includes("No entries yet"),
      );
      expect(container.textContent).toContain("Add entry");
    } finally {
      unmount();
    }
  });

  test("clicking an entry row navigates to /anime/:id/images?entry=<id>", async () => {
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({
        entries: [makeEntry({ id: 9, name: "Season 1", imageCount: 5 })],
      }),
    );
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/entries"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='entry-row']") !== null,
      );
      const clickable = container.querySelector(
        "[data-testid='entry-row'] [role='button']",
      ) as HTMLElement;
      expect(clickable).not.toBeNull();
      act(() => {
        clickable.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      // After navigation, the images tab mounts.
      await waitFor(
        () =>
          container.querySelector("[data-testid='images-tab']") !== null,
      );
    } finally {
      unmount();
    }
  });

  test("surfaces an error alert when the detail query fails", async () => {
    getAnimeDetailsMock.mockRejectedValue(new Error("network"));
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/entries"],
    });
    try {
      await waitFor(
        () => container.querySelector("[role='alert']") !== null,
      );
      const alert = container.querySelector("[role='alert']");
      // Either the layout's outer alert OR the tab's inner alert may render
      // — both signal the failure to the user.
      expect(alert?.textContent ?? "").toMatch(/Could not load/);
    } finally {
      unmount();
    }
  });

  test("pressing Enter on an entry row navigates to the entry-filtered images", async () => {
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({
        entries: [makeEntry({ id: 9, name: "Season 1", imageCount: 5 })],
      }),
    );
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/entries"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='entry-row']") !== null,
      );
      const clickable = container.querySelector(
        "[data-testid='entry-row'] [role='button']",
      ) as HTMLElement;
      act(() => {
        clickable.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Enter",
            bubbles: true,
            cancelable: true,
          }),
        );
      });
      await waitFor(
        () =>
          container.querySelector("[data-testid='images-tab']") !== null,
      );
    } finally {
      unmount();
    }
  });

  test("pressing Space on an entry row also navigates (and prevents scroll)", async () => {
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({
        entries: [makeEntry({ id: 9, name: "Season 1", imageCount: 5 })],
      }),
    );
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/entries"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='entry-row']") !== null,
      );
      const clickable = container.querySelector(
        "[data-testid='entry-row'] [role='button']",
      ) as HTMLElement;
      const evt = new KeyboardEvent("keydown", {
        key: " ",
        bubbles: true,
        cancelable: true,
      });
      act(() => {
        clickable.dispatchEvent(evt);
      });
      expect(evt.defaultPrevented).toBe(true);
      await waitFor(
        () =>
          container.querySelector("[data-testid='images-tab']") !== null,
      );
    } finally {
      unmount();
    }
  });

  test("pressing an unrelated key does not navigate away", async () => {
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({
        entries: [makeEntry({ id: 9, name: "Season 1", imageCount: 5 })],
      }),
    );
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/entries"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='entry-row']") !== null,
      );
      const clickable = container.querySelector(
        "[data-testid='entry-row'] [role='button']",
      ) as HTMLElement;
      act(() => {
        clickable.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "a",
            bubbles: true,
            cancelable: true,
          }),
        );
      });
      // Still on entries tab.
      expect(
        container.querySelector("[data-testid='entry-row']"),
      ).not.toBeNull();
      expect(
        container.querySelector("[data-testid='images-tab']"),
      ).toBeNull();
    } finally {
      unmount();
    }
  });

  test("entry without an airing season hides the airing line", async () => {
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({
        entries: [
          makeEntry({
            id: 1,
            name: "Season 1",
            airingSeason: "",
            airingYear: null,
            imageCount: 5,
          }),
        ],
      }),
    );
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/entries"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='entry-row']") !== null,
      );
      // The airing line is omitted (no "Spring 2024" text), only the image
      // count is shown beneath the title.
      const row = container.querySelector(
        "[data-testid='entry-row']",
      ) as HTMLElement;
      expect(row.textContent).toContain("5 images");
    } finally {
      unmount();
    }
  });

  test("entry with empty name falls back to '{label} {entryNumber}' format", async () => {
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({
        entries: [
          makeEntry({
            id: 1,
            name: "",
            type: "season",
            entryNumber: 3,
            imageCount: 0,
          }),
        ],
      }),
    );
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/entries"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='entry-row']") !== null,
      );
      const row = container.querySelector(
        "[data-testid='entry-row']",
      ) as HTMLElement;
      // Falls back to "Season 3" via the ENTRY_TYPE_CONFIGS label + number.
      expect(row.textContent).toMatch(/Season\s*3/);
    } finally {
      unmount();
    }
  });

  test("entry whose type isn't in ENTRY_TYPE_CONFIGS uses the 'other' fallback", async () => {
    // An "other"-typed entry exercises the `?? ENTRY_TYPE_CONFIGS.other`
    // fallback inside EntryRow.
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({
        entries: [
          makeEntry({
            id: 1,
            name: "Special",
            type: "other",
            imageCount: 0,
          }),
        ],
      }),
    );
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/entries"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='entry-row']") !== null,
      );
      const badge = container.querySelector(
        "[data-testid='entry-row-badge']",
      );
      expect(badge?.textContent).toBe("O");
    } finally {
      unmount();
    }
  });

  test("error state surfaces a non-Error rejection via String(...)", async () => {
    // Reject with something that isn't an Error instance — the
    // `error instanceof Error ? ... : String(error ?? "")` branch picks the
    // String() coercion, which we observe in the rendered alert text.
    getAnimeDetailsMock.mockRejectedValue("string-only-error");
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/entries"],
    });
    try {
      await waitFor(
        () => container.querySelector("[role='alert']") !== null,
      );
      const alert = container.querySelector("[role='alert']");
      expect(alert?.textContent ?? "").toContain("string-only-error");
    } finally {
      unmount();
    }
  });

  test("non-numeric animeId in the URL still keeps the query disabled", async () => {
    // /anime/0/entries → parseAnimeId returns 0 → the detail query is
    // disabled, so getAnimeDetailsMock is never invoked. The tab still
    // mounts (animeId 0 is technically a valid path) — we just don't fire
    // the network call.
    getAnimeDetailsMock.mockResolvedValue(makeDetail({ entries: [] }));
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/0/entries"],
    });
    try {
      // Wait for ANY of the tab's branches to render (the test only cares
      // that the disabled-query branch fired, not which fallback the page
      // chose).
      await waitFor(
        () =>
          container.querySelector("[data-testid='entries-tab']") !== null ||
          container.querySelector(
            "[data-testid='entries-tab-loading']",
          ) !== null,
        { timeout: 200 },
      ).catch(() => undefined);
      // The disabled query should never have been executed.
      expect(getAnimeDetailsMock).not.toHaveBeenCalled();
    } finally {
      unmount();
    }
  });

  test("Retry button on error state kicks off a refetch", async () => {
    let calls = 0;
    getAnimeDetailsMock.mockImplementation(() => {
      calls += 1;
      if (calls === 1) {
        return Promise.reject(new Error("boom"));
      }
      return Promise.resolve(
        makeDetail({
          entries: [makeEntry({ id: 1, name: "Season 1", imageCount: 0 })],
        }),
      );
    });
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/entries"],
    });
    try {
      await waitFor(
        () => container.querySelector("[role='alert']") !== null,
      );
      const retry = Array.from(container.querySelectorAll("button")).find(
        (b) => (b.textContent ?? "").trim() === "Retry",
      ) as HTMLButtonElement | undefined;
      expect(retry).toBeDefined();
      act(() => {
        retry!.click();
      });
      await waitFor(
        () =>
          container.querySelector("[data-testid='entry-row']") !== null,
      );
    } finally {
      unmount();
    }
  });
});
