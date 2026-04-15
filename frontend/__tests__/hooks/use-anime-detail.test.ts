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

  test("normalises entry payloads — unknown entryType falls back to 'other'", async () => {
    getAnimeDetailsMock.mockResolvedValue({
      anime: { id: 1, name: "X", aniListId: null },
      tags: [],
      folders: [],
      folderTree: null,
      entries: [
        // entryType: "specials" is NOT in the union → narrows to "other".
        { id: 1, name: "Specials", entryType: "specials", imageCount: 0 },
        // entryType missing → "other".
        { id: 2, name: "No type", imageCount: 0 },
        // legacy `type` field is honoured for backward compat.
        { id: 3, name: "Movie", type: "movie", imageCount: 0 },
      ],
    });
    const { result, unmount } = renderHookWithClient(() => useAnimeDetail(1));
    await waitFor(() => result.current.isSuccess);
    const entries = result.current.data!.entries;
    expect(entries.map((e) => e.type)).toEqual(["other", "other", "movie"]);
    unmount();
  });

  test("entries default to safe defaults when individual fields are missing", async () => {
    getAnimeDetailsMock.mockResolvedValue({
      anime: { id: 1, name: "X", aniListId: null },
      tags: [],
      folders: [],
      folderTree: null,
      entries: [
        // Almost everything missing — mapEntry should fill in defaults.
        {},
      ],
    });
    const { result, unmount } = renderHookWithClient(() => useAnimeDetail(1));
    await waitFor(() => result.current.isSuccess);
    const entry = result.current.data!.entries[0];
    expect(entry.id).toBe(0);
    expect(entry.name).toBe("");
    expect(entry.type).toBe("other");
    expect(entry.entryNumber).toBeNull();
    expect(entry.airingSeason).toBe("");
    expect(entry.airingYear).toBeNull();
    expect(entry.imageCount).toBe(0);
    expect(entry.children).toEqual([]);
    unmount();
  });

  test("entries with a non-array children field are mapped to []", async () => {
    getAnimeDetailsMock.mockResolvedValue({
      anime: { id: 1, name: "X", aniListId: null },
      tags: [],
      folders: [],
      folderTree: null,
      entries: [
        // children: null → empty array, not a crash.
        { id: 1, name: "S1", entryType: "season", children: null },
      ],
    });
    const { result, unmount } = renderHookWithClient(() => useAnimeDetail(1));
    await waitFor(() => result.current.isSuccess);
    expect(result.current.data!.entries[0].children).toEqual([]);
    unmount();
  });

  test("nested children are recursively mapped with the same defaults", async () => {
    getAnimeDetailsMock.mockResolvedValue({
      anime: { id: 1, name: "X", aniListId: null },
      tags: [],
      folders: [],
      folderTree: null,
      entries: [
        {
          id: 1,
          name: "S1",
          entryType: "season",
          imageCount: 5,
          children: [
            // Child uses the legacy `type` instead of `entryType`.
            { id: 2, name: "S1 Part 2", type: "season", imageCount: 1 },
          ],
        },
      ],
    });
    const { result, unmount } = renderHookWithClient(() => useAnimeDetail(1));
    await waitFor(() => result.current.isSuccess);
    const child = result.current.data!.entries[0].children[0];
    expect(child.id).toBe(2);
    expect(child.type).toBe("season");
    unmount();
  });

  test("entries field that is not an array yields []", async () => {
    getAnimeDetailsMock.mockResolvedValue({
      anime: { id: 1, name: "X", aniListId: null },
      tags: [],
      folders: [],
      folderTree: null,
      // entries is null on the wire — treat as empty.
      entries: null,
    });
    const { result, unmount } = renderHookWithClient(() => useAnimeDetail(1));
    await waitFor(() => result.current.isSuccess);
    expect(result.current.data!.entries).toEqual([]);
    unmount();
  });
});
