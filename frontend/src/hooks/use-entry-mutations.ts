/**
 * Entry CRUD mutation hooks.
 *
 * Each mutation calls the corresponding `AnimeService` binding and invalidates
 * the anime detail query on success so the entries tab reflects the new state
 * without a manual refetch.
 */
import {
  useMutation,
  UseMutationResult,
  useQueryClient,
} from "@tanstack/react-query";
import { AnimeService } from "../lib/api";
import { qk } from "../lib/query-keys";
import type { Entry, EntryType } from "../types";

/** Map the backend `AnimeEntryInfo` response to the domain `Entry`. */
function mapEntryResponse(raw: Record<string, unknown>): Entry {
  const children = Array.isArray(raw.children)
    ? (raw.children as Record<string, unknown>[]).map(mapEntryResponse)
    : [];
  const rawType =
    (raw.entryType as string | undefined) ?? (raw.type as string | undefined);
  return {
    id: Number(raw.id ?? 0),
    name: String(raw.name ?? ""),
    type: (rawType ?? "other") as EntryType,
    entryNumber: raw.entryNumber == null ? null : Number(raw.entryNumber),
    airingSeason: String(raw.airingSeason ?? ""),
    airingYear: raw.airingYear == null ? null : Number(raw.airingYear),
    imageCount: Number(raw.imageCount ?? 0),
    children,
  };
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export interface CreateEntryVariables {
  animeId: number;
  entryType: EntryType;
  entryNumber: number | null;
  displayName: string;
}

export function useCreateEntry(): UseMutationResult<
  Entry,
  Error,
  CreateEntryVariables
> {
  const queryClient = useQueryClient();
  return useMutation<Entry, Error, CreateEntryVariables>({
    mutationFn: async ({ animeId, entryType, entryNumber, displayName }) => {
      const res = (await AnimeService.CreateAnimeEntry(
        animeId,
        entryType,
        entryNumber,
        displayName,
      )) as unknown as Record<string, unknown>;
      return mapEntryResponse(res);
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

export interface RenameEntryVariables {
  animeId: number;
  entryId: number;
  newName: string;
}

export function useRenameEntry(): UseMutationResult<
  void,
  Error,
  RenameEntryVariables
> {
  const queryClient = useQueryClient();
  return useMutation<void, Error, RenameEntryVariables>({
    mutationFn: async ({ entryId, newName }) => {
      await AnimeService.RenameEntry(entryId, newName);
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

export interface UpdateEntryTypeVariables {
  animeId: number;
  entryId: number;
  entryType: EntryType;
  entryNumber: number | null;
}

export function useUpdateEntryType(): UseMutationResult<
  void,
  Error,
  UpdateEntryTypeVariables
> {
  const queryClient = useQueryClient();
  return useMutation<void, Error, UpdateEntryTypeVariables>({
    mutationFn: async ({ entryId, entryType, entryNumber }) => {
      await AnimeService.UpdateEntryType(entryId, entryType, entryNumber);
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

export interface UpdateEntryAiringVariables {
  animeId: number;
  entryId: number;
  airingSeason: string;
  airingYear: number;
}

export function useUpdateEntryAiring(): UseMutationResult<
  void,
  Error,
  UpdateEntryAiringVariables
> {
  const queryClient = useQueryClient();
  return useMutation<void, Error, UpdateEntryAiringVariables>({
    mutationFn: async ({ entryId, airingSeason, airingYear }) => {
      await AnimeService.UpdateEntryAiringInfo(
        entryId,
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

export interface DeleteEntryVariables {
  animeId: number;
  entryId: number;
}

export function useDeleteEntry(): UseMutationResult<
  void,
  Error,
  DeleteEntryVariables
> {
  const queryClient = useQueryClient();
  return useMutation<void, Error, DeleteEntryVariables>({
    mutationFn: async ({ entryId }) => {
      await AnimeService.DeleteEntry(entryId);
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: qk.anime.detail(variables.animeId),
      });
    },
  });
}
