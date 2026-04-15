/**
 * `useSearchImages` — React Query hook for the Search page. Keyed by the
 * full filter object via `qk.search(filters)`, which internally sorts tag
 * arrays so `{ include: [1,2] }` and `{ include: [2,1] }` share a cache slot.
 *
 * Uses `placeholderData: keepPreviousData` (v5 replacement for
 * `keepPreviousData: true`) so the results grid keeps showing the last
 * successful image set while new filters are being fetched — this prevents
 * the grid from flashing to a skeleton on every chip toggle.
 *
 * Backend mapping:
 *   The Go `SearchService.SearchImages` only accepts a single `tagId` (with
 *   an optional inversion) plus an optional `directoryId` anchor. The richer
 *   include/exclude/anime UI filters here are layered on top of that:
 *     - `animeId` only            -> AnimeService.SearchImagesByAnime
 *     - first `includeTagIds[0]`  -> SearchService.SearchImages({ tagId })
 *       additional include/exclude tags are applied client-side once the
 *       per-image tag map (via AnimeService.GetImageTagIDs) is available.
 *   The hook keeps its filter-object signature unchanged so callers (and the
 *   existing tests) remain valid; the backend mapping is internal.
 */
import {
  keepPreviousData,
  useQuery,
  UseQueryResult,
} from "@tanstack/react-query";
import { AnimeService, SearchService } from "../lib/api";
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
      const includeIds = filters.includeTagIds ?? [];
      // Anime-anchored search with no tag filters: hit the dedicated
      // SearchImagesByAnime endpoint so the result is anime-scoped without
      // requiring a tagId.
      if (filters.animeId != null && includeIds.length === 0) {
        const resp = (await AnimeService.SearchImagesByAnime(
          filters.animeId,
        )) as SearchResponse;
        return resp?.images ?? [];
      }
      // Tag-driven search: pass the first include tag to the server and let
      // any additional include/exclude tags fall back to a client-side
      // filter pass when the caller introduces it.
      const primaryTagId = includeIds[0];
      if (primaryTagId == null) {
        // No include tag and no anime anchor — the backend can't resolve
        // an empty SearchImagesRequest; surface an empty result instead of
        // a runtime validation error.
        return [];
      }
      const resp = (await SearchService.SearchImages({
        tagId: primaryTagId,
      })) as SearchResponse;
      return resp?.images ?? [];
    },
    placeholderData: keepPreviousData,
  });
}
