/**
 * `useAnimeList` — React Query hook for fetching the Home page's anime
 * summaries via `AnimeService.ListAnime()`.
 *
 * Keyed via `qk.anime.list()` so mutations elsewhere (create, import, delete)
 * can invalidate this entry by calling `queryClient.invalidateQueries({
 * queryKey: qk.anime.list() })`.
 *
 * `ListAnime` returns `AnimeListItem[]` on the Go side; we cast to the
 * app-level `AnimeSummary[]` shape since the two currently share field names.
 */
import { useQuery, UseQueryResult } from "@tanstack/react-query";
import { AnimeService } from "../lib/api";
import { qk } from "../lib/query-keys";
import type { AnimeSummary } from "../types";

export function useAnimeList(): UseQueryResult<AnimeSummary[]> {
  return useQuery<AnimeSummary[]>({
    queryKey: qk.anime.list(),
    queryFn: async () => {
      const list = (await AnimeService.ListAnime()) as
        | AnimeSummary[]
        | null
        | undefined;
      return list ?? [];
    },
  });
}
