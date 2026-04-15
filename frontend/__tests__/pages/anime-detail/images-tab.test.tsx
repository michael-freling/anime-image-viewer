/**
 * Tests for `ImagesTab` — the primary tab on the Anime Detail page.
 *
 * We mount the tab via `renderRoutes` so `useParams`, `useSearchParams`, and
 * `useNavigate` all resolve against a memory router with the right URL
 * pattern. `react-photo-album` is stubbed as in image-grid.test.tsx so the
 * render tree is plain DOM and we can assert on tile counts.
 *
 * Covered behaviours:
 *   - loading skeletons, success grid, empty state, error alert
 *   - EntryTab row filters the grid (via ?entry=<id>)
 *   - SearchBar filters client-side on filename
 *   - toggling select mode mounts the SelectionActionBar
 *   - clicking a tile in select mode updates the selection store
 */

// ---- mocks ---------------------------------------------------------------

jest.mock("react-photo-album/masonry.css", () => ({}), { virtual: true });
jest.mock("react-photo-album/columns.css", () => ({}), { virtual: true });
jest.mock("react-photo-album/rows.css", () => ({}), { virtual: true });
jest.mock("react-photo-album", () => {
  const ReactModule = jest.requireActual<typeof import("react")>("react");
  interface StubProps {
    photos: readonly { key?: string; width?: number; height?: number }[];
    render?: {
      image?: (
        props: unknown,
        context: {
          photo: { key?: string; width?: number; height?: number };
          index: number;
          width: number;
          height: number;
        },
      ) => React.ReactNode;
    };
  }
  const renderPhotos = (props: StubProps) =>
    ReactModule.createElement(
      "div",
      { "data-testid": "photo-album-stub" },
      props.photos.map((photo, index) =>
        ReactModule.createElement(
          "div",
          { key: photo.key ?? String(index), "data-photo-key": photo.key },
          props.render?.image?.(
            {},
            {
              photo,
              index,
              width: photo.width ?? 0,
              height: photo.height ?? 0,
            },
          ),
        ),
      ),
    );
  return {
    __esModule: true,
    MasonryPhotoAlbum: renderPhotos,
    ColumnsPhotoAlbum: renderPhotos,
    RowsPhotoAlbum: renderPhotos,
  };
});

const getAnimeDetailsMock = jest.fn();
const getAnimeImagesMock = jest.fn();
const getAnimeImagesByEntryMock = jest.fn();
jest.mock("../../../src/lib/api", () => ({
  __esModule: true,
  AnimeService: {
    GetAnimeDetails: (...args: unknown[]) => getAnimeDetailsMock(...args),
    GetAnimeImages: (...args: unknown[]) => getAnimeImagesMock(...args),
    GetAnimeImagesByEntry: (...args: unknown[]) =>
      getAnimeImagesByEntryMock(...args),
    GetAnimeList: () => Promise.resolve([]),
  },
  TagService: {
    GetAll: () => Promise.resolve([]),
  },
  SearchService: {
    SearchImages: () => Promise.resolve({ images: [] }),
  },
}));

// ---- imports ------------------------------------------------------------

import { act } from "react-dom/test-utils";

import { routes } from "../../../src/app/routes";
import { useSelectionStore } from "../../../src/stores/selection-store";
import type { AnimeDetail, Entry, ImageFile } from "../../../src/types";
import { renderRoutes, waitFor, flushPromises } from "../../test-utils";

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

function makeImage(id: number, name: string): ImageFile {
  return { id, name, path: `bebop/${name}` };
}

function resetSelectionStore() {
  act(() => {
    useSelectionStore.setState({
      selectMode: false,
      selectedIds: new Set<number>(),
      lastSelectedId: null,
    });
  });
}

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

