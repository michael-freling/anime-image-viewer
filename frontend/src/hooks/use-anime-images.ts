/**
 * `useAnimeImages` — React Query hook for the images shown in an anime
 * detail's Images tab. When an entry is selected (chip filter), the
 * `entryId` argument narrows the results.
 *
 * Backend mapping:
 *   - All anime images   -> `AnimeService.SearchImagesByAnime(animeId)`
 *   - Per-entry filter   -> `AnimeService.GetFolderImages(entryId, true)`
 *     (an entry IS a folder in the anime's tree; recursive=true so
 *     sub-entries' images are included.)
 *
 * Both endpoints return `SearchImagesResponse { images: Image[] }`.
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
  entryId?: number | null,
): UseQueryResult<ImageFile[]> {
  return useQuery<ImageFile[]>({
    queryKey: qk.anime.images(animeId, entryId ?? null),
    queryFn: async () => {
      if (entryId != null && entryId > 0) {
        const resp = (await AnimeService.GetFolderImages(
          entryId,
          true,
        )) as ImagesResponse;
        return resp?.images ?? [];
      }
      const resp = (await AnimeService.SearchImagesByAnime(
        animeId,
      )) as ImagesResponse;
      return resp?.images ?? [];
    },
    enabled: isValidAnimeId(animeId),
  });
}
