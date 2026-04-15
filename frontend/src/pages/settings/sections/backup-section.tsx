/**
 * Backup settings section — Settings > Backup tab.
 *
 * Spec: ui-design.md §2.7 (Backup and Restore user flow), §3.7 (Backup is
 * a *section within Settings*, not its own nav item). Per `frontend-design.md`
 * §3, the `/backup` route is gone; this section replaces the legacy page.
 *
 * Renders:
 *   - Backup destination path (read-only display of
 *     `ConfigSettings.backupDirectory`).
 *   - "Create Backup" button — `useCreateBackup` mutation. Shows a success
 *     toast with the created path.
 *   - Backup history list (`useBackupList`), each row has "Restore" and
 *     "Delete" buttons that open a `ConfirmDialog` before firing the
 *     matching mutation. Restore uses danger variant because it overwrites
 *     current data.
 *
 * Loading / empty / error states follow the shared shell conventions:
 *   - `RowSkeleton` while fetching.
 *   - `EmptyState` when the list is empty.
 *   - `ErrorAlert` with retry on query error.
 */
import { Box, Button, Stack, Text } from "@chakra-ui/react";
import { Archive, Database } from "lucide-react";
import { useState } from "react";

import { EmptyState } from "../../../components/shared/empty-state";
import { ErrorAlert } from "../../../components/shared/error-alert";
import { RowSkeleton } from "../../../components/shared/loading-skeleton";
import { ConfirmDialog } from "../../../components/ui/confirm-dialog";
import { toast } from "../../../components/ui/toaster";
import {
  useBackupList,
  useCreateBackup,
  useDeleteBackup,
  useRestoreBackup,
} from "../../../hooks/use-backup";
import { useConfig } from "../../../hooks/use-config";
import type { BackupInfo } from "../../../lib/api";

/**
 * Format an ISO 8601 timestamp as a locale-friendly datetime string.
 * Falls back to the raw value if the date doesn't parse.
 */
function formatBackupDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function BackupSection(): JSX.Element {
  const configQuery = useConfig();
  const backupListQuery = useBackupList();
  const createBackup = useCreateBackup();
  const restoreBackup = useRestoreBackup();
  const deleteBackup = useDeleteBackup();

  const [restoreTarget, setRestoreTarget] = useState<BackupInfo | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BackupInfo | null>(null);

  const destination = configQuery.data?.backupDirectory ?? "";

  const handleCreate = async () => {
    try {
      const path = await createBackup.mutateAsync({
        includeImages: false,
        // Empty string means "use the configured default directory".
        targetDir: "",
      });
      toast.success("Backup created", path);
    } catch (err) {
      toast.error(
        "Couldn't create backup",
        err instanceof Error ? err.message : String(err),
      );
    }
  };

  const handleRestoreConfirm = async () => {
    if (!restoreTarget) return;
    const target = restoreTarget;
    setRestoreTarget(null);
    try {
      await restoreBackup.mutateAsync({
        path: target.path,
        includeImages: target.includesImages,
        targetDir: "",
      });
      toast.success(
        "Restore complete",
        "Restart the application for changes to take full effect.",
      );
    } catch (err) {
      toast.error(
        "Couldn't restore backup",
        err instanceof Error ? err.message : String(err),
      );
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    try {
      await deleteBackup.mutateAsync({ path: target.path });
      toast.success("Backup deleted");
    } catch (err) {
      toast.error(
        "Couldn't delete backup",
        err instanceof Error ? err.message : String(err),
      );
    }
  };

  let listBody: JSX.Element;
  if (backupListQuery.isLoading) {
    listBody = (
      <Box data-testid="backup-list-loading">
        <RowSkeleton lines={3} />
      </Box>
    );
  } else if (backupListQuery.isError) {
    listBody = (
      <ErrorAlert
        title="Couldn't load backups"
        message={
          backupListQuery.error instanceof Error
            ? backupListQuery.error.message
            : "Unknown error"
        }
        onRetry={() => {
          backupListQuery.refetch();
        }}
      />
    );
  } else if ((backupListQuery.data ?? []).length === 0) {
    listBody = (
      <EmptyState
        icon={Archive}
        title="No backups yet"
        description="Use the Create Backup button above to save a snapshot of your library."
      />
    );
  } else {
    listBody = (
      <Stack
        as="ul"
        role="list"
        gap="2"
        data-testid="backup-list"
      >
        {(backupListQuery.data ?? []).map((backup) => (
          <Stack
            as="li"
            key={backup.path}
            role="listitem"
            data-testid={`backup-row-${backup.path}`}
            direction={{ base: "column", md: "row" }}
            align={{ base: "stretch", md: "center" }}
            justify="space-between"
            gap="3"
            p="3"
            bg="bg.surface"
            borderWidth="1px"
            borderColor="border"
            borderRadius="md"
          >
            <Box minWidth={0} flex="1">
              <Text fontSize="sm" fontWeight="600" color="fg">
                {formatBackupDate(backup.createdAt)}
              </Text>
              <Text fontSize="xs" color="fg.muted" wordBreak="break-all">
                {backup.path}
              </Text>
              <Text fontSize="xs" color="fg.secondary" mt="1">
                {backup.includesImages ? "Includes images" : "Database only"}
              </Text>
            </Box>
            <Stack direction="row" gap="2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setRestoreTarget(backup)}
                data-testid={`backup-restore-${backup.path}`}
              >
                Restore
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                color="danger"
                borderColor="danger"
                onClick={() => setDeleteTarget(backup)}
                data-testid={`backup-delete-${backup.path}`}
              >
                Delete
              </Button>
            </Stack>
          </Stack>
        ))}
      </Stack>
    );
  }

  return (
    <Stack data-testid="backup-section" gap="5" py="4">
      <Stack gap="2">
        <Text fontSize="sm" color="fg.secondary">
          Backup Destination
        </Text>
        <Stack direction="row" gap="2" align="center">
          <Box
            flex="1"
            px="3"
            py="2"
            borderWidth="1px"
            borderColor="border"
            borderRadius="md"
            bg="bg.base"
            fontSize="sm"
            color="fg.muted"
            wordBreak="break-all"
            data-testid="backup-destination"
          >
            {destination || "(default)"}
          </Box>
          <Button
            type="button"
            size="sm"
            bg="primary"
            color="bg.surface"
            _hover={{ bg: "primary.hover" }}
            onClick={handleCreate}
            disabled={createBackup.isPending}
            loading={createBackup.isPending}
            loadingText="Creating"
            data-testid="create-backup"
          >
            <Database size={14} aria-hidden="true" />
            Create Backup
          </Button>
        </Stack>
      </Stack>

      <Stack gap="2">
        <Text fontSize="sm" fontWeight="600" color="fg">
          Backup History
        </Text>
        {listBody}
      </Stack>

      <ConfirmDialog
        open={restoreTarget !== null}
        onClose={() => setRestoreTarget(null)}
        onConfirm={handleRestoreConfirm}
        title="Restore from backup?"
        description={
          restoreTarget
            ? `This will overwrite your current data with the backup created on ${formatBackupDate(restoreTarget.createdAt)}.`
            : undefined
        }
        confirmLabel="Restore"
        variant="danger"
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete this backup?"
        description={
          deleteTarget
            ? `The backup created on ${formatBackupDate(deleteTarget.createdAt)} will be permanently removed. This action cannot be undone.`
            : undefined
        }
        confirmLabel="Delete"
        variant="danger"
      />
    </Stack>
  );
}

export default BackupSection;
