/**
 * `useAniListSearch` — debounced AniList search used by the Create Anime
 * dialog. Calls `AnimeService.SearchAniList(q)` once the user has stopped
 * typing for 300ms (via `@mantine/hooks`' `useDebouncedValue`).
 *
 * Disabled when the (debounced) query is empty so we never fire a search for
 * "".
 */
import { useQuery, UseQueryResult } from "@tanstack/react-query";
import { useDebouncedValue } from "@mantine/hooks";
import { AnimeService } from "../lib/api";
import type { AniListSearchResult } from "../lib/api";
import { qk } from "../lib/query-keys";

export const ANILIST_SEARCH_DEBOUNCE_MS = 300;

export function useAniListSearch(
  query: string,
): UseQueryResult<AniListSearchResult[]> {
  const [debounced] = useDebouncedValue(query, ANILIST_SEARCH_DEBOUNCE_MS);
  const trimmed = debounced.trim();
  return useQuery<AniListSearchResult[]>({
    queryKey: qk.aniList.search(trimmed),
    queryFn: async () => {
      const res = (await AnimeService.SearchAniList(trimmed)) as
        | AniListSearchResult[]
        | null
        | undefined;
      return res ?? [];
    },
    enabled: trimmed.length > 0,
  });
}
