/**
 * Tests for `useAnimeDetail`.
 *
 * Asserts the `enabled` gate (no fetch for non-positive ids) and that the
 * fetcher's return value is surfaced to `result.current.data` once resolved.
 */
const getAnimeDetailsMock = jest.fn();
jest.mock("../../src/lib/api", () => ({
  __esModule: true,
  AnimeService: {
    GetAnimeDetails: (...args: unknown[]) => getAnimeDetailsMock(...args),
  },
}));

import { useAnimeDetail } from "../../src/hooks/use-anime-detail";
import { renderHookWithClient, waitFor, flushPromises } from "../test-utils";

describe("useAnimeDetail", () => {
  beforeEach(() => {
    getAnimeDetailsMock.mockReset();
  });

  test("is disabled when animeId is 0", async () => {
    const { result, unmount } = renderHookWithClient(() => useAnimeDetail(0));
    await flushPromises();
    expect(getAnimeDetailsMock).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe("idle");
    unmount();
  });

  test("is disabled when animeId is negative", async () => {
    const { result, unmount } = renderHookWithClient(() => useAnimeDetail(-5));
    await flushPromises();
    expect(getAnimeDetailsMock).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe("idle");
    unmount();
  });

  test("is disabled when animeId is a fractional number", async () => {
    const { result, unmount } = renderHookWithClient(() =>
      useAnimeDetail(1.5),
    );
    await flushPromises();
    expect(getAnimeDetailsMock).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe("idle");
    unmount();
  });

  test("fetches when animeId is a positive integer", async () => {
    const payload = {
      anime: { id: 9, name: "Bebop", aniListId: null },
      tags: [],
      folders: [],
      folderTree: null,
      entries: [],
    };
    getAnimeDetailsMock.mockResolvedValue(payload);

    const { result, unmount } = renderHookWithClient(() => useAnimeDetail(9));
    await waitFor(() => result.current.isSuccess);
    expect(getAnimeDetailsMock).toHaveBeenCalledWith(9);
    expect(result.current.data).toEqual(payload);
    unmount();
  });
});
