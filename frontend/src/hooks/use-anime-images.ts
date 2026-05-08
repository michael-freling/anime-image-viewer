/**
 * `useAnimeImages` — React Query hook for the images shown in an anime
 * detail's Images tab.
 *
 * Always fetches ALL images for the anime via
 * `AnimeService.SearchImagesByAnime(animeId)`.
 */
import { useQuery, UseQueryResult } from "@tanstack/react-query";
import { AnimeService } from "../lib/api";
import { qk } from "../lib/query-keys";
import type { ImageFile } from "../types";

interface ImagesResponse {
  images?: ImageFile[] | null;
}

function isValidAnimeId(animeId: number): boolean {
  return Number.isInteger(animeId) && animeId > 0;
}

export function useAnimeImages(
  animeId: number,
): UseQueryResult<ImageFile[]> {
  return useQuery<ImageFile[]>({
    queryKey: qk.anime.images(animeId),
    queryFn: async () => {
      const resp = (await AnimeService.SearchImagesByAnime(
        animeId,
      )) as ImagesResponse;
      return resp?.images ?? [];
    },
    enabled: isValidAnimeId(animeId),
  });
}
