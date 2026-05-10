/**
 * Tests for the character filter on the search page.
 *
 * Bug reproduction: navigating from the anime detail characters tab to the
 * search page with URL params like `/search?char=5&anime=10` should highlight
 * the character chip as active (included). Clicking the character chip should
 * cycle its state (include -> exclude -> unset).
 *
 * These tests use `renderRoutes` with the real route tree (including AppShell)
 * to be as faithful as possible to the production app. The earlier version
 * used `renderWithClient` with a bare `<SearchPage />` inside `MemoryRouter`,
 * which missed subtle integration issues.
 */

// ---- Mocks (hoisted) -----------------------------------------------------

jest.mock("@mantine/hooks", () => ({
  __esModule: true,
  useDebouncedValue: (value: unknown) => [value],
  useHotkeys: () => undefined,
}));

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

const searchImagesMock = jest.fn();
const getAllTagsMock = jest.fn();
const getAnimeDetailsMock = jest.fn();
const searchImagesByAnimeMock = jest.fn();
const getFolderImagesMock = jest.fn();
const getImageTagIDsMock = jest.fn();
const getImageCharacterIDsMock = jest.fn();
const listAnimeMock = jest.fn();

jest.mock("../../../src/lib/api", () => ({
  __esModule: true,
  AnimeService: {
    GetAnimeDetails: (...args: unknown[]) => getAnimeDetailsMock(...args),
    SearchImagesByAnime: (...args: unknown[]) =>
      searchImagesByAnimeMock(...args),
    GetFolderImages: (...args: unknown[]) => getFolderImagesMock(...args),
    GetImageTagIDs: (...args: unknown[]) => getImageTagIDsMock(...args),
    GetAnimeList: () => listAnimeMock(),
    ListAnime: () => listAnimeMock(),
  },
  CharacterService: {
    GetImageCharacterIDs: (...args: unknown[]) =>
      getImageCharacterIDsMock(...args),
  },
  SearchService: {
    SearchImages: (...args: unknown[]) => searchImagesMock(...args),
  },
  TagService: {
    GetAll: () => getAllTagsMock(),
  },
}));

// ---- Imports under test ---------------------------------------------------

import { act } from "react-dom/test-utils";

import { routes } from "../../../src/app/routes";
import { useSelectionStore } from "../../../src/stores/selection-store";
import { renderRoutes, waitFor } from "../../test-utils";

// ---- Helpers --------------------------------------------------------------

function resetSelectionStore() {
  act(() => {
    useSelectionStore.setState({
      selectMode: false,
      selectedIds: new Set<number>(),
      lastSelectedId: null,
    });
  });
}

// Simulate what Wails AnimeCharacterInfo.createFrom produces.
// The real Wails bindings return class instances, not plain objects.
class MockCharacterInfo {
  id: number;
  name: string;
  imageCount: number;
  thumbnailPath: string;
  constructor(src: Record<string, unknown>) {
    this.id = 0;
    this.name = "";
    this.imageCount = 0;
    this.thumbnailPath = "";
    Object.assign(this, src);
  }
}

