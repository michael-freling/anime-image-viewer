/**
 * Tests for `useAnimeImages`.
 *
 * Exercises the cache-key switch between "all images for this anime" and
 * "images filtered by entry" by confirming both variants hit distinct cache
 * slots and each calls the correct backend method.
 *
 * Backend mapping:
 *   - All anime images   -> `AnimeService.SearchImagesByAnime(animeId)`
 *   - Entry-filtered     -> `AnimeService.GetFolderImages(entryId, true)`
 *     (an entry is a folder in the anime's tree; recursive=true picks up
 *     sub-entries.)
 */
const searchImagesByAnimeMock = jest.fn();
const getFolderImagesMock = jest.fn();
jest.mock("../../src/lib/api", () => ({
  __esModule: true,
  AnimeService: {
    SearchImagesByAnime: (...args: unknown[]) =>
      searchImagesByAnimeMock(...args),
    GetFolderImages: (...args: unknown[]) => getFolderImagesMock(...args),
  },
}));

import { useAnimeImages } from "../../src/hooks/use-anime-images";
import { qk } from "../../src/lib/query-keys";
import {
  createTestQueryClient,
  renderHookWithClient,
  waitFor,
} from "../test-utils";

describe("useAnimeImages", () => {
  beforeEach(() => {
    searchImagesByAnimeMock.mockReset();
    getFolderImagesMock.mockReset();
  });

  test("fetches all-anime images when no entryId given", async () => {
    const images = [{ id: 1, name: "a.png", path: "a.png" }];
    searchImagesByAnimeMock.mockResolvedValue({ images });
    const { result, unmount } = renderHookWithClient(() =>
      useAnimeImages(4),
    );
    await waitFor(() => result.current.isSuccess);
    expect(searchImagesByAnimeMock).toHaveBeenCalledWith(4);
    expect(getFolderImagesMock).not.toHaveBeenCalled();
    expect(result.current.data).toEqual(images);
    unmount();
  });

  test("fetches entry-filtered images when entryId is provided", async () => {
    const images = [{ id: 2, name: "b.png", path: "b.png" }];
    getFolderImagesMock.mockResolvedValue({ images });
    const { result, unmount } = renderHookWithClient(() =>
      useAnimeImages(4, 7),
    );
    await waitFor(() => result.current.isSuccess);
    // Entry id is treated as a folder id; recursive=true so sub-entries
    // contribute their images too.
    expect(getFolderImagesMock).toHaveBeenCalledWith(7, true);
    expect(searchImagesByAnimeMock).not.toHaveBeenCalled();
    expect(result.current.data).toEqual(images);
    unmount();
  });

  test("uses distinct cache keys for different entryIds", async () => {
    const client = createTestQueryClient();
    searchImagesByAnimeMock.mockResolvedValue({ images: [] });
    getFolderImagesMock.mockResolvedValue({ images: [] });

    const all = renderHookWithClient(() => useAnimeImages(4), { client });
    await waitFor(() => all.result.current.isSuccess);
    all.unmount();

    const byEntry = renderHookWithClient(() => useAnimeImages(4, 3), {
      client,
    });
    await waitFor(() => byEntry.result.current.isSuccess);
    byEntry.unmount();

    // Both buckets should exist and be independent.
    expect(client.getQueryData(qk.anime.images(4))).toBeDefined();
    expect(client.getQueryData(qk.anime.images(4, 3))).toBeDefined();
    expect(qk.anime.images(4, 3)).not.toEqual(qk.anime.images(4));
  });

  test("disabled for non-positive animeId", async () => {
    const { result, unmount } = renderHookWithClient(() =>
      useAnimeImages(0),
    );
    expect(result.current.fetchStatus).toBe("idle");
    expect(searchImagesByAnimeMock).not.toHaveBeenCalled();
    expect(getFolderImagesMock).not.toHaveBeenCalled();
    unmount();
  });
});
