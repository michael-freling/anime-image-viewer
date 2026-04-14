/**
 * `useAnimeDetail` — React Query hook for the full anime detail payload used
 * by the anime detail page and its tabs.
 *
 * Calls `AnimeService.GetAnimeDetails(id)` which returns
 * `AnimeDetailsResponse`. Only enabled when the caller passes a positive,
 * finite integer so guards like `animeId === 0` or `-1` don't issue a bogus
 * request.
 */
import { useQuery, UseQueryResult } from "@tanstack/react-query";
import { AnimeService } from "../lib/api";
import { qk } from "../lib/query-keys";
import type { AnimeDetail } from "../types";

function isValidAnimeId(animeId: number): boolean {
  return Number.isInteger(animeId) && animeId > 0;
}

export function useAnimeDetail(
  animeId: number,
): UseQueryResult<AnimeDetail> {
  return useQuery<AnimeDetail>({
    queryKey: qk.anime.detail(animeId),
    queryFn: async () => {
      const res = (await AnimeService.GetAnimeDetails(animeId)) as AnimeDetail;
      return res;
    },
    enabled: isValidAnimeId(animeId),
  });
}