describe("SearchPage character filter (renderRoutes)", () => {
  beforeEach(() => {
    searchImagesMock.mockReset();
    searchImagesMock.mockResolvedValue({ images: [] });
    getAllTagsMock.mockReset();
    getAllTagsMock.mockResolvedValue([]);
    getAnimeDetailsMock.mockReset();
    searchImagesByAnimeMock.mockReset();
    searchImagesByAnimeMock.mockResolvedValue({ images: [] });
    getFolderImagesMock.mockReset();
    getFolderImagesMock.mockResolvedValue({ images: [] });
    getImageTagIDsMock.mockReset();
    getImageTagIDsMock.mockResolvedValue({});
    getImageCharacterIDsMock.mockReset();
    getImageCharacterIDsMock.mockResolvedValue({});
    listAnimeMock.mockReset();
    listAnimeMock.mockResolvedValue([]);
    resetSelectionStore();
  });

  test("character chip from URL ?char=5 is highlighted as active (plain objects)", async () => {
    getAnimeDetailsMock.mockResolvedValue({
      anime: { id: 10, name: "My Anime", aniListId: null },
      tags: [],
      characters: [
        { id: 5, name: "Sakura", imageCount: 3 },
        { id: 6, name: "Naruto", imageCount: 2 },
      ],
      folders: [],
      folderTree: null,
      entries: [],
    });
    searchImagesByAnimeMock.mockResolvedValue({ images: [] });

    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/search?char=5&anime=10"],
    });
    try {
      // With filters present, the collapsible panel starts collapsed.
      // Toggle it open so we can inspect the character picker.
      await waitFor(
        () =>
          container.querySelector("[data-testid='search-filter-toggle']") !== null,
      );
      const toggle = container.querySelector(
        "[data-testid='search-filter-toggle']",
      ) as HTMLElement;
      act(() => {
        toggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      // Wait for the character picker to render.
      await waitFor(
        () =>
          container.querySelector("[data-testid='character-picker']") !== null,
      );

      const charPicker = container.querySelector(
        "[data-testid='character-picker']",
      );
      expect(charPicker).not.toBeNull();
      expect(charPicker?.textContent).toContain("Sakura");
      expect(charPicker?.textContent).toContain("Naruto");

      // Find the Sakura chip (id=5) inside the character picker.
      const chips = charPicker!.querySelectorAll("[data-testid='tag-chip']");
      const sakuraChip = Array.from(chips).find((el) =>
        el.textContent?.includes("Sakura"),
      ) as HTMLElement | undefined;
      expect(sakuraChip).toBeDefined();

      // DEBUG: Dump actual attribute values to understand what's happening.
      const actualActive = sakuraChip!.getAttribute("data-active");
      const actualPressed = sakuraChip!.getAttribute("aria-pressed");
      const actualCategory = sakuraChip!.getAttribute("data-category");

      // Verify data-category resolves correctly for "character" category.
      // The tagCategoryKey function maps "character" -> "uncategorized"
      // because "character" is NOT in TAG_CATEGORY_KEY_MAP.
      // This is a VISUAL bug but not a data/logic bug.
      expect(actualCategory).toBeDefined();

      // The Sakura chip should be highlighted (active) because char=5 is in
      // the URL. This is the core assertion for the bug reproduction.
      expect(actualActive).toBe("true");
      expect(actualPressed).toBe("true");

      // The Naruto chip (id=6) should NOT be active.
      const narutoChip = Array.from(chips).find((el) =>
        el.textContent?.includes("Naruto"),
      ) as HTMLElement | undefined;
      expect(narutoChip).toBeDefined();
      expect(narutoChip!.hasAttribute("data-active")).toBe(false);
    } finally {
      unmount();
    }
  });

  test("character chip from URL ?char=5 is highlighted as active (class instances from Wails)", async () => {
    // Return class-like objects that simulate what Wails bindings produce
    // via AnimeCharacterInfo.createFrom / Object.assign.
    getAnimeDetailsMock.mockResolvedValue({
      anime: { id: 10, name: "My Anime", aniListId: null },
      tags: [],
      characters: [
        new MockCharacterInfo({ id: 5, name: "Sakura", imageCount: 3 }),
        new MockCharacterInfo({ id: 6, name: "Naruto", imageCount: 2 }),
      ],
      folders: [],
      folderTree: null,
      entries: [],
    });
    searchImagesByAnimeMock.mockResolvedValue({ images: [] });

    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/search?char=5&anime=10"],
    });
    try {
      // With filters present, the collapsible panel starts collapsed.
      // Toggle it open so we can inspect the character picker.
      await waitFor(
        () =>
          container.querySelector("[data-testid='search-filter-toggle']") !== null,
      );
      const toggle = container.querySelector(
        "[data-testid='search-filter-toggle']",
      ) as HTMLElement;
      act(() => {
        toggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      // Wait for the character picker to render.
      await waitFor(
        () =>
          container.querySelector("[data-testid='character-picker']") !== null,
      );

      const charPicker = container.querySelector(
        "[data-testid='character-picker']",
      );
      expect(charPicker).not.toBeNull();

      const chips = charPicker!.querySelectorAll("[data-testid='tag-chip']");
      const sakuraChip = Array.from(chips).find((el) =>
        el.textContent?.includes("Sakura"),
      ) as HTMLElement | undefined;
      expect(sakuraChip).toBeDefined();

      // Even with class instances, the id should still be a number that
      // matches the parsed URL param (which is also a number).
      const actualActive = sakuraChip!.getAttribute("data-active");
      const actualPressed = sakuraChip!.getAttribute("aria-pressed");

      expect(actualActive).toBe("true");
      expect(actualPressed).toBe("true");

      // Naruto should NOT be active.
      const narutoChip = Array.from(chips).find((el) =>
        el.textContent?.includes("Naruto"),
      ) as HTMLElement | undefined;
      expect(narutoChip).toBeDefined();
      expect(narutoChip!.hasAttribute("data-active")).toBe(false);
    } finally {
      unmount();
    }
  });

  test("clicking a character chip cycles it through include -> exclude -> unset", async () => {
    getAnimeDetailsMock.mockResolvedValue({
      anime: { id: 10, name: "My Anime", aniListId: null },
      tags: [],
      characters: [
        { id: 5, name: "Sakura", imageCount: 3 },
      ],
      folders: [],
      folderTree: null,
      entries: [],
    });
    searchImagesByAnimeMock.mockResolvedValue({ images: [] });

    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/search?char=5&anime=10"],
    });
    try {
      // With filters present, the collapsible panel starts collapsed.
      // Toggle it open so we can inspect the character picker.
      await waitFor(
        () =>
          container.querySelector("[data-testid='search-filter-toggle']") !== null,
      );
      const toggleBtn = container.querySelector(
        "[data-testid='search-filter-toggle']",
      ) as HTMLElement;
      act(() => {
        toggleBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      // Wait for the character picker to render.
      await waitFor(
        () =>
          container.querySelector("[data-testid='character-picker']") !== null,
      );

      const findSakuraChip = () => {
        const charPicker = container.querySelector(
          "[data-testid='character-picker']",
        );
        const chips = charPicker?.querySelectorAll(
          "[data-testid='tag-chip']",
        );
        return Array.from(chips ?? []).find((el) =>
          el.textContent?.includes("Sakura"),
        ) as HTMLElement | undefined;
      };

      // Initial state: chip should be active (included from URL).
      let sakura = findSakuraChip();
      expect(sakura).toBeDefined();
      expect(sakura!.getAttribute("data-active")).toBe("true");

      // Click once: should cycle from include -> exclude.
      act(() => {
        sakura!.dispatchEvent(
          new MouseEvent("click", { bubbles: true }),
        );
      });

      // Wait for the chip to update to excluded state.
      await waitFor(() => {
        sakura = findSakuraChip();
        return sakura?.hasAttribute("data-excluded") === true;
      });
      expect(sakura!.getAttribute("data-excluded")).toBe("true");
      expect(sakura!.hasAttribute("data-active")).toBe(false);

      // Click again: should cycle from exclude -> unset.
      act(() => {
        sakura!.dispatchEvent(
          new MouseEvent("click", { bubbles: true }),
        );
      });

      // Wait for the chip to be neither active nor excluded.
      await waitFor(() => {
        sakura = findSakuraChip();
        return (
          !sakura?.hasAttribute("data-active") &&
          !sakura?.hasAttribute("data-excluded")
        );
      });
      expect(sakura!.hasAttribute("data-active")).toBe(false);
      expect(sakura!.hasAttribute("data-excluded")).toBe(false);

      // Click once more: should cycle from unset -> include.
      act(() => {
        sakura!.dispatchEvent(
          new MouseEvent("click", { bubbles: true }),
        );
      });

      await waitFor(() => {
        sakura = findSakuraChip();
        return sakura?.getAttribute("data-active") === "true";
      });
      expect(sakura!.getAttribute("data-active")).toBe("true");
    } finally {
      unmount();
    }
  });

  test("character filter shows in filter toggle badge from URL", async () => {
    getAnimeDetailsMock.mockResolvedValue({
      anime: { id: 10, name: "My Anime", aniListId: null },
      tags: [],
      characters: [
        { id: 5, name: "Sakura", imageCount: 3 },
      ],
      folders: [],
      folderTree: null,
      entries: [],
    });
    searchImagesByAnimeMock.mockResolvedValue({ images: [] });

    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/search?char=5&anime=10"],
    });
    try {
      // Wait for the filter toggle button to show.
      await waitFor(
        () =>
          container.querySelector("[data-testid='search-filter-toggle']") !==
          null,
      );

      const filterBtn = container.querySelector(
        "[data-testid='search-filter-toggle']",
      );

      // The filter toggle should show active filter count:
      // anime=10 + char=5 = 2 active filters.
      expect(filterBtn?.textContent).toContain("Filters (2)");

      // Open the panel to see the anime chip.
      act(() => {
        (filterBtn as HTMLElement).dispatchEvent(
          new MouseEvent("click", { bubbles: true }),
        );
      });

      // The filter panel should show the anime name chip.
      await waitFor(() =>
        (container.textContent ?? "").includes("My Anime"),
      );
    } finally {
      unmount();
    }
  });

  test("character chips show correct data-category (visual token check)", async () => {
    // This test verifies what color category the character chips resolve to.
    // The TagChip component calls tagCategoryKey(tag.category) which looks
    // up the category in TAG_CATEGORY_KEY_MAP. If "character" is not in that
    // map, the chip falls back to "uncategorized" colors.
    getAnimeDetailsMock.mockResolvedValue({
      anime: { id: 10, name: "My Anime", aniListId: null },
      tags: [],
      characters: [
        { id: 5, name: "Sakura", imageCount: 3 },
      ],
      folders: [],
      folderTree: null,
      entries: [],
    });
    searchImagesByAnimeMock.mockResolvedValue({ images: [] });

    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/search?char=5&anime=10"],
    });
    try {
      // With filters present, the collapsible panel starts collapsed.
      // Toggle it open so we can inspect the character picker.
      await waitFor(
        () =>
          container.querySelector("[data-testid='search-filter-toggle']") !== null,
      );
      const toggle = container.querySelector(
        "[data-testid='search-filter-toggle']",
      ) as HTMLElement;
      act(() => {
        toggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await waitFor(
        () =>
          container.querySelector("[data-testid='character-picker']") !== null,
      );

      const charPicker = container.querySelector(
        "[data-testid='character-picker']",
      );
      const chips = charPicker!.querySelectorAll("[data-testid='tag-chip']");
      const sakuraChip = Array.from(chips).find((el) =>
        el.textContent?.includes("Sakura"),
      ) as HTMLElement | undefined;
      expect(sakuraChip).toBeDefined();

      // Record which category token the chip resolves to. The "character"
      // key is in TAG_CATEGORY_KEY_MAP and resolves to the dedicated
      // purple color tokens (tag.character.bg / tag.character.fg).
      const category = sakuraChip!.getAttribute("data-category");
      expect(category).toBe("character");
    } finally {
      unmount();
    }
  });

  test("clicking a character chip cycles correctly with class-instance characters", async () => {
    // Use Wails-like class instances to verify the cycle still works when
    // character objects are not plain JS objects.
    getAnimeDetailsMock.mockResolvedValue({
      anime: { id: 10, name: "My Anime", aniListId: null },
      tags: [],
      characters: [
        new MockCharacterInfo({ id: 5, name: "Sakura", imageCount: 3 }),
      ],
      folders: [],
      folderTree: null,
      entries: [],
    });
    searchImagesByAnimeMock.mockResolvedValue({ images: [] });

    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/search?anime=10"],
    });
    try {
      // With anime filter present, the collapsible panel starts collapsed.
      // Toggle it open so we can inspect the character picker.
      await waitFor(
        () =>
          container.querySelector("[data-testid='search-filter-toggle']") !== null,
      );
      const toggle = container.querySelector(
        "[data-testid='search-filter-toggle']",
      ) as HTMLElement;
      act(() => {
        toggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      // Wait for the character picker to render.
      await waitFor(
        () =>
          container.querySelector("[data-testid='character-picker']") !== null,
      );

      const findSakuraChip = () => {
        const charPicker = container.querySelector(
          "[data-testid='character-picker']",
        );
        const chips = charPicker?.querySelectorAll(
          "[data-testid='tag-chip']",
        );
        return Array.from(chips ?? []).find((el) =>
          el.textContent?.includes("Sakura"),
        ) as HTMLElement | undefined;
      };

      // Initial state: chip should NOT be active (no char= in URL).
      let sakura = findSakuraChip();
      expect(sakura).toBeDefined();
      expect(sakura!.hasAttribute("data-active")).toBe(false);

      // Click once: should add to include.
      act(() => {
        sakura!.dispatchEvent(
          new MouseEvent("click", { bubbles: true }),
        );
      });

      await waitFor(() => {
        sakura = findSakuraChip();
        return sakura?.getAttribute("data-active") === "true";
      });
      expect(sakura!.getAttribute("data-active")).toBe("true");
      expect(sakura!.getAttribute("aria-pressed")).toBe("true");

      // Click again: should cycle to exclude.
      act(() => {
        sakura!.dispatchEvent(
          new MouseEvent("click", { bubbles: true }),
        );
      });

      await waitFor(() => {
        sakura = findSakuraChip();
        return sakura?.hasAttribute("data-excluded") === true;
      });
      expect(sakura!.getAttribute("data-excluded")).toBe("true");
      expect(sakura!.hasAttribute("data-active")).toBe(false);
    } finally {
      unmount();
    }
  });
});
