/**
 * `useTagStats` — React Query hook returning per-tag statistics for a given
 * image selection. Powers the Image Tag Editor's tri-state checkboxes: a tag
 * is "fully set" when `fileCount === fileIds.length`, "indeterminate" when
 * partial, and "unset" when 0.
 *
 * Disabled when the selection is empty so we don't fire a request with
 * nothing to aggregate over. The query key sorts fileIds internally via
 * `qk.tags.stats` so re-ordered arrays share a cache entry.
 */
import { useQuery, UseQueryResult } from "@tanstack/react-query";
import { TagService } from "../lib/api";
import { qk } from "../lib/query-keys";
import type { TagStat } from "../types";

interface TagStatsResponse {
  tagStats?: Record<number, TagStat> | null;
}

export interface TagStatEntry {
  tagId: number;
  fileCount: number;
  isAddedBySelectedFiles: boolean;
}

export function useTagStats(
  fileIds: number[],
): UseQueryResult<TagStatEntry[]> {
  return useQuery<TagStatEntry[]>({
    queryKey: qk.tags.stats(fileIds),
    queryFn: async () => {
      const resp = (await TagService.ReadTagsByFileIDs(
        fileIds,
      )) as TagStatsResponse;
      const stats = resp?.tagStats ?? {};
      return Object.entries(stats).map(([tagId, stat]) => ({
        tagId: Number(tagId),
        fileCount: stat.fileCount,
        isAddedBySelectedFiles: stat.isAddedBySelectedFiles,
      }));
    },
    enabled: fileIds.length > 0,
  });
}
