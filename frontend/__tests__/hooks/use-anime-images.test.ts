/**
 * Tests for `useAnimeImages`.
 *
 * The hook always fetches all images for the anime via
 * `AnimeService.SearchImagesByAnime(animeId)`.
 */
const searchImagesByAnimeMock = jest.fn();
jest.mock("../../src/lib/api", () => ({
  __esModule: true,
  AnimeService: {
    SearchImagesByAnime: (...args: unknown[]) =>
      searchImagesByAnimeMock(...args),
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
  });

  test("fetches all-anime images", async () => {
    const images = [{ id: 1, name: "a.png", path: "a.png" }];
    searchImagesByAnimeMock.mockResolvedValue({ images });
    const { result, unmount } = renderHookWithClient(() =>
      useAnimeImages(4),
    );
    await waitFor(() => result.current.isSuccess);
    expect(searchImagesByAnimeMock).toHaveBeenCalledWith(4);
    expect(result.current.data).toEqual(images);
    unmount();
  });

  test("uses correct cache key", async () => {
    const client = createTestQueryClient();
    searchImagesByAnimeMock.mockResolvedValue({ images: [] });

    const { result, unmount } = renderHookWithClient(() => useAnimeImages(4), { client });
    await waitFor(() => result.current.isSuccess);
    unmount();

    expect(client.getQueryData(qk.anime.images(4))).toBeDefined();
  });

  test("disabled for non-positive animeId", async () => {
    const { result, unmount } = renderHookWithClient(() =>
      useAnimeImages(0),
    );
    expect(result.current.fetchStatus).toBe("idle");
    expect(searchImagesByAnimeMock).not.toHaveBeenCalled();
    unmount();
  });

  test("returns empty array when API response is null", async () => {
    searchImagesByAnimeMock.mockResolvedValue(null);
    const { result, unmount } = renderHookWithClient(() =>
      useAnimeImages(5),
    );
    await waitFor(() => result.current.isSuccess);
    expect(result.current.data).toEqual([]);
    unmount();
  });

  test("returns empty array when API response has no images field", async () => {
    searchImagesByAnimeMock.mockResolvedValue({});
    const { result, unmount } = renderHookWithClient(() =>
      useAnimeImages(6),
    );
    await waitFor(() => result.current.isSuccess);
    expect(result.current.data).toEqual([]);
    unmount();
  });
});
