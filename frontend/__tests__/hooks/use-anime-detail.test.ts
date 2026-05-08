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
      seasons: [],
    };
    getAnimeDetailsMock.mockResolvedValue(payload);

    const { result, unmount } = renderHookWithClient(() => useAnimeDetail(9));
    await waitFor(() => result.current.isSuccess);
    expect(getAnimeDetailsMock).toHaveBeenCalledWith(9);
    expect(result.current.data).toEqual({ ...payload, seasons: [] });
    unmount();
  });

  test("normalises season payloads — unknown seasonType falls back to 'other'", async () => {
    getAnimeDetailsMock.mockResolvedValue({
      anime: { id: 1, name: "X", aniListId: null },
      tags: [],
      folders: [],
      folderTree: null,
      seasons: [
        // seasonType: "specials" is NOT in the union -> narrows to "other".
        { id: 1, name: "Specials", seasonType: "specials", imageCount: 0 },
        // seasonType missing -> "other".
        { id: 2, name: "No type", imageCount: 0 },
        // legacy `type` field is honoured for backward compat.
        { id: 3, name: "Movie", type: "movie", imageCount: 0 },
      ],
    });
    const { result, unmount } = renderHookWithClient(() => useAnimeDetail(1));
    await waitFor(() => result.current.isSuccess);
    const seasons = result.current.data!.seasons;
    expect(seasons.map((s) => s.type)).toEqual(["other", "other", "movie"]);
    unmount();
  });

  test("seasons default to safe defaults when individual fields are missing", async () => {
    getAnimeDetailsMock.mockResolvedValue({
      anime: { id: 1, name: "X", aniListId: null },
      tags: [],
      folders: [],
      folderTree: null,
      seasons: [
        // Almost everything missing — mapSeason should fill in defaults.
        {},
      ],
    });
    const { result, unmount } = renderHookWithClient(() => useAnimeDetail(1));
    await waitFor(() => result.current.isSuccess);
    const season = result.current.data!.seasons[0];
    expect(season.id).toBe(0);
    expect(season.name).toBe("");
    expect(season.type).toBe("other");
    expect(season.seasonNumber).toBeNull();
    expect(season.airingSeason).toBe("");
    expect(season.airingYear).toBeNull();
    expect(season.imageCount).toBe(0);
    expect(season.children).toEqual([]);
    unmount();
  });

  test("seasons with a non-array children field are mapped to []", async () => {
    getAnimeDetailsMock.mockResolvedValue({
      anime: { id: 1, name: "X", aniListId: null },
      tags: [],
      folders: [],
      folderTree: null,
      seasons: [
        // children: null -> empty array, not a crash.
        { id: 1, name: "S1", seasonType: "season", children: null },
      ],
    });
    const { result, unmount } = renderHookWithClient(() => useAnimeDetail(1));
    await waitFor(() => result.current.isSuccess);
    expect(result.current.data!.seasons[0].children).toEqual([]);
    unmount();
  });

  test("nested children are recursively mapped with the same defaults", async () => {
    getAnimeDetailsMock.mockResolvedValue({
      anime: { id: 1, name: "X", aniListId: null },
      tags: [],
      folders: [],
      folderTree: null,
      seasons: [
        {
          id: 1,
          name: "S1",
          seasonType: "season",
          imageCount: 5,
          children: [
            { id: 2, name: "S1 Part 2", seasonType: "season", imageCount: 1 },
          ],
        },
      ],
    });
    const { result, unmount } = renderHookWithClient(() => useAnimeDetail(1));
    await waitFor(() => result.current.isSuccess);
    const child = result.current.data!.seasons[0].children[0];
    expect(child.id).toBe(2);
    expect(child.type).toBe("season");
    unmount();
  });

  test("seasons field that is not an array yields []", async () => {
    getAnimeDetailsMock.mockResolvedValue({
      anime: { id: 1, name: "X", aniListId: null },
      tags: [],
      folders: [],
      folderTree: null,
      seasons: null,
    });
    const { result, unmount } = renderHookWithClient(() => useAnimeDetail(1));
    await waitFor(() => result.current.isSuccess);
    expect(result.current.data!.seasons).toEqual([]);
    unmount();
  });
});
