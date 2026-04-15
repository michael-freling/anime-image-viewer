/**
 * Tests for `useSearchImages`.
 *
 * Verifies key stability (tag arrays in different orders share a cache slot),
 * `placeholderData: keepPreviousData` semantics (the old data is visible
 * while the new query loads), and that the hook routes to the correct Wails
 * endpoint based on the filter shape:
 *   - anime-only filter   -> `AnimeService.SearchImagesByAnime(animeId)`
 *   - include-tag filter  -> `SearchService.SearchImages({ tagId })`
 *   - empty filter        -> short-circuit to []
 */
const searchImagesMock = jest.fn();
const searchImagesByAnimeMock = jest.fn();
jest.mock("../../src/lib/api", () => ({
  __esModule: true,
  SearchService: {
    SearchImages: (...args: unknown[]) => searchImagesMock(...args),
  },
  AnimeService: {
    SearchImagesByAnime: (...args: unknown[]) =>
      searchImagesByAnimeMock(...args),
  },
}));

import { useSearchImages } from "../../src/hooks/use-search-images";
import { qk } from "../../src/lib/query-keys";
import {
  createTestQueryClient,
  renderHookWithClient,
  waitFor,
} from "../test-utils";
import type { SearchFilters } from "../../src/types";

describe("useSearchImages", () => {
  beforeEach(() => {
    searchImagesMock.mockReset();
    searchImagesByAnimeMock.mockReset();
  });

  test("fetches by tag when includeTagIds are provided", async () => {
    searchImagesMock.mockResolvedValue({
      images: [{ id: 1, name: "a", path: "a" }],
    });
    const filters: SearchFilters = {
      includeTagIds: [1, 2],
      excludeTagIds: [],
      sort: "recent",
    };
    const { result, unmount } = renderHookWithClient(() =>
      useSearchImages(filters),
    );
    await waitFor(() => result.current.isSuccess);
    // First include tag drives the backend call (extra tags filtered client
    // side once the tag-map join is wired in).
    expect(searchImagesMock).toHaveBeenCalledWith({ tagId: 1 });
    expect(result.current.data).toHaveLength(1);
    unmount();
  });

  test("fetches anime-scoped images when only animeId is set", async () => {
    searchImagesByAnimeMock.mockResolvedValue({
      images: [{ id: 9, name: "x", path: "x" }],
    });
    const filters: SearchFilters = { animeId: 7 };
    const { result, unmount } = renderHookWithClient(() =>
      useSearchImages(filters),
    );
    await waitFor(() => result.current.isSuccess);
    expect(searchImagesByAnimeMock).toHaveBeenCalledWith(7);
    expect(searchImagesMock).not.toHaveBeenCalled();
    expect(result.current.data?.[0]?.id).toBe(9);
    unmount();
  });

  test("returns empty when no anime anchor and no include tags", async () => {
    const filters: SearchFilters = { excludeTagIds: [3] };
    const { result, unmount } = renderHookWithClient(() =>
      useSearchImages(filters),
    );
    await waitFor(() => result.current.isSuccess);
    expect(result.current.data).toEqual([]);
    expect(searchImagesMock).not.toHaveBeenCalled();
    expect(searchImagesByAnimeMock).not.toHaveBeenCalled();
    unmount();
  });

  test("key is stable when tag arrays are reordered", async () => {
    const client = createTestQueryClient();
    searchImagesMock.mockResolvedValue({ images: [] });
    const a: SearchFilters = {
      includeTagIds: [3, 1, 2],
      excludeTagIds: [5, 4],
    };
    const b: SearchFilters = {
      includeTagIds: [1, 2, 3],
      excludeTagIds: [4, 5],
    };

    const first = renderHookWithClient(() => useSearchImages(a), { client });
    await waitFor(() => first.result.current.isSuccess);
    first.unmount();

    const second = renderHookWithClient(() => useSearchImages(b), { client });
    // Second mount reuses the cached entry from the first — no additional call.
    expect(searchImagesMock).toHaveBeenCalledTimes(1);
    // Keys match when stabilised.
    expect(qk.search(a)).toEqual(qk.search(b));
    second.unmount();
  });

  test("keepPreviousData keeps old data visible while new query loads", async () => {
    const client = createTestQueryClient();
    // First filter resolves with data; the same observer then re-renders with
    // a new filter whose fetcher never resolves. `placeholderData:
    // keepPreviousData` should keep the old data visible while loading.
    searchImagesByAnimeMock.mockResolvedValue({
      images: [{ id: 1, name: "old", path: "old" }],
    });
    let currentFilters: SearchFilters = { animeId: 1 };
    const hook = renderHookWithClient(() => useSearchImages(currentFilters), {
      client,
    });
    await waitFor(() => hook.result.current.isSuccess);
    expect(hook.result.current.data?.[0]?.name).toBe("old");

    // Swap the closure's filters and re-render the same observer. The new
    // query key triggers a new fetch — but keepPreviousData keeps showing
    // the previous result while the new one is pending.
    let resolveSecond: (v: { images: unknown[] }) => void = () => undefined;
    searchImagesByAnimeMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSecond = resolve;
        }),
    );
    currentFilters = { animeId: 2 };
    hook.rerender();
    expect(hook.result.current.data?.[0]?.name).toBe("old");
    expect(hook.result.current.isPlaceholderData).toBe(true);
    resolveSecond({ images: [{ id: 2, name: "new", path: "new" }] });
    await waitFor(() => hook.result.current.data?.[0]?.name === "new");
    expect(hook.result.current.isPlaceholderData).toBe(false);
    hook.unmount();
  });
});
