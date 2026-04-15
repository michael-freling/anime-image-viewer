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
});
