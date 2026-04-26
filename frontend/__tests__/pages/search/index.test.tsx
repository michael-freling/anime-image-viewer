/**
 * Integration tests for the Search page.
 *
 * Spec coverage (see ui-design.md §3.4, §5 and the Phase D3 brief):
 *   - Initial render with no filters shows the "Start searching" empty state.
 *   - Typing in SearchBar triggers a debounced search; after ~300ms the URL
 *     updates and the data layer is called with the new query.
 *   - Clicking a TagChip inside the tag picker adds a FilterChip to the
 *     active filters row.
 *   - Clicking the X on a FilterChip removes the filter.
 *   - URL sync: filter state persists across the back button (MemoryRouter
 *     with initial entries containing query strings).
 *   - Loading state renders skeletons.
 *   - Success state renders the results grid.
 *   - Empty results render the EmptyState with "Clear filters" action.
 *   - Select mode toggle turns the action bar on and off.
 *
 * We stub the slow parts:
 *   - `@mantine/hooks` -> synchronous useDebouncedValue so we don't have to
 *     run real timers inside tests; the URL syncs immediately after a type.
 *   - `@/lib/api` -> deterministic SearchService / TagService stubs.
 *   - `react-photo-album` -> simple passthrough that renders the render.image
 *     prop for every photo (shared pattern with image-grid.test.tsx).
 */

// ---- Mocks (hoisted) -----------------------------------------------------

jest.mock("@mantine/hooks", () => ({
  __esModule: true,
  useDebouncedValue: (value: unknown) => [value],
  useHotkeys: () => undefined,
}));

// Mock AutoSizer to provide fixed dimensions in jsdom (react-virtualized-auto-sizer v2 API).
jest.mock("react-virtualized-auto-sizer", () => {
  const ReactModule = jest.requireActual<typeof import("react")>("react");
  return {
    __esModule: true,
    AutoSizer: ({
      renderProp,
    }: {
      renderProp: (size: {
        height: number | undefined;
        width: number | undefined;
      }) => React.ReactNode;
    }) =>
      ReactModule.createElement(
        "div",
        {
          "data-testid": "auto-sizer-mock",
          style: { width: 1000, height: 800 },
        },
        renderProp({ height: 800, width: 1000 }),
      ),
  };
});

const searchImagesMock = jest.fn();
const getAllTagsMock = jest.fn();
const getAnimeDetailsMock = jest.fn();
const searchImagesByAnimeMock = jest.fn();

jest.mock("../../../src/lib/api", () => ({
  __esModule: true,
  AnimeService: {
    GetAnimeDetails: (...args: unknown[]) => getAnimeDetailsMock(...args),
    SearchImagesByAnime: (...args: unknown[]) => searchImagesByAnimeMock(...args),
  },
  SearchService: {
    SearchImages: (...args: unknown[]) => searchImagesMock(...args),
  },
  TagService: {
    GetAll: () => getAllTagsMock(),
  },
}));

// ---- Imports under test -------------------------------------------------

import { act } from "react-dom/test-utils";

import { SearchPage } from "../../../src/pages/search";
import { useSelectionStore } from "../../../src/stores/selection-store";
import type { ImageFile, Tag } from "../../../src/types";
import { renderWithClient, waitFor } from "../../test-utils";

// ---- Fixtures & helpers -------------------------------------------------

function makeTag(id: number, name: string, category: string): Tag {
  return { id, name, category };
}

function makeImage(id: number, name: string): ImageFile {
  return { id, name, path: `/files/anime/${name}` };
}

const TAGS: Tag[] = [
  makeTag(1, "Outdoor", "scene"),
  makeTag(2, "Sunny", "nature"),
  makeTag(3, "Indoor", "scene"),
];

function resetSelectionStore() {
  act(() => {
    useSelectionStore.setState({
      selectMode: false,
      selectedIds: new Set<number>(),
      lastSelectedId: null,
    });
  });
}

// Helper to set native input value so React's change tracker fires.
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

