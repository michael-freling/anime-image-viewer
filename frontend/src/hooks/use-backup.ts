/**
 * Backup hooks — one read hook (`useBackupList`) plus three mutations that
 * reshape the list (`useCreateBackup`, `useRestoreBackup`, `useDeleteBackup`).
 *
 * Each mutation invalidates `qk.backup.list()` on success so the backup tab
 * reflects the new state without a manual refetch.
 */
import {
  useMutation,
  UseMutationResult,
  useQuery,
  useQueryClient,
  UseQueryResult,
} from "@tanstack/react-query";
import { BackupFrontendService } from "../lib/api";
import type { BackupInfo } from "../lib/api";
import { qk } from "../lib/query-keys";

export function useBackupList(): UseQueryResult<BackupInfo[]> {
  return useQuery<BackupInfo[]>({
    queryKey: qk.backup.list(),
    queryFn: async () => {
      const list = (await BackupFrontendService.ListBackups()) as
        | BackupInfo[]
        | null
        | undefined;
      return list ?? [];
    },
  });
}

export interface CreateBackupVariables {
  includeImages: boolean;
  targetDir: string;
}

export function useCreateBackup(): UseMutationResult<
  string,
  Error,
  CreateBackupVariables
> {
  const queryClient = useQueryClient();
  return useMutation<string, Error, CreateBackupVariables>({
    mutationFn: async ({ includeImages, targetDir }) => {
      const path = (await BackupFrontendService.Backup(
        includeImages,
        targetDir,
      )) as string;
      return path;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.backup.list() });
    },
  });
}

export interface RestoreBackupVariables {
  path: string;
  includeImages: boolean;
  targetDir: string;
}

export function useRestoreBackup(): UseMutationResult<
  void,
  Error,
  RestoreBackupVariables
> {
  const queryClient = useQueryClient();
  return useMutation<void, Error, RestoreBackupVariables>({
    mutationFn: async ({ path, includeImages, targetDir }) => {
      await BackupFrontendService.Restore(path, includeImages, targetDir);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.backup.list() });
    },
  });
}

export interface DeleteBackupVariables {
  path: string;
}

export function useDeleteBackup(): UseMutationResult<
  void,
  Error,
  DeleteBackupVariables
> {
  const queryClient = useQueryClient();
  return useMutation<void, Error, DeleteBackupVariables>({
    mutationFn: async ({ path }) => {
      await BackupFrontendService.DeleteBackup(path);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.backup.list() });
    },
  });
}
