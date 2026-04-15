/**
 * Tests for the route tree.
 *
 * Every path in frontend-design.md §3 must resolve without throwing, and the
 * nested anime-detail redirect (`/anime/:id` -> `/anime/:id/images`) must fire.
 *
 * We use `createMemoryRouter` + `RouterProvider` (via `renderRoutes`) instead
 * of the real `createBrowserRouter` so jsdom can drive navigation without
 * touching window.location.
 */

// The Wails bindings folder is generated at build time (not checked in).
// Stub `src/lib/api` so `useAnimeList` (consumed by HomePage via the root
// route) and the anime-detail hooks (consumed by AnimeDetailLayout) can be
// imported without resolving real bindings. Every service method the real
// module re-exports is replaced with a no-op so tests don't accidentally hit
// a network path.
jest.mock("../../src/lib/api", () => ({
  __esModule: true,
  AnimeService: {
    ListAnime: jest.fn(() => Promise.resolve([])),
    ListUnassignedTopFolders: jest.fn(() => Promise.resolve([])),
    GetAnime: jest.fn(() => Promise.resolve(null)),
    GetAnimeList: jest.fn(() => Promise.resolve([])),
    GetAnimeDetails: jest.fn(() =>
      Promise.resolve({
        anime: { id: 42, name: "Bebop", aniListId: null },
        tags: [],
        folders: [],
        folderTree: null,
        entries: [],
      }),
    ),
    GetAnimeImages: jest.fn(() => Promise.resolve({ images: [] })),
    GetAnimeImagesByEntry: jest.fn(() => Promise.resolve({ images: [] })),
    ImportMultipleFoldersAsAnime: jest.fn(() => Promise.resolve()),
  },
  TagService: {
    GetAll: jest.fn(() => Promise.resolve([])),
    ReadTagsByFileIDs: jest.fn(() => Promise.resolve({ tags: [] })),
  },
  ImageService: {
    GetImage: jest.fn(() => Promise.resolve(null)),
  },
  SearchService: {
    SearchImages: jest.fn(() => Promise.resolve({ files: [] })),
  },
  BackupFrontendService: {},
  ConfigFrontendService: {},
  BatchImportImageService: {},
  DirectoryService: {},
}));

// Parallel Phase D pages pull in `react-photo-album` (via ImageGrid), whose
// ESM-only build chokes under the jest transform pipeline. Stub it with a
// trivial passthrough so the route tree still imports cleanly.
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

import { routes, Placeholder } from "../../src/app/routes";
import { renderRoutes } from "../test-utils";

describe("app routes", () => {
  // Phase D replaces Placeholder pages with real ones that no longer emit the
  // "Name tab" literal copy. Anime-detail tabs are checked via their stable
  // data-testid; remaining placeholder routes stay on a text check.
  const paths: Array<{ url: string; check: (root: HTMLElement) => boolean }> =
    [
      {
        url: "/",
        check: (el) => (el.textContent ?? "").includes("AnimeVault"),
      },
      {
        url: "/anime/42/images",
        check: (el) =>
          el.querySelector("[data-testid='images-tab']") !== null ||
          el.querySelector("[data-testid='images-tab-loading']") !== null,
      },
      {
        url: "/anime/42/entries",
        check: (el) =>
          el.querySelector("[data-testid='entries-tab']") !== null ||
          el.querySelector("[data-testid='entries-tab-loading']") !== null,
      },
      {
        url: "/anime/42/characters",
        check: (el) =>
          el.querySelector("[data-testid='characters-tab']") !== null,
      },
      {
        url: "/anime/42/tags",
        check: (el) =>
          el.querySelector("[data-testid='tags-tab']") !== null ||
          el.querySelector("[data-testid='tags-tab-loading']") !== null,
      },
      {
        url: "/anime/42/info",
        check: (el) =>
          el.querySelector("[data-testid='info-tab']") !== null ||
          el.querySelector("[data-testid='info-tab-loading']") !== null,
      },
      {
        url: "/search",
        check: (el) => (el.textContent ?? "").includes("Search"),
      },
      {
        // /tags is now wired to the real TagManagementPage (Phase D4). The
        // page root carries a stable testid; we check that instead of the
        // old "Tag Management" placeholder text.
        url: "/tags",
        check: (el) =>
          el.querySelector("[data-testid='tag-management-page']") !== null,
      },
      {
        url: "/images/edit/tags",
        check: (el) =>
          el.querySelector("[data-testid='image-tag-editor-page']") !== null,
      },
      {
        url: "/settings",
        check: (el) => (el.textContent ?? "").includes("Settings"),
      },
    ];

  test.each(paths)("resolves $url without throwing", ({ url, check }) => {
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: [url],
    });
    expect(check(container)).toBe(true);
    unmount();
  });

  test("redirects /anime/:id to /anime/:id/images (default tab)", () => {
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/123"],
    });
    // <Navigate to="images" replace/> should land us on the Images tab, which
    // marks its NavLink active via aria-current="page".
    const images = container
      .querySelector("[data-testid='anime-detail-tab-images']")
      ?.querySelector("[role='tab']");
    expect(images?.getAttribute("aria-current")).toBe("page");
    // Sibling tabs stay inactive.
    const entries = container
      .querySelector("[data-testid='anime-detail-tab-entries']")
      ?.querySelector("[role='tab']");
    expect(entries?.getAttribute("aria-current")).toBeNull();
    unmount();
  });

  test("every route renders inside the AppShell (nav rail is present on tablet+ viewports)", () => {
    // Regardless of viewport, the AppShell wraps all routes so the primary
    // nav landmark is part of the tree even when hidden by CSS media.
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/search"],
    });
    const navs = container.querySelectorAll('nav[aria-label="Primary"]');
    // Both the desktop IconRail and the mobile BottomTabBar are mounted; CSS
    // hides one or the other based on viewport width. Tests just verify that
    // at least one primary-nav landmark is present.
    expect(navs.length).toBeGreaterThan(0);
    unmount();
  });

  test("unmatched paths surface the RootErrorPage (not a crash)", () => {
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/this-route-does-not-exist"],
    });
    // errorElement renders on unmatched paths. Our RootErrorPage shows
    // either "Something went wrong" or a 404 title + a "Reload app" button.
    expect(container.textContent ?? "").toMatch(/Reload app|404/i);
    unmount();
  });

  test("Placeholder helper renders the given name", () => {
    const { container, unmount } = renderRoutes(
      [
        {
          path: "/",
          element: <Placeholder name="Sample page" />,
        },
      ],
      { initialEntries: ["/"] },
    );
    expect(container.textContent).toContain("Sample page");
    expect(container.textContent).toContain("Coming from Phase D");
    unmount();
  });
});
