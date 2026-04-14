/**
 * `useAnimeImages` — React Query hook for the images shown in an anime
 * detail's Images tab. When an entry is selected (chip filter), the
 * `entryId` argument narrows the results.
 *
 * Backend: the current Go surface exposes
 * `AnimeService.GetAnimeImages(animeId)` (all) and
 * `AnimeService.GetAnimeImagesByEntry(animeId, entryId)` (filtered).  If those
 * methods aren't present yet they'll surface as runtime Wails errors —
 * documented in the phase report as "backend methods to add".
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
        const resp = (await AnimeService.GetAnimeImagesByEntry(
          animeId,
          entryId,
        )) as ImagesResponse;
        return resp?.images ?? [];
      }
      const resp = (await AnimeService.GetAnimeImages(animeId)) as
        | ImagesResponse
        | ImageFile[]
        | null;
      if (Array.isArray(resp)) return resp;
      return resp?.images ?? [];
    },
    enabled: isValidAnimeId(animeId),
  });
}
