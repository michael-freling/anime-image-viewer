/**
 * Season CRUD mutation hooks.
 *
 * Each mutation calls the corresponding `AnimeService` binding and invalidates
 * the anime detail query on success so the seasons tab reflects the new state
 * without a manual refetch.
 */
import {
  useMutation,
  UseMutationResult,
  useQueryClient,
} from "@tanstack/react-query";
import { AnimeService } from "../lib/api";
import { qk } from "../lib/query-keys";
import type { Season, SeasonType } from "../types";

/** Map the backend `AnimeSeasonInfo` response to the domain `Season`. */
function mapSeasonResponse(raw: Record<string, unknown>): Season {
  const children = Array.isArray(raw.children)
    ? (raw.children as Record<string, unknown>[]).map(mapSeasonResponse)
    : [];
  const rawType =
    (raw.entryType as string | undefined) ?? (raw.type as string | undefined);
  return {
    id: Number(raw.id ?? 0),
    name: String(raw.name ?? ""),
    type: (rawType ?? "other") as SeasonType,
    seasonNumber: raw.entryNumber == null ? null : Number(raw.entryNumber),
    airingSeason: String(raw.airingSeason ?? ""),
    airingYear: raw.airingYear == null ? null : Number(raw.airingYear),
    imageCount: Number(raw.imageCount ?? 0),
    children,
  };
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export interface CreateSeasonVariables {
  animeId: number;
  seasonType: SeasonType;
  seasonNumber: number | null;
  displayName: string;
}

export function useCreateSeason(): UseMutationResult<
  Season,
  Error,
  CreateSeasonVariables
> {
  const queryClient = useQueryClient();
  return useMutation<Season, Error, CreateSeasonVariables>({
    mutationFn: async ({ animeId, seasonType, seasonNumber, displayName }) => {
      const res = (await AnimeService.CreateAnimeSeason(
        animeId,
        seasonType,
        seasonNumber,
        displayName,
      )) as unknown as Record<string, unknown>;
      return mapSeasonResponse(res);
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: qk.anime.detail(variables.animeId),
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Rename
// ---------------------------------------------------------------------------

export interface RenameSeasonVariables {
  animeId: number;
  seasonId: number;
  newName: string;
}

export function useRenameSeason(): UseMutationResult<
  void,
  Error,
  RenameSeasonVariables
> {
  const queryClient = useQueryClient();
  return useMutation<void, Error, RenameSeasonVariables>({
    mutationFn: async ({ seasonId, newName }) => {
      await AnimeService.RenameSeason(seasonId, newName);
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: qk.anime.detail(variables.animeId),
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Update type
// ---------------------------------------------------------------------------

export interface UpdateSeasonTypeVariables {
  animeId: number;
  seasonId: number;
  seasonType: SeasonType;
  seasonNumber: number | null;
}

export function useUpdateSeasonType(): UseMutationResult<
  void,
  Error,
  UpdateSeasonTypeVariables
> {
  const queryClient = useQueryClient();
  return useMutation<void, Error, UpdateSeasonTypeVariables>({
    mutationFn: async ({ seasonId, seasonType, seasonNumber }) => {
      await AnimeService.UpdateSeasonType(seasonId, seasonType, seasonNumber);
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: qk.anime.detail(variables.animeId),
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Update airing info
// ---------------------------------------------------------------------------

export interface UpdateSeasonAiringVariables {
  animeId: number;
  seasonId: number;
  airingSeason: string;
  airingYear: number;
}

export function useUpdateSeasonAiring(): UseMutationResult<
  void,
  Error,
  UpdateSeasonAiringVariables
> {
  const queryClient = useQueryClient();
  return useMutation<void, Error, UpdateSeasonAiringVariables>({
    mutationFn: async ({ seasonId, airingSeason, airingYear }) => {
      await AnimeService.UpdateSeasonAiringInfo(
        seasonId,
        airingSeason,
        airingYear,
      );
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: qk.anime.detail(variables.animeId),
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export interface DeleteSeasonVariables {
  animeId: number;
  seasonId: number;
}

export function useDeleteSeason(): UseMutationResult<
  void,
  Error,
  DeleteSeasonVariables
> {
  const queryClient = useQueryClient();
  return useMutation<void, Error, DeleteSeasonVariables>({
    mutationFn: async ({ seasonId }) => {
      await AnimeService.DeleteSeason(seasonId);
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: qk.anime.detail(variables.animeId),
      });
    },
  });
}
