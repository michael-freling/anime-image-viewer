/**
 * Tests for `AnimeDetailTabBar`.
 *
 * Spec: ui-design.md §3.2 "Tabs: Images (default) | Entries | Characters |
 * Tags | Info". The component is a thin wrapper over NavLink; the tests lock
 * down tab order, active-tab indicator, and aria markup.
 *
 * We mount the tab bar inside a `createMemoryRouter` route tree with the
 * pattern `/anime/:animeId/*` so NavLink's relative-path resolution picks
 * up the currently-matched URL — otherwise all tabs render as inactive.
 */
import {
  ANIME_DETAIL_TABS,
  AnimeDetailTabBar,
} from "../../../src/pages/anime-detail/tab-bar";
import { renderRoutes, renderWithClient } from "../../test-utils";

// Mount the tab bar under a nested route that matches the URL pattern so
// relative paths (`to="images"`) resolve against `/anime/:animeId/*`.
const tabBarRoutes = [
  {
    path: "anime/:animeId",
    element: <AnimeDetailTabBar />,
    children: [
      { path: "images", element: <div /> },
      { path: "entries", element: <div /> },
      { path: "characters", element: <div /> },
      { path: "tags", element: <div /> },
      { path: "info", element: <div /> },
    ],
  },
];

describe("AnimeDetailTabBar", () => {
  test("renders five tabs in canonical order", () => {
    const { container, unmount } = renderRoutes(tabBarRoutes, {
      initialEntries: ["/anime/1/images"],
    });
    try {
      // Tabs are NavLinks inside the tab bar; exclude the tab-bar root
      // itself (which carries data-testid="anime-detail-tab-bar").
      const tabs = Array.from(
        container.querySelectorAll("[data-testid^='anime-detail-tab-']"),
      ).filter(
        (el) => el.getAttribute("data-testid") !== "anime-detail-tab-bar",
      );
      expect(tabs.length).toBe(5);
      const ids = tabs.map((t) =>
        t.getAttribute("data-testid")?.replace("anime-detail-tab-", ""),
      );
      expect(ids).toEqual([
        "images",
        "entries",
        "characters",
        "tags",
        "info",
      ]);
    } finally {
      unmount();
    }
  });

  test("the active tab carries aria-current='page' and data-active", () => {
    const { container, unmount } = renderRoutes(tabBarRoutes, {
      initialEntries: ["/anime/7/tags"],
    });
    try {
      const tags = container.querySelector(
        "[data-testid='anime-detail-tab-tags']",
      )!;
      // role=tab lives on the inner Box — find it by role.
      const activeInner = tags.querySelector("[role='tab']")!;
      expect(activeInner.getAttribute("aria-current")).toBe("page");
      expect(activeInner.getAttribute("aria-selected")).toBe("true");
      expect(activeInner.getAttribute("data-active")).toBe("true");

      // Other tabs should not be active.
      const images = container
        .querySelector("[data-testid='anime-detail-tab-images']")!
        .querySelector("[role='tab']")!;
      expect(images.getAttribute("aria-current")).toBeNull();
      expect(images.getAttribute("data-active")).toBeNull();
    } finally {
      unmount();
    }
  });

  test("renders inside a tablist with an accessible label", () => {
    const { container, unmount } = renderWithClient(<AnimeDetailTabBar />, {
      routerInitialEntries: ["/anime/1/images"],
    });
    try {
      const tabBar = container.querySelector(
        "[data-testid='anime-detail-tab-bar']",
      );
      expect(tabBar?.getAttribute("role")).toBe("tablist");
      expect(tabBar?.getAttribute("aria-label")).toBe("Anime detail tabs");
    } finally {
      unmount();
    }
  });

  test("exports a public tab list that matches the rendered tabs", () => {
    expect(ANIME_DETAIL_TABS.map((t) => t.to)).toEqual([
      "images",
      "entries",
      "characters",
      "tags",
      "info",
    ]);
    expect(ANIME_DETAIL_TABS.map((t) => t.label)).toEqual([
      "Images",
      "Entries",
      "Characters",
      "Tags",
      "Info",
    ]);
  });
});
