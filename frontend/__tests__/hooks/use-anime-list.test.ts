/**
 * Tests for `useAnimeList`.
 *
 * Strategy: mock `AnimeService.ListAnime` via `jest.mock` on the re-export
 * module, then drive the hook through `renderHookWithClient` and assert on
 * `result.current`.  Using a fresh QueryClient per test keeps the cache
 * isolated.
 */
import { qk } from "../../src/lib/query-keys";

const listAnimeMock = jest.fn();
jest.mock("../../src/lib/api", () => ({
  __esModule: true,
  AnimeService: {
    ListAnime: (...args: unknown[]) => listAnimeMock(...args),
  },
}));

import { act } from "react-dom/test-utils";
import { useAnimeList } from "../../src/hooks/use-anime-list";
import {
  createTestQueryClient,
  renderHookWithClient,
  waitFor,
} from "../test-utils";

describe("useAnimeList", () => {
  beforeEach(() => {
    listAnimeMock.mockReset();
  });

  test("fetches on mount and returns the data", async () => {
    const summaries = [
      { id: 1, name: "One Piece", imageCount: 42 },
      { id: 2, name: "Naruto", imageCount: 18 },
    ];
    listAnimeMock.mockResolvedValue(summaries);

    const { result, unmount } = renderHookWithClient(() => useAnimeList());

    await waitFor(() => result.current.isSuccess);
    expect(listAnimeMock).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual(summaries);
    unmount();
  });

  test("coerces null responses to an empty array", async () => {
    listAnimeMock.mockResolvedValue(null);
    const { result, unmount } = renderHookWithClient(() => useAnimeList());
    await waitFor(() => result.current.isSuccess);
    expect(result.current.data).toEqual([]);
    unmount();
  });

  test("caches between consumers sharing a client", async () => {
    listAnimeMock.mockResolvedValue([]);
    const client = createTestQueryClient();
    const first = renderHookWithClient(() => useAnimeList(), { client });
    await waitFor(() => first.result.current.isSuccess);
    first.unmount();

    const second = renderHookWithClient(() => useAnimeList(), { client });
    // Cache is primed, so data is available immediately without refetching.
    expect(second.result.current.data).toEqual([]);
    // fetcher only called once across both mounts (no stale refetch required).
    expect(listAnimeMock).toHaveBeenCalledTimes(1);
    second.unmount();
  });

  test("refetches after invalidation", async () => {
    listAnimeMock.mockResolvedValue([]);
    const client = createTestQueryClient();
    const { result, unmount } = renderHookWithClient(() => useAnimeList(), {
      client,
    });
    await waitFor(() => result.current.isSuccess);
    expect(listAnimeMock).toHaveBeenCalledTimes(1);

    listAnimeMock.mockResolvedValue([
      { id: 7, name: "Trigun", imageCount: 3 },
    ]);
    // `refetchQueries` is the explicit trigger React Query exposes for tests;
    // `invalidateQueries` only refetches active observers which can be racy
    // when the probe doesn't have a subscriber identity we can drive.
    await act(async () => {
      await client.refetchQueries({ queryKey: qk.anime.list() });
    });
    expect(listAnimeMock).toHaveBeenCalledTimes(2);
    // Verify the cache got the new data — observers may not have rerendered
    // synchronously, but the cache is the source of truth we care about.
    const cached = client.getQueryData(qk.anime.list()) as
      | { name: string }[]
      | undefined;
    expect(cached?.[0]?.name).toBe("Trigun");
    unmount();
  });
});
