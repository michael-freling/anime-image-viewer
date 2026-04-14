/**
 * `useTags` — React Query hook returning every global tag as a flat array.
 * `useTagMap` — same cache entry, but derived into an `id → Tag` map via
 * React Query's `select` option so callers can O(1) look up a tag by id
 * without reshaping the array themselves.
 *
 * Calls `TagService.GetAll()` which mirrors the list view used by the tag
 * management page.
 */
import { useQuery, UseQueryResult } from "@tanstack/react-query";
import { TagService } from "../lib/api";
import { qk } from "../lib/query-keys";
import type { Tag } from "../types";

async function fetchTags(): Promise<Tag[]> {
  const tags = (await TagService.GetAll()) as Tag[] | null | undefined;
  return tags ?? [];
}

export function useTags(): UseQueryResult<Tag[]> {
  return useQuery<Tag[]>({
    queryKey: qk.tags.list(),
    queryFn: fetchTags,
  });
}

export function useTagMap(): UseQueryResult<Map<number, Tag>, Error> {
  return useQuery<Tag[], Error, Map<number, Tag>>({
    queryKey: qk.tags.list(),
    queryFn: fetchTags,
    select: (tags) => {
      const map = new Map<number, Tag>();
      for (const tag of tags) {
        map.set(tag.id, tag);
      }
      return map;
    },
  });
}
