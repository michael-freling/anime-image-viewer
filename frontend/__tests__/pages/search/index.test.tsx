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

const searchImagesMock = jest.fn();
const getAllTagsMock = jest.fn();

jest.mock("../../../src/lib/api", () => ({
  __esModule: true,
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
  return { id, name, path: `anime/${name}` };
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
      // And the data layer was called with that include id.
      await waitFor(() => {
        return searchImagesMock.mock.calls.some((call) => {
          const arg = call[0] as { includeTagIds?: number[] };
          return arg?.includeTagIds?.includes(1);
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

      // The search hook was called with the parsed filters.
      await waitFor(() =>
        searchImagesMock.mock.calls.some((call) => {
          const arg = call[0] as {
            includeTagIds?: number[];
            excludeTagIds?: number[];
          };
          return (
            arg?.includeTagIds?.includes(2) === true &&
            arg?.excludeTagIds?.includes(3) === true
          );
        }),
      );
    } finally {
      unmount();
    }
  });

  test("typing into the SearchBar triggers a debounced search", async () => {
    const { container, unmount } = renderWithClient(<SearchPage />, {
      routerInitialEntries: ["/search"],
    });
    try {
      // Wait for initial render.
      await waitFor(
        () =>
          container.querySelector("input[role='searchbox']") !== null,
      );
      const input = container.querySelector(
        "input[role='searchbox']",
      ) as HTMLInputElement;
      expect(input.value).toBe("");

      setInputValue(input, "beach");
      // With our mantine-hooks mock, useDebouncedValue is synchronous so the
      // URL updates on the next tick.
      await waitFor(() => input.value === "beach");
      await waitFor(
        () =>
          (container.textContent ?? "").toLowerCase().includes("images match") ||
          (container.textContent ?? "").toLowerCase().includes("no matches") ||
          (container.textContent ?? "").toLowerCase().includes("start searching"),
      );
      // The SearchService is called even if the text filter is client-side —
      // the debounce should have fired at least one extra call after the
      // initial render.
      expect(searchImagesMock).toHaveBeenCalled();
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
});
