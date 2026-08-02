/**
 * `useMetadataSearch` — debounced series search against the anime metadata
 * database. Calls `AnimeService.SearchMetadata(q)` once the user has stopped
 * typing for 300ms (via `@mantine/hooks`' `useDebouncedValue`).
 *
 * Disabled when the (debounced) query is empty so we never fire a search for
 * "".
 */
import { useQuery, UseQueryResult } from "@tanstack/react-query";
import { useDebouncedValue } from "@mantine/hooks";
import { AnimeService } from "../lib/api";
import type { MetadataSearchResult } from "../lib/api";
import { qk } from "../lib/query-keys";

export const METADATA_SEARCH_DEBOUNCE_MS = 300;

export function useMetadataSearch(
  query: string,
): UseQueryResult<MetadataSearchResult[]> {
  const [debounced] = useDebouncedValue(query, METADATA_SEARCH_DEBOUNCE_MS);
  const trimmed = debounced.trim();
  return useQuery<MetadataSearchResult[]>({
    queryKey: qk.metadata.search(trimmed),
    queryFn: async () => {
      const res = (await AnimeService.SearchMetadata(trimmed)) as
        | MetadataSearchResult[]
        | null
        | undefined;
      return res ?? [];
    },
    enabled: trimmed.length > 0,
  });
}
