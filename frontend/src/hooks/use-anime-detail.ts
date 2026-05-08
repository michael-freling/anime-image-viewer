/**
 * `useAnimeDetail` — React Query hook for the full anime detail payload used
 * by the anime detail page and its tabs.
 *
 * Calls `AnimeService.GetAnimeDetails(id)` which returns
 * `AnimeDetailsResponse`. The Wails-bound DTO mirrors Go field names
 * (`entryType: string`); we narrow it to our domain `Season.type: SeasonType`
 * here so consumers see the typed shape from `types/index.ts`.
 *
 * Only enabled when the caller passes a positive, finite integer so guards
 * like `animeId === 0` or `-1` don't issue a bogus request.
 */
import { useQuery, UseQueryResult } from "@tanstack/react-query";
import { AnimeService } from "../lib/api";
import { qk } from "../lib/query-keys";
import type { AnimeDetail, Season, SeasonType } from "../types";

function isValidAnimeId(animeId: number): boolean {
  return Number.isInteger(animeId) && animeId > 0;
}

const SEASON_TYPES: ReadonlySet<SeasonType> = new Set<SeasonType>([
  "season",
  "movie",
  "other",
]);

/**
 * Coerce the backend's free-form `entryType` string to our narrowed
 * `SeasonType` union. Unknown values fall back to "other" so the UI can still
 * render the row.
 */
function narrowSeasonType(raw: string | null | undefined): SeasonType {
  if (raw && (SEASON_TYPES as Set<string>).has(raw)) {
    return raw as SeasonType;
  }
  return "other";
}

/**
 * Map a single backend season node (`AnimeSeasonInfo`) to the domain `Season`
 * shape, recursing into children. Tolerates missing fields so the test
 * fixtures can pass minimal payloads.
 */
function mapSeason(node: Record<string, unknown>): Season {
  const children = Array.isArray(node.children)
    ? (node.children as Record<string, unknown>[]).map(mapSeason)
    : [];
  const rawType =
    (node.seasonType as string | undefined) ??
    (node.entryType as string | undefined) ??
    (node.type as string | undefined);
  return {
    id: Number(node.id ?? 0),
    name: String(node.name ?? ""),
    type: narrowSeasonType(rawType),
    seasonNumber:
      (node.seasonNumber ?? node.entryNumber) == null
        ? null
        : Number(node.seasonNumber ?? node.entryNumber),
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
      const rawSeasons = Array.isArray(res.seasons)
        ? (res.seasons as Record<string, unknown>[])
        : [];
      const seasons = rawSeasons.map(mapSeason);
      return {
        ...(res as unknown as AnimeDetail),
        seasons,
      };
    },
    enabled: isValidAnimeId(animeId),
  });
}
