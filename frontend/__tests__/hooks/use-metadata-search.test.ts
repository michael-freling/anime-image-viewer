/**
 * Tests for `useMetadataSearch`.
 *
 * Uses jest fake timers to drive `useDebouncedValue`'s 300ms delay. Asserts
 * the empty-query branch (no fetch) and that a real query fires exactly once
 * after the debounce window.
 */
const searchMetadataMock = jest.fn();
jest.mock("../../src/lib/api", () => ({
  __esModule: true,
  AnimeService: {
    SearchMetadata: (...args: unknown[]) => searchMetadataMock(...args),
  },
}));

import { act } from "react-dom/test-utils";
import { useMetadataSearch } from "../../src/hooks/use-metadata-search";
import {
  flushPromises,
  renderHookWithClient,
  waitFor,
} from "../test-utils";

describe("useMetadataSearch", () => {
  beforeEach(() => {
    searchMetadataMock.mockReset();
    jest.useFakeTimers({ doNotFake: ["nextTick"] });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("is disabled when query is empty", async () => {
    const { result, unmount } = renderHookWithClient(() =>
      useMetadataSearch(""),
    );
    // Advance past any debounce timers.
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(searchMetadataMock).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe("idle");
    unmount();
  });

  test("is disabled when query is whitespace only", async () => {
    const { result, unmount } = renderHookWithClient(() =>
      useMetadataSearch("   "),
    );
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(searchMetadataMock).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe("idle");
    unmount();
  });

  test("fires for a non-empty query and returns results", async () => {
    searchMetadataMock.mockResolvedValue([
      { id: "naruto", title: "Naruto", franchiseId: "" },
    ]);
    const { result, unmount } = renderHookWithClient(() =>
      useMetadataSearch("naruto"),
    );
    // `useDebouncedValue` seeds its internal state with the initial value, so
    // the first render triggers the fetch. Subsequent typing waits the full
    // 300ms window.
    jest.useRealTimers();
    await flushPromises();
    await waitFor(() => result.current.isSuccess);
    expect(searchMetadataMock).toHaveBeenCalledWith("naruto");
    expect(result.current.data).toHaveLength(1);
    unmount();
  });

  test("handles null result from backend", async () => {
    searchMetadataMock.mockResolvedValue(null);
    const { result, unmount } = renderHookWithClient(() =>
      useMetadataSearch("bebop"),
    );
    jest.useRealTimers();
    await flushPromises();
    await waitFor(() => result.current.isSuccess);
    expect(result.current.data).toEqual([]);
    unmount();
  });
});
