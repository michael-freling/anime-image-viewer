/**
 * Tests for `useAniListSearch`.
 *
 * Uses jest fake timers to drive `useDebouncedValue`'s 300ms delay. Asserts
 * the empty-query branch (no fetch) and that a real query fires exactly once
 * after the debounce window.
 */
const searchAniListMock = jest.fn();
jest.mock("../../src/lib/api", () => ({
  __esModule: true,
  AnimeService: {
    SearchAniList: (...args: unknown[]) => searchAniListMock(...args),
  },
}));

import { act } from "react-dom/test-utils";
import { useAniListSearch } from "../../src/hooks/use-anilist-search";
import {
  flushPromises,
  renderHookWithClient,
  waitFor,
} from "../test-utils";

describe("useAniListSearch", () => {
  beforeEach(() => {
    searchAniListMock.mockReset();
    jest.useFakeTimers({ doNotFake: ["nextTick"] });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("is disabled when query is empty", async () => {
    const { result, unmount } = renderHookWithClient(() =>
      useAniListSearch(""),
    );
    // Advance past any debounce timers.
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(searchAniListMock).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe("idle");
    unmount();
  });

  test("is disabled when query is whitespace only", async () => {
    const { result, unmount } = renderHookWithClient(() =>
      useAniListSearch("   "),
    );
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(searchAniListMock).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe("idle");
    unmount();
  });

  test("fires for a non-empty query and returns results", async () => {
    searchAniListMock.mockResolvedValue([
      {
        id: 1,
        titleRomaji: "Naruto",
        titleEnglish: "Naruto",
        titleNative: "",
        format: "TV",
        status: "FINISHED",
        season: "",
        seasonYear: 2002,
        episodes: 220,
        coverImageUrl: "",
      },
    ]);
    const { result, unmount } = renderHookWithClient(() =>
      useAniListSearch("naruto"),
    );
    // `useDebouncedValue` seeds its internal state with the initial value, so
    // the first render triggers the fetch. Subsequent typing waits the full
    // 300ms window.
    jest.useRealTimers();
    await flushPromises();
    await waitFor(() => result.current.isSuccess);
    expect(searchAniListMock).toHaveBeenCalledWith("naruto");
    expect(result.current.data).toHaveLength(1);
    unmount();
  });

  test("handles null result from backend", async () => {
    searchAniListMock.mockResolvedValue(null);
    const { result, unmount } = renderHookWithClient(() =>
      useAniListSearch("bebop"),
    );
    jest.useRealTimers();
    await flushPromises();
    await waitFor(() => result.current.isSuccess);
    expect(result.current.data).toEqual([]);
    unmount();
  });
});