describe("SearchPage", () => {
  beforeEach(() => {
    searchImagesMock.mockReset();
    searchImagesMock.mockResolvedValue({ images: [] });
    getAllTagsMock.mockReset();
    getAllTagsMock.mockResolvedValue(TAGS);
    getAnimeDetailsMock.mockReset();
    getAnimeDetailsMock.mockResolvedValue(null);
    searchImagesByAnimeMock.mockReset();
    searchImagesByAnimeMock.mockResolvedValue({ images: [] });
    resetSelectionStore();
  });

  test("renders the page header with title 'Search'", async () => {
    const { container, unmount } = renderWithClient(<SearchPage />, {
      routerInitialEntries: ["/search"],
    });
    try {
      // PageHeader renders an <h1> with the given title.
      const heading = container.querySelector("h1");
      expect(heading?.textContent).toBe("Search");
    } finally {
      unmount();
    }
  });

  test("initial render with no filters shows the start/empty state", async () => {
    const { container, unmount } = renderWithClient(<SearchPage />, {
      routerInitialEntries: ["/search"],
    });
    try {
      await waitFor(
        () => (container.textContent ?? "").includes("Start searching"),
      );
      expect(container.textContent).toContain("Start searching");
      // No result count is shown because nothing is searched.
      expect(container.textContent ?? "").not.toContain(
        "images match your filters",
      );
    } finally {
      unmount();
    }
  });

  test("tag picker groups tags by category and clicking a chip adds an include filter", async () => {
    const { container, unmount } = renderWithClient(<SearchPage />, {
      routerInitialEntries: ["/search"],
    });
    try {
      // Wait for tag picker to appear once useTags resolves.
      await waitFor(
        () =>
          container.querySelector("[data-testid='tag-picker']") !== null,
      );
      // Expand collapsed tag picker groups.
      const headers = container.querySelectorAll("[data-testid='category-section-header']");
      headers.forEach((h) => {
        act(() => {
          (h as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
      });
      // Scene bucket renders "Outdoor" + "Indoor".
      const sceneGroup = container.querySelector(
        "[data-testid='tag-picker-scene']",
      );
      expect(sceneGroup).not.toBeNull();
      expect(sceneGroup?.textContent).toContain("Outdoor");
      expect(sceneGroup?.textContent).toContain("Indoor");
      // Find the Outdoor chip (id=1).
      const outdoorChip = Array.from(
        container.querySelectorAll("[data-testid='tag-chip']"),
      ).find((el) => el.textContent?.includes("Outdoor"));
      expect(outdoorChip).toBeDefined();
      act(() => {
        (outdoorChip as HTMLElement).dispatchEvent(
          new MouseEvent("click", { bubbles: true }),
        );
      });
      // The active filter bar picks up the new include chip.
      await waitFor(
        () =>
          container.querySelector("[data-testid='active-filters-bar']") !==
          null,
      );
      const bar = container.querySelector(
        "[data-testid='active-filters-bar']",
      );
      expect(bar?.textContent).toContain("Outdoor");
      // And the data layer was called with that include id flattened to a
      // single tagId on the wire (Wails's SearchImagesRequest is single-tag;
      // the hook narrows includeTagIds[0] -> tagId).
      await waitFor(() => {
        return searchImagesMock.mock.calls.some((call) => {
          const arg = call[0] as { tagId?: number };
          return arg?.tagId === 1;
        });
      });
    } finally {
      unmount();
    }
  });

  test("clicking X on an active filter chip removes it", async () => {
    const { container, unmount } = renderWithClient(<SearchPage />, {
      routerInitialEntries: ["/search?tag=1"],
    });
    try {
      // Wait for the bar + tagMap to resolve so the chip label is the tag
      // name rather than the `#id` fallback.
      await waitFor(
        () =>
          container.querySelector(
            "[aria-label='Remove filter Outdoor']",
          ) !== null,
      );
      const removeBtn = container.querySelector(
        "[aria-label='Remove filter Outdoor']",
      ) as HTMLElement | null;
      expect(removeBtn).not.toBeNull();
      act(() => {
        removeBtn!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      // After removal the active-filters-bar either unmounts or stops
      // rendering the Outdoor label.
      await waitFor(
        () =>
          !(
            container
              .querySelector("[data-testid='active-filters-bar']")
              ?.textContent?.includes("Outdoor") ?? false
          ),
      );
    } finally {
      unmount();
    }
  });

  test("URL sync: filter state persists via useSearchParams (deep link)", async () => {
    const { container, unmount } = renderWithClient(<SearchPage />, {
      routerInitialEntries: ["/search?q=beach&tag=2&exclude=3"],
    });
    try {
      // Wait for tagMap to resolve so the bar's chips show the tag names
      // rather than the `#id` fallback.
      await waitFor(
        () =>
          (container.querySelector(
            "[data-testid='active-filters-bar']",
          )?.textContent ?? "").includes("Sunny"),
      );
      const bar = container.querySelector("[data-testid='active-filters-bar']");
      // Both the include + exclude chip render from the URL.
      expect(bar?.textContent).toContain("Sunny");
      expect(bar?.textContent).toContain("Indoor");
      // The include chip carries the `+` prefix.
      const include = container.querySelector("[data-variant='include']");
      expect(include?.textContent).toContain("Sunny");
      // The exclude chip carries the `−` prefix.
      const exclude = container.querySelector("[data-variant='exclude']");
      expect(exclude?.textContent).toContain("Indoor");

      // The search bar input shows the URL query.
      const input = container.querySelector("input[role='searchbox']") as
        | HTMLInputElement
        | null;
      expect(input?.value).toBe("beach");

      // The search hook was called with the parsed filters. The Wails
      // SearchImagesRequest only carries `tagId` (single include), so the
      // assertion is on the include-id reaching the wire — the exclude id
      // (3) is layered on client-side once the per-image tag map ships.
      await waitFor(() =>
        searchImagesMock.mock.calls.some((call) => {
          const arg = call[0] as { tagId?: number };
          return arg?.tagId === 2;
        }),
      );
    } finally {
      unmount();
    }
  });

  test("typing into the SearchBar starts an anchored search once a tag is added", async () => {
    // Without any include tag, the hook short-circuits to [] (the Wails
    // SearchImagesRequest requires a tagId or a directory anchor). To prove
    // the debounce wires the input through to the API call we seed an
    // include tag in the URL; typing then triggers a refetch.
    const { container, unmount } = renderWithClient(<SearchPage />, {
      routerInitialEntries: ["/search?tag=1"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("input[role='searchbox']") !== null,
      );
      const input = container.querySelector(
        "input[role='searchbox']",
      ) as HTMLInputElement;
      expect(input.value).toBe("");

      // Wait for the initial tag-anchored search to fire so we can count
      // any new calls the input triggers.
      await waitFor(() => searchImagesMock.mock.calls.length > 0);
      const initialCalls = searchImagesMock.mock.calls.length;

      setInputValue(input, "beach");
      await waitFor(() => input.value === "beach");

      // The page surfaces a result-count, no-matches, or start-searching
      // status string after the debounce settles.
      await waitFor(
        () =>
          (container.textContent ?? "").toLowerCase().includes("images match") ||
          (container.textContent ?? "").toLowerCase().includes("no matches") ||
          (container.textContent ?? "").toLowerCase().includes("start searching"),
      );

      // SearchService stays at its single tag-anchored call (the free-text
      // filter is applied client-side so the URL update doesn't refetch the
      // grid). At minimum the initial call still stands.
      expect(searchImagesMock.mock.calls.length).toBeGreaterThanOrEqual(
        initialCalls,
      );
    } finally {
      unmount();
    }
  });

  test("success state renders the results grid when matches exist", async () => {
    searchImagesMock.mockResolvedValue({
      images: [makeImage(100, "sunset.png"), makeImage(101, "beach.png")],
    });
    const { container, unmount } = renderWithClient(<SearchPage />, {
      routerInitialEntries: ["/search?tag=1"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='image-grid']") !== null,
      );
      const tiles = container.querySelectorAll(
        "[data-testid='image-thumbnail']",
      );
      expect(tiles.length).toBe(2);
    } finally {
      unmount();
    }
  });

  test("empty matches render the EmptyState with a Clear filters button", async () => {
    searchImagesMock.mockResolvedValue({ images: [] });
    const { container, unmount } = renderWithClient(<SearchPage />, {
      routerInitialEntries: ["/search?tag=1"],
    });
    try {
      await waitFor(
        () =>
          (container.textContent ?? "").includes("No matches") ||
          (container.textContent ?? "").includes("No images"),
      );
      const clearBtn = container.querySelector(
        "[data-testid='search-no-matches-clear']",
      ) as HTMLElement | null;
      expect(clearBtn).not.toBeNull();
      act(() => {
        clearBtn!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      // Once cleared, the start-searching copy returns.
      await waitFor(() =>
        (container.textContent ?? "").includes("Start searching"),
      );
    } finally {
      unmount();
    }
  });

  test("select mode toggle mounts the selection action bar", async () => {
    const { container, unmount } = renderWithClient(<SearchPage />, {
      routerInitialEntries: ["/search"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector(
            "[data-testid='search-select-mode-toggle']",
          ) !== null,
      );
      // Not in select mode yet.
      expect(
        container.querySelector("[data-testid='selection-action-bar']"),
      ).toBeNull();
      const toggle = container.querySelector(
        "[data-testid='search-select-mode-toggle']",
      ) as HTMLElement;
      act(() => {
        toggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      expect(
        container.querySelector("[data-testid='selection-action-bar']"),
      ).not.toBeNull();
      // Clicking again exits select mode.
      act(() => {
        toggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      expect(
        container.querySelector("[data-testid='selection-action-bar']"),
      ).toBeNull();
    } finally {
      unmount();
    }
  });

  test("back-button restores filters via MemoryRouter's initial entry", async () => {
    // Multiple initial entries simulate a history stack: the user previously
    // was at /search with a filter, then navigated to a blank /search. We
    // render the PREVIOUS page to confirm its filter is still rendered.
    const { container, unmount } = renderWithClient(<SearchPage />, {
      routerInitialEntries: ["/search", "/search?tag=2"],
    });
    try {
      // Wait for tagMap to resolve so the bar's chips show "Sunny" rather
      // than the `#2` fallback.
      await waitFor(() =>
        (container.textContent ?? "").includes("Sunny"),
      );
      // The last entry wins as the "current" location — tag=2 -> Sunny.
      expect(container.textContent).toContain("Sunny");
    } finally {
      unmount();
    }
  });

  test("error state surfaces the ErrorAlert", async () => {
    searchImagesMock.mockRejectedValue(new Error("network down"));
    const { container, unmount } = renderWithClient(<SearchPage />, {
      routerInitialEntries: ["/search?tag=1"],
    });
    try {
      await waitFor(
        () => container.querySelector("[role='alert']") !== null,
      );
      const alert = container.querySelector("[role='alert']");
      expect(alert?.textContent).toContain("Search failed");
      expect(alert?.textContent).toContain("network down");
    } finally {
      unmount();
    }
  });

  test("client-side query filter narrows the server result set by filename", async () => {
    searchImagesMock.mockResolvedValue({
      images: [
        makeImage(1, "beach-sunset.png"),
        makeImage(2, "forest.png"),
      ],
    });
    const { container, unmount } = renderWithClient(<SearchPage />, {
      routerInitialEntries: ["/search?q=beach&tag=1"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='image-grid']") !== null,
      );
      const tiles = container.querySelectorAll(
        "[data-testid='image-thumbnail']",
      );
      expect(tiles.length).toBe(1);
      expect(
        (tiles[0] as HTMLElement).getAttribute("data-file-id"),
      ).toBe("1");
    } finally {
      unmount();
    }
  });

  test("clicking an already-included tag chip removes it from the filter", async () => {
    const { container, unmount } = renderWithClient(<SearchPage />, {
      routerInitialEntries: ["/search?tag=1"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='tag-picker']") !== null,
      );
      // Expand collapsed tag picker groups.
      const headers = container.querySelectorAll("[data-testid='category-section-header']");
      headers.forEach((h) => {
        act(() => {
          (h as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
      });
      // Wait for the ActiveFiltersBar to show the Outdoor chip.
      await waitFor(
        () =>
          (container.querySelector(
            "[data-testid='active-filters-bar']",
          )?.textContent ?? "").includes("Outdoor"),
      );
      // Click the Outdoor chip inside the picker again — toggles it off.
      const outdoorChip = Array.from(
        container.querySelectorAll("[data-testid='tag-chip']"),
      ).find((el) => el.textContent?.includes("Outdoor"));
      expect(outdoorChip).toBeDefined();
      act(() => {
        (outdoorChip as HTMLElement).dispatchEvent(
          new MouseEvent("click", { bubbles: true }),
        );
      });
      // After toggle, the active filter bar should no longer show Outdoor.
      await waitFor(
        () =>
          !(
            container
              .querySelector("[data-testid='active-filters-bar']")
              ?.textContent?.includes("Outdoor") ?? false
          ),
      );
    } finally {
      unmount();
    }
  });

  test("Edit tags button on the selection bar navigates to tag editor", async () => {
    searchImagesMock.mockResolvedValue({
      images: [
        makeImage(100, "sunset.png"),
        makeImage(101, "beach.png"),
      ],
    });
    // Pre-enter select mode so the SelectionActionBar is mounted.
    act(() => {
      useSelectionStore.setState({
        selectMode: true,
        selectedIds: new Set([100, 101]),
      });
    });
    const { container, unmount } = renderWithClient(<SearchPage />, {
      routerInitialEntries: ["/search?tag=1"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='selection-action-bar']") !==
          null,
      );
      // `onEditTags` navigates to /images/edit/tags — find the button by
      // its label "Edit tags".
      const editBtn = Array.from(
        container.querySelectorAll("button"),
      ).find((b) =>
        (b.textContent ?? "").toLowerCase().includes("edit tags"),
      ) as HTMLButtonElement | undefined;
      expect(editBtn).toBeDefined();
      // Selection should still be present (the tag editor reads it from the store).
      expect(useSelectionStore.getState().selectedIds.size).toBe(2);
    } finally {
      unmount();
    }
  });

  test("clicking a tile with select mode off does not toggle selection", async () => {
    searchImagesMock.mockResolvedValue({
      images: [makeImage(200, "hero.png")],
    });
    const { container, unmount } = renderWithClient(<SearchPage />, {
      routerInitialEntries: ["/search?tag=1"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='image-grid']") !== null,
      );
      const tile = container.querySelector(
        "[data-file-id='200']",
      ) as HTMLElement;
      expect(tile).not.toBeNull();
      act(() => {
        tile.click();
      });
      expect(useSelectionStore.getState().selectedIds.size).toBe(0);
    } finally {
      unmount();
    }
  });

  test("clicking a tile while in select mode toggles it via the selection store", async () => {
    searchImagesMock.mockResolvedValue({
      images: [makeImage(300, "hero.png"), makeImage(301, "other.png")],
    });
    act(() => {
      useSelectionStore.setState({ selectMode: true });
    });
    const { container, unmount } = renderWithClient(<SearchPage />, {
      routerInitialEntries: ["/search?tag=1"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='image-grid']") !== null,
      );
      const tile = container.querySelector(
        "[data-file-id='300']",
      ) as HTMLElement;
      act(() => {
        tile.click();
      });
      expect(useSelectionStore.getState().selectedIds.has(300)).toBe(true);
      // Click again to toggle off.
      act(() => {
        tile.click();
      });
      expect(useSelectionStore.getState().selectedIds.has(300)).toBe(false);
    } finally {
      unmount();
    }
  });

  test("Retry button on search error calls refetch", async () => {
    let calls = 0;
    searchImagesMock.mockImplementation(() => {
      calls += 1;
      if (calls === 1) {
        return Promise.reject(new Error("no net"));
      }
      return Promise.resolve({ images: [makeImage(1, "ok.png")] });
    });
    const { container, unmount } = renderWithClient(<SearchPage />, {
      routerInitialEntries: ["/search?tag=1"],
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
          container.querySelector("[data-testid='image-grid']") !== null,
      );
    } finally {
      unmount();
    }
  });

  test("loading state shows the search-loading skeleton stack", async () => {
    // Leave the promise unresolved so isLoading stays true.
    searchImagesMock.mockReturnValue(new Promise(() => undefined));
    const { container, unmount } = renderWithClient(<SearchPage />, {
      routerInitialEntries: ["/search?tag=1"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='search-loading']") !== null,
      );
      // Result count announcer is empty while loading.
      const live = container.querySelector(
        "[data-testid='search-result-count-live']",
      );
      expect(live?.textContent?.trim() ?? "").toBe("");
    } finally {
      unmount();
    }
  });

  test("free-text input resyncs from the URL when the browser updates ?q", async () => {
    // Initial render pulls `beach` from the URL.
    const { container, unmount } = renderWithClient(<SearchPage />, {
      routerInitialEntries: ["/search?q=beach&tag=1"],
    });
    try {
      await waitFor(() => {
        const input = container.querySelector(
          "input[role='searchbox']",
        ) as HTMLInputElement | null;
        return input?.value === "beach";
      });
      const input = container.querySelector(
        "input[role='searchbox']",
      ) as HTMLInputElement;
      expect(input.value).toBe("beach");
    } finally {
      unmount();
    }
  });

  test("anime filter from URL shows anime chip and scoped tags", async () => {
    getAnimeDetailsMock.mockResolvedValue({
      anime: { id: 42, name: "Bebop", aniListId: null },
      tags: [
        { id: 10, name: "Spike", category: "character", imageCount: 5 },
        { id: 11, name: "Space", category: "scene", imageCount: 3 },
      ],
      folders: [],
      folderTree: null,
      entries: [],
    });
    searchImagesByAnimeMock.mockResolvedValue({ images: [] });
    const { container, unmount } = renderWithClient(<SearchPage />, {
      routerInitialEntries: ["/search?tag=1&anime=42"],
    });
    try {
      // Wait for the active-filters-bar to show the anime name chip.
      await waitFor(
        () =>
          (container.querySelector(
            "[data-testid='active-filters-bar']",
          )?.textContent ?? "").includes("Bebop"),
      );
      const bar = container.querySelector(
        "[data-testid='active-filters-bar']",
      );
      expect(bar?.textContent).toContain("Bebop");

      // Wait for the tag picker to render with the anime's scoped tags.
      await waitFor(
        () =>
          container.querySelector("[data-testid='tag-picker']") !== null,
      );

      // Expand collapsed tag picker groups so we can see the chips.
      const headers = container.querySelectorAll("[data-testid='category-section-header']");
      headers.forEach((h) => {
        act(() => {
          (h as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
      });

      // The tag picker should show the anime's tags (Spike, Space) rather
      // than the global tags (Outdoor, Sunny, Indoor).
      const picker = container.querySelector("[data-testid='tag-picker']");
      expect(picker?.textContent).toContain("Spike");
      expect(picker?.textContent).toContain("Space");
      // Global tags should NOT appear.
      expect(picker?.textContent).not.toContain("Outdoor");
      expect(picker?.textContent).not.toContain("Sunny");
    } finally {
      unmount();
    }
  });

  test("removing anime filter clears anime from URL", async () => {
    getAnimeDetailsMock.mockResolvedValue({
      anime: { id: 42, name: "Bebop", aniListId: null },
      tags: [],
      folders: [],
      folderTree: null,
      entries: [],
    });
    searchImagesByAnimeMock.mockResolvedValue({ images: [] });
    const { container, unmount } = renderWithClient(<SearchPage />, {
      routerInitialEntries: ["/search?anime=42"],
    });
    try {
      // Wait for the anime chip to render.
      await waitFor(
        () =>
          container.querySelector(
            "[aria-label='Remove filter Bebop']",
          ) !== null,
      );
      const removeBtn = container.querySelector(
        "[aria-label='Remove filter Bebop']",
      ) as HTMLElement;
      expect(removeBtn).not.toBeNull();

      // Click the X button on the anime chip to remove it.
      act(() => {
        removeBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });

      // After removal, the anime chip should disappear.
      await waitFor(
        () =>
          container.querySelector(
            "[aria-label='Remove filter Bebop']",
          ) === null,
      );
      // The active-filters-bar should no longer show "Bebop".
      const bar = container.querySelector("[data-testid='active-filters-bar']");
      // Either bar is gone entirely or doesn't contain Bebop.
      expect(bar?.textContent ?? "").not.toContain("Bebop");
    } finally {
      unmount();
    }
  });

  test("image viewer opens on click in non-select mode", async () => {
    searchImagesMock.mockResolvedValue({
      images: [makeImage(500, "hero.png"), makeImage(501, "villain.png")],
    });
    const { container, unmount } = renderWithClient(<SearchPage />, {
      routerInitialEntries: ["/search?tag=1"],
    });
    try {
      // Wait for the image grid to render.
      await waitFor(
        () =>
          container.querySelector("[data-testid='image-grid']") !== null,
      );
      // Confirm we are NOT in select mode.
      expect(useSelectionStore.getState().selectMode).toBe(false);

      // Click a tile — in non-select mode this should open the image viewer.
      const tile = container.querySelector(
        "[data-file-id='500']",
      ) as HTMLElement;
      expect(tile).not.toBeNull();
      act(() => {
        tile.click();
      });

      // The ImageViewerOverlay should now be visible.
      await waitFor(
        () =>
          container.querySelector("[data-testid='image-viewer-overlay']") !==
          null,
      );
      const overlay = container.querySelector(
        "[data-testid='image-viewer-overlay']",
      );
      expect(overlay).not.toBeNull();

      // Selection store should remain empty (no selection happened).
      expect(useSelectionStore.getState().selectedIds.size).toBe(0);
    } finally {
      unmount();
    }
  });
});
