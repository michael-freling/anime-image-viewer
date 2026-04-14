/**
 * `useSearchImages` — React Query hook for the Search page. Keyed by the
 * full filter object via `qk.search(filters)`, which internally sorts tag
 * arrays so `{ include: [1,2] }` and `{ include: [2,1] }` share a cache slot.
 *
 * Uses `placeholderData: keepPreviousData` (v5 replacement for
 * `keepPreviousData: true`) so the results grid keeps showing the last
 * successful image set while new filters are being fetched — this prevents
 * the grid from flashing to a skeleton on every chip toggle.
 */
import {
  keepPreviousData,
  useQuery,
  UseQueryResult,
} from "@tanstack/react-query";
import { SearchService } from "../lib/api";
import { qk } from "../lib/query-keys";
import type { ImageFile, SearchFilters } from "../types";

interface SearchResponse {
  images?: ImageFile[] | null;
}

export function useSearchImages(
  filters: SearchFilters,
): UseQueryResult<ImageFile[]> {
  return useQuery<ImageFile[]>({
    queryKey: qk.search({
      animeId: filters.animeId,
      includeTagIds: filters.includeTagIds,
      excludeTagIds: filters.excludeTagIds,
      sort: filters.sort,
    }),
    queryFn: async () => {
      const resp = (await SearchService.SearchImages({
        animeId: filters.animeId,
        includeTagIds: filters.includeTagIds ?? [],
        excludeTagIds: filters.excludeTagIds ?? [],
        sort: filters.sort,
      })) as SearchResponse;
      return resp?.images ?? [];
    },
    placeholderData: keepPreviousData,
  });
}