describe("ImagesTab", () => {
  beforeEach(() => {
    getAnimeDetailsMock.mockReset();
    getAnimeDetailsMock.mockResolvedValue(makeDetail());
    getAnimeImagesMock.mockReset();
    getAnimeImagesMock.mockResolvedValue({ images: [] });
    getAnimeImagesByEntryMock.mockReset();
    getAnimeImagesByEntryMock.mockResolvedValue({ images: [] });
    resetSelectionStore();
  });

  test("renders loading skeletons while images are pending", async () => {
    // Prevent the images resolver from settling so isLoading stays true.
    const resolveRef: { resolve: ((v: unknown) => void) | null } = {
      resolve: null,
    };
    getAnimeImagesMock.mockImplementation(
      () =>
        new Promise((r) => {
          resolveRef.resolve = r;
        }),
    );
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/images"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='images-tab-loading']") !==
          null,
      );
      expect(
        container.querySelector("[data-testid='images-tab-loading']"),
      ).not.toBeNull();
    } finally {
      if (resolveRef.resolve) resolveRef.resolve({ images: [] });
      unmount();
    }
  });

  test("renders the grid when images are returned", async () => {
    getAnimeImagesMock.mockResolvedValue({
      images: [
        makeImage(1, "a.png"),
        makeImage(2, "b.png"),
        makeImage(3, "c.png"),
      ],
    });
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/images"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='image-grid']") !== null,
      );
      const tiles = container.querySelectorAll(
        "[data-testid='image-thumbnail']",
      );
      expect(tiles.length).toBe(3);
    } finally {
      unmount();
    }
  });

  test("renders an empty state with Upload action when no images", async () => {
    getAnimeImagesMock.mockResolvedValue({ images: [] });
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/images"],
    });
    try {
      await waitFor(
        () => (container.textContent ?? "").includes("No images yet"),
      );
      expect(
        container.querySelector("[data-testid='images-tab-empty-upload']"),
      ).not.toBeNull();
    } finally {
      unmount();
    }
  });

  test("surfaces an ErrorAlert on query failure with a retry button", async () => {
    getAnimeImagesMock.mockRejectedValue(new Error("boom"));
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/images"],
    });
    try {
      await waitFor(() => container.querySelector("[role='alert']") !== null);
      const alert = container.querySelector("[role='alert']");
      expect(alert?.textContent ?? "").toContain("Could not load images");
      expect(alert?.textContent ?? "").toContain("boom");
    } finally {
      unmount();
    }
  });

  test("entry filter in URL calls GetAnimeImagesByEntry", async () => {
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({
        entries: [
          makeEntry({ id: 10, name: "Season 1", imageCount: 12 }),
          makeEntry({ id: 11, name: "Season 2", imageCount: 8 }),
        ],
      }),
    );
    getAnimeImagesByEntryMock.mockResolvedValue({
      images: [makeImage(500, "s1-ep1.png")],
    });
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/images?entry=10"],
    });
    try {
      await waitFor(
        () => getAnimeImagesByEntryMock.mock.calls.length > 0,
      );
      expect(getAnimeImagesByEntryMock).toHaveBeenCalledWith(42, 10);
      expect(getAnimeImagesMock).not.toHaveBeenCalled();
      await waitFor(
        () => container.querySelector("[data-testid='image-grid']") !== null,
      );
      const tiles = container.querySelectorAll(
        "[data-testid='image-thumbnail']",
      );
      expect(tiles.length).toBe(1);
    } finally {
      unmount();
    }
  });

  test("clicking an EntryTab updates ?entry=... in the URL and triggers a refetch", async () => {
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({
        entries: [makeEntry({ id: 20, name: "Movie", imageCount: 4 })],
      }),
    );
    getAnimeImagesByEntryMock.mockResolvedValue({
      images: [makeImage(600, "movie-clip.png")],
    });
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/images"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='entry-filter-row']") !==
          null,
      );
      // There should be an "All episodes" tab plus the single entry chip.
      const entryTabs = container.querySelectorAll(
        "[data-testid='entry-filter-row'] [role='tab']",
      );
      expect(entryTabs.length).toBeGreaterThanOrEqual(2);
      // Find the chip whose text contains "Movie".
      const movieChip = Array.from(entryTabs).find((el) =>
        el.textContent?.includes("Movie"),
      ) as HTMLElement | undefined;
      expect(movieChip).toBeDefined();
      act(() => {
        movieChip!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await waitFor(
        () => getAnimeImagesByEntryMock.mock.calls.length > 0,
      );
      expect(getAnimeImagesByEntryMock).toHaveBeenCalledWith(42, 20);
    } finally {
      unmount();
    }
  });

  test("SearchBar filters images by filename client-side", async () => {
    getAnimeImagesMock.mockResolvedValue({
      images: [
        makeImage(1, "beach-sunset.png"),
        makeImage(2, "forest-morning.png"),
        makeImage(3, "beach-night.png"),
      ],
    });
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/images"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='image-grid']") !== null,
      );
      const input = container.querySelector(
        "input[role='searchbox']",
      ) as HTMLInputElement;
      expect(input).not.toBeNull();
      setInputValue(input, "beach");
      await flushPromises();
      const tiles = container.querySelectorAll(
        "[data-testid='image-thumbnail']",
      );
      expect(tiles.length).toBe(2);
      const ids = Array.from(tiles).map((el) =>
        el.getAttribute("data-file-id"),
      );
      expect(ids.sort()).toEqual(["1", "3"]);
    } finally {
      unmount();
    }
  });

  test("filter with no matches renders the filter-aware empty state (no Upload button)", async () => {
    getAnimeImagesMock.mockResolvedValue({
      images: [makeImage(1, "apple.png")],
    });
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/images"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='image-grid']") !== null,
      );
      const input = container.querySelector(
        "input[role='searchbox']",
      ) as HTMLInputElement;
      setInputValue(input, "xyz");
      await flushPromises();
      await waitFor(
        () => (container.textContent ?? "").includes("No matching images"),
      );
      // When filtering, the Upload action is suppressed.
      expect(
        container.querySelector("[data-testid='images-tab-empty-upload']"),
      ).toBeNull();
    } finally {
      unmount();
    }
  });

  test("toggling select mode mounts the SelectionActionBar", async () => {
    getAnimeImagesMock.mockResolvedValue({
      images: [makeImage(1, "a.png")],
    });
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/images"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector(
            "[data-testid='images-tab-select-toggle']",
          ) !== null,
      );
      expect(
        container.querySelector("[data-testid='selection-action-bar']"),
      ).toBeNull();
      const toggle = container.querySelector(
        "[data-testid='images-tab-select-toggle']",
      ) as HTMLElement;
      act(() => {
        toggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      expect(
        container.querySelector("[data-testid='selection-action-bar']"),
      ).not.toBeNull();
      // Button now reflects the active state.
      expect(toggle.getAttribute("aria-pressed")).toBe("true");
    } finally {
      unmount();
    }
  });

  test("clicking a tile while in select mode toggles selection in the store", async () => {
    getAnimeImagesMock.mockResolvedValue({
      images: [makeImage(1, "a.png"), makeImage(2, "b.png")],
    });
    // Pre-enter select mode so the click handler routes through selection.
    act(() => {
      useSelectionStore.setState({ selectMode: true });
    });
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/images"],
    });
    try {
      await waitFor(
        () =>
          container.querySelectorAll("[data-testid='image-thumbnail']")
            .length === 2,
      );
      const tile = container.querySelector(
        "[data-file-id='1']",
      ) as HTMLElement;
      act(() => {
        tile.click();
      });
      // After click the store contains id 1.
      expect(
        useSelectionStore.getState().selectedIds.has(1),
      ).toBe(true);
      // Click it again to toggle off.
      act(() => {
        tile.click();
      });
      expect(
        useSelectionStore.getState().selectedIds.has(1),
      ).toBe(false);
    } finally {
      unmount();
    }
  });

  test("rubber band overlay is mounted only when select mode is active", async () => {
    getAnimeImagesMock.mockResolvedValue({
      images: [makeImage(1, "a.png")],
    });
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/images"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='image-grid']") !== null,
      );
      // Overlay requires a rubber-band test id — not yet mounted.
      expect(
        container.querySelector(
          "[data-testid='rubber-band-live-region']",
        ),
      ).toBeNull();
      const toggle = container.querySelector(
        "[data-testid='images-tab-select-toggle']",
      ) as HTMLElement;
      act(() => {
        toggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      expect(
        container.querySelector(
          "[data-testid='rubber-band-live-region']",
        ),
      ).not.toBeNull();
    } finally {
      unmount();
    }
  });
});
