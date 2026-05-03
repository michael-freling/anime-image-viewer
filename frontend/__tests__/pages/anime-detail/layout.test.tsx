/**
 * Integration tests for `AnimeDetailLayout`.
 *
 * The layout shell owns the header, the tab bar, and the `<Outlet />` that
 * renders the active tab. We mount it via the real route tree so the
 * NavLink-based tab bar can pick up the active tab from the URL.
 *
 * We mock `AnimeService` so the shell renders a deterministic anime name +
 * metadata without hitting the Wails bridge. The images/tags/entries tabs
 * have their own tests so here we just verify the structural behaviours.
 */

// ---- mocks ---------------------------------------------------------------

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
const getAnimeImagesMock = jest.fn();
const getAnimeImagesByEntryMock = jest.fn();
const getAnimeListMock = jest.fn();
const importImagesMock = jest.fn();
jest.mock("../../../src/lib/api", () => ({
  __esModule: true,
  AnimeService: {
    GetAnimeDetails: (...args: unknown[]) => getAnimeDetailsMock(...args),
    GetAnimeImages: (...args: unknown[]) => getAnimeImagesMock(...args),
    GetAnimeImagesByEntry: (...args: unknown[]) =>
      getAnimeImagesByEntryMock(...args),
    GetAnimeList: (...args: unknown[]) => getAnimeListMock(...args),
  },
  BatchImportImageService: {
    ImportImages: (...args: unknown[]) => importImagesMock(...args),
  },
  TagService: {
    GetAll: () => Promise.resolve([]),
  },
  SearchService: {
    SearchImages: () => Promise.resolve({ images: [] }),
  },
}));

// ---- imports under test -------------------------------------------------

import { act } from "react-dom/test-utils";

import { routes } from "../../../src/app/routes";
import { useSelectionStore } from "../../../src/stores/selection-store";
import { renderRoutes, waitFor } from "../../test-utils";

function makeDetail(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    anime: { id: 42, name: "Bebop", aniListId: null },
    tags: [],
    characters: [],
    folders: [],
    folderTree: null,
    entries: [],
    ...overrides,
  };
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

describe("AnimeDetailLayout (via routes)", () => {
  beforeEach(() => {
    getAnimeDetailsMock.mockReset();
    getAnimeDetailsMock.mockResolvedValue(makeDetail());
    getAnimeImagesMock.mockReset();
    getAnimeImagesMock.mockResolvedValue({ images: [] });
    getAnimeImagesByEntryMock.mockReset();
    getAnimeImagesByEntryMock.mockResolvedValue({ images: [] });
    getAnimeListMock.mockReset();
    getAnimeListMock.mockResolvedValue([]);
    importImagesMock.mockReset();
    importImagesMock.mockResolvedValue(undefined);
    resetSelectionStore();
  });

  test("renders the detail layout and the tab bar for /anime/:id/images", async () => {
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/images"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='anime-detail-layout']") !==
          null,
      );
      // Tab bar is present.
      expect(
        container.querySelector("[data-testid='anime-detail-tab-bar']"),
      ).not.toBeNull();
    } finally {
      unmount();
    }
  });

  test("/anime/:id redirects to /anime/:id/images (default tab)", async () => {
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='images-tab']") !== null,
      );
      // The Images tab indicator is marked active.
      const imagesTab = container
        .querySelector("[data-testid='anime-detail-tab-images']")
        ?.querySelector("[role='tab']");
      expect(imagesTab?.getAttribute("aria-current")).toBe("page");
    } finally {
      unmount();
    }
  });

  test("switching URL surfaces the active tab's aria-current", async () => {
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/info"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='info-tab']") !== null ||
          container.querySelector("[data-testid='info-tab-loading']") !== null,
      );
      const infoTab = container
        .querySelector("[data-testid='anime-detail-tab-info']")
        ?.querySelector("[role='tab']");
      expect(infoTab?.getAttribute("aria-current")).toBe("page");

      // Tags tab should not be active.
      const tagsTab = container
        .querySelector("[data-testid='anime-detail-tab-tags']")
        ?.querySelector("[role='tab']");
      expect(tagsTab?.getAttribute("aria-current")).toBeNull();
    } finally {
      unmount();
    }
  });

  test("layout renders tab bar without breadcrumb", async () => {
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/images"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='anime-detail-layout']") !==
          null,
      );
      const layout = container.querySelector(
        "[data-testid='anime-detail-layout']",
      )!;
      // Breadcrumb has been removed; "Home" link should not appear.
      expect(layout.textContent ?? "").not.toContain("Home");
      // Tab bar should still render.
      expect(
        container.querySelector("[data-testid='anime-detail-tab-bar']"),
      ).not.toBeNull();
    } finally {
      unmount();
    }
  });

  test("invalid anime id shows an inline error without crashing", async () => {
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/abc/images"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='anime-detail-invalid-id']") !==
          null,
      );
      const alert = container.querySelector("[role='alert']");
      expect(alert?.textContent ?? "").toContain("Invalid anime");
    } finally {
      unmount();
    }
  });

  test("tab panel is rendered with role=tabpanel", async () => {
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/images"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector(
            "[data-testid='anime-detail-tab-panel']",
          ) !== null,
      );
      const panel = container.querySelector(
        "[data-testid='anime-detail-tab-panel']",
      );
      expect(panel?.getAttribute("role")).toBe("tabpanel");
    } finally {
      unmount();
    }
  });

  test("layout does not render an upload button (upload is on the images toolbar)", async () => {
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({
        folders: [
          { id: 10, name: "root", path: "/root", imageCount: 0, inherited: false },
        ],
      }),
    );
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/images"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='anime-detail-layout']") !==
          null,
      );
      expect(
        container.querySelector("[data-testid='anime-detail-upload']"),
      ).toBeNull();
    } finally {
      unmount();
    }
  });
});
