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
 *
 * Client-side exclude filtering:
 *   When `excludeTagIds` are present, we fetch the tag map for the result
 *   set via `AnimeService.GetImageTagIDs` and filter out images that carry
 *   any of the excluded tags. This keeps the API surface simple while
 *   enabling the "show me images missing tag X" workflow.
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

/**
 * Given a set of images and exclude tag ids, fetch each image's tags via
 * `AnimeService.GetImageTagIDs` and return only images that do NOT carry
 * any of the excluded tags.
 */
async function applyExcludeFilter(
  images: ImageFile[],
  excludeTagIds: number[],
): Promise<ImageFile[]> {
  if (images.length === 0 || excludeTagIds.length === 0) return images;

  const imageIds = images.map((img) => img.id);
  const tagMap = (await AnimeService.GetImageTagIDs(imageIds)) as Record<
    number | string,
    number[]
  > | null;

  if (!tagMap) return images;

  const excludeSet = new Set(excludeTagIds);
  return images.filter((img) => {
    const imageTags: number[] = tagMap[img.id] ?? [];
    return !imageTags.some((tagId) => excludeSet.has(tagId));
  });
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
      const excludeIds = filters.excludeTagIds ?? [];

      let images: ImageFile[];

      // Anime-anchored search with no include tag filters: hit the dedicated
      // SearchImagesByAnime endpoint so the result is anime-scoped without
      // requiring a tagId.
      if (filters.animeId != null && includeIds.length === 0) {
        const resp = (await AnimeService.SearchImagesByAnime(
          filters.animeId,
        )) as SearchResponse;
        images = resp?.images ?? [];
      } else {
        // Tag-driven search: pass the first include tag to the server.
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
        images = resp?.images ?? [];
      }

      // Client-side exclude filtering: remove images that carry any of the
      // excluded tags.
      if (excludeIds.length > 0) {
        images = await applyExcludeFilter(images, excludeIds);
      }

      return images;
    },
    placeholderData: keepPreviousData,
  });
}
