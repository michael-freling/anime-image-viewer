/**
 * `useAnimeDetail` — React Query hook for the full anime detail payload used
 * by the anime detail page and its tabs.
 *
 * Calls `AnimeService.GetAnimeDetails(id)` which returns
 * `AnimeDetailsResponse`. The Wails-bound DTO mirrors Go field names
 * (`entryType: string`); we narrow it to our domain `Entry.type: EntryType`
 * here so consumers see the typed shape from `types/index.ts`.
 *
 * Only enabled when the caller passes a positive, finite integer so guards
 * like `animeId === 0` or `-1` don't issue a bogus request.
 */
import { useQuery, UseQueryResult } from "@tanstack/react-query";
import { AnimeService } from "../lib/api";
import { qk } from "../lib/query-keys";
import type { AnimeDetail, Entry, EntryType } from "../types";

function isValidAnimeId(animeId: number): boolean {
  return Number.isInteger(animeId) && animeId > 0;
}

const ENTRY_TYPES: ReadonlySet<EntryType> = new Set<EntryType>([
  "season",
  "movie",
  "other",
]);

/**
 * Coerce the backend's free-form `entryType` string to our narrowed
 * `EntryType` union. Unknown values fall back to "other" so the UI can still
 * render the row.
 */
function narrowEntryType(raw: string | null | undefined): EntryType {
  if (raw && (ENTRY_TYPES as Set<string>).has(raw)) {
    return raw as EntryType;
  }
  return "other";
}

/**
 * Map a single backend entry node (`AnimeEntryInfo`) to the domain `Entry`
 * shape, recursing into children. Tolerates missing fields so the test
 * fixtures can pass minimal payloads.
 */
function mapEntry(node: Record<string, unknown>): Entry {
  const children = Array.isArray(node.children)
    ? (node.children as Record<string, unknown>[]).map(mapEntry)
    : [];
  // Accept either `entryType` (real bindings) or the legacy `type` (used by
  // some tests / hand-written fixtures so the mapper is round-trip safe).
  const rawType =
    (node.entryType as string | undefined) ??
    (node.type as string | undefined);
  return {
    id: Number(node.id ?? 0),
    name: String(node.name ?? ""),
    type: narrowEntryType(rawType),
    entryNumber:
      node.entryNumber == null ? null : Number(node.entryNumber),
    airingSeason: String(node.airingSeason ?? ""),
    airingYear: node.airingYear == null ? null : Number(node.airingYear),
    imageCount: Number(node.imageCount ?? 0),
    children,
  };
}

export function useAnimeDetail(
  animeId: number,
): UseQueryResult<AnimeDetail> {
  return useQuery<AnimeDetail>({
    queryKey: qk.anime.detail(animeId),
    queryFn: async () => {
      const res = (await AnimeService.GetAnimeDetails(
        animeId,
      )) as unknown as Record<string, unknown>;
      const rawEntries = Array.isArray(res.entries)
        ? (res.entries as Record<string, unknown>[])
        : [];
      const entries = rawEntries.map(mapEntry);
      return {
        ...(res as unknown as AnimeDetail),
        entries,
      };
    },
    enabled: isValidAnimeId(animeId),
  });
}
