/**
 * Tests for `useAnimeImages`.
 *
 * Exercises the cache-key switch between "all images for this anime" and
 * "images filtered by entry" by confirming both variants hit distinct cache
 * slots and each calls the correct backend method.
 */
const getAnimeImagesMock = jest.fn();
const getAnimeImagesByEntryMock = jest.fn();
jest.mock("../../src/lib/api", () => ({
  __esModule: true,
  AnimeService: {
    GetAnimeImages: (...args: unknown[]) => getAnimeImagesMock(...args),
    GetAnimeImagesByEntry: (...args: unknown[]) =>
      getAnimeImagesByEntryMock(...args),
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
    getAnimeImagesMock.mockReset();
    getAnimeImagesByEntryMock.mockReset();
  });

  test("fetches all-anime images when no entryId given", async () => {
    const images = [{ id: 1, name: "a.png", path: "a.png" }];
    getAnimeImagesMock.mockResolvedValue({ images });
    const { result, unmount } = renderHookWithClient(() =>
      useAnimeImages(4),
    );
    await waitFor(() => result.current.isSuccess);
    expect(getAnimeImagesMock).toHaveBeenCalledWith(4);
    expect(getAnimeImagesByEntryMock).not.toHaveBeenCalled();
    expect(result.current.data).toEqual(images);
    unmount();
  });

  test("fetches entry-filtered images when entryId is provided", async () => {
    const images = [{ id: 2, name: "b.png", path: "b.png" }];
    getAnimeImagesByEntryMock.mockResolvedValue({ images });
    const { result, unmount } = renderHookWithClient(() =>
      useAnimeImages(4, 7),
    );
    await waitFor(() => result.current.isSuccess);
    expect(getAnimeImagesByEntryMock).toHaveBeenCalledWith(4, 7);
    expect(getAnimeImagesMock).not.toHaveBeenCalled();
    expect(result.current.data).toEqual(images);
    unmount();
  });

  test("uses distinct cache keys for different entryIds", async () => {
    const client = createTestQueryClient();
    getAnimeImagesMock.mockResolvedValue({ images: [] });
    getAnimeImagesByEntryMock.mockResolvedValue({ images: [] });

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
    expect(getAnimeImagesMock).not.toHaveBeenCalled();
    unmount();
  });
});
