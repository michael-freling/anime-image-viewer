/**
 * React Query key factory.
 *
 * Centralising keys prevents typos and makes cache invalidation easier to
 * reason about: every hook that needs to invalidate anime detail uses the
 * same shape, which makes `queryClient.invalidateQueries({ queryKey:
 * qk.anime.detail(id) })` unambiguous.
 *
 * Keys are hierarchical: `qk.anime.all` is a prefix of every anime key so a
 * single invalidate call can wipe the whole section. Keep arrays (not
 * strings) — React Query compares by structural equality.
 */

const stableFileIds = (ids: readonly number[]): number[] =>
  [...ids].sort((a, b) => a - b);

export const qk = {
  anime: {
    all: ["anime"] as const,
    list: () => [...qk.anime.all, "list"] as const,
    detail: (animeId: number) => [...qk.anime.all, "detail", animeId] as const,
    images: (animeId: number, entryId?: number | null) =>
      entryId == null
        ? ([...qk.anime.all, "images", animeId] as const)
        : ([...qk.anime.all, "images", animeId, "entry", entryId] as const),
    entries: (animeId: number) =>
      [...qk.anime.all, "entries", animeId] as const,
    characters: (animeId: number) =>
      [...qk.anime.all, "characters", animeId] as const,
  },
  tags: {
    all: ["tags"] as const,
    list: () => [...qk.tags.all, "list"] as const,
    stats: (fileIds: readonly number[]) =>
      [...qk.tags.all, "stats", stableFileIds(fileIds)] as const,
  },
  /**
   * Search queries are keyed by the full filter object. We serialise the
   * params with sorted tag arrays so `{a, [1,2]}` and `{a, [2,1]}` share a
   * cache entry.
   */
  search: (params: {
    animeId?: number;
    includeTagIds?: readonly number[];
    excludeTagIds?: readonly number[];
    sort?: string;
  }) =>
    [
      "search",
      {
        animeId: params.animeId ?? null,
        includeTagIds: stableFileIds(params.includeTagIds ?? []),
        excludeTagIds: stableFileIds(params.excludeTagIds ?? []),
        sort: params.sort ?? null,
      },
    ] as const,
  backup: {
    all: ["backup"] as const,
    list: () => [...qk.backup.all, "list"] as const,
    config: () => [...qk.backup.all, "config"] as const,
  },
  config: () => ["config"] as const,
  aniList: {
    search: (query: string) => ["aniList", "search", query] as const,
  },
} as const;

export type QueryKeyFactory = typeof qk;
