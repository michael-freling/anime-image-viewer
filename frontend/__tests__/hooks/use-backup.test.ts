/**
 * Tests for the backup hooks.
 *
 * Verifies each mutation invalidates the list cache (the single most
 * important behavior — if we forget to invalidate, the UI silently drifts
 * until a user hard-refreshes).
 */
const listBackupsMock = jest.fn();
const backupMock = jest.fn();
const restoreMock = jest.fn();
const deleteBackupMock = jest.fn();
jest.mock("../../src/lib/api", () => ({
  __esModule: true,
  BackupFrontendService: {
    ListBackups: (...args: unknown[]) => listBackupsMock(...args),
    Backup: (...args: unknown[]) => backupMock(...args),
    Restore: (...args: unknown[]) => restoreMock(...args),
    DeleteBackup: (...args: unknown[]) => deleteBackupMock(...args),
  },
}));

import { act } from "react-dom/test-utils";
import {
  useBackupList,
  useCreateBackup,
  useDeleteBackup,
  useRestoreBackup,
} from "../../src/hooks/use-backup";
import { qk } from "../../src/lib/query-keys";
import {
  createTestQueryClient,
  renderHookWithClient,
  waitFor,
} from "../test-utils";

describe("use-backup", () => {
  beforeEach(() => {
    listBackupsMock.mockReset();
    backupMock.mockReset();
    restoreMock.mockReset();
    deleteBackupMock.mockReset();
  });

  test("useBackupList fetches and returns the list", async () => {
    const backups = [
      { createdAt: "2024-01-01T00:00:00Z", includesImages: false, path: "/tmp/a" },
    ];
    listBackupsMock.mockResolvedValue(backups);
    const { result, unmount } = renderHookWithClient(() => useBackupList());
    await waitFor(() => result.current.isSuccess);
    expect(result.current.data).toEqual(backups);
    unmount();
  });

  test("useCreateBackup invalidates the list on success", async () => {
    const client = createTestQueryClient();
    listBackupsMock.mockResolvedValue([]);
    backupMock.mockResolvedValue("/tmp/new-backup");

    // Prime the list cache.
    const list = renderHookWithClient(() => useBackupList(), { client });
    await waitFor(() => list.result.current.isSuccess);

    const mut = renderHookWithClient(() => useCreateBackup(), { client });
    await act(async () => {
      await mut.result.current.mutateAsync({
        includeImages: true,
        targetDir: "/tmp",
      });
    });
    expect(backupMock).toHaveBeenCalledWith(true, "/tmp");
    // List query was invalidated → refetch fired.
    expect(listBackupsMock).toHaveBeenCalledTimes(2);
    list.unmount();
    mut.unmount();
  });

  test("useRestoreBackup invalidates the list on success", async () => {
    const client = createTestQueryClient();
    listBackupsMock.mockResolvedValue([]);
    restoreMock.mockResolvedValue(undefined);

    const list = renderHookWithClient(() => useBackupList(), { client });
    await waitFor(() => list.result.current.isSuccess);

    const mut = renderHookWithClient(() => useRestoreBackup(), { client });
    await act(async () => {
      await mut.result.current.mutateAsync({
        path: "/tmp/a",
        includeImages: false,
        targetDir: "",
      });
    });
    expect(restoreMock).toHaveBeenCalledWith("/tmp/a", false, "");
    expect(listBackupsMock).toHaveBeenCalledTimes(2);
    list.unmount();
    mut.unmount();
  });

  test("useDeleteBackup invalidates the list on success", async () => {
    const client = createTestQueryClient();
    listBackupsMock.mockResolvedValue([]);
    deleteBackupMock.mockResolvedValue(undefined);

    const list = renderHookWithClient(() => useBackupList(), { client });
    await waitFor(() => list.result.current.isSuccess);

    const mut = renderHookWithClient(() => useDeleteBackup(), { client });
    await act(async () => {
      await mut.result.current.mutateAsync({ path: "/tmp/a" });
    });
    expect(deleteBackupMock).toHaveBeenCalledWith("/tmp/a");
    expect(listBackupsMock).toHaveBeenCalledTimes(2);
    list.unmount();
    mut.unmount();
  });

  test("query key factory maps through to what the hooks use", () => {
    // Sanity check: if anything ever replaces `qk.backup.list()` with a
    // different shape the mutations would no longer invalidate the list.
    expect(qk.backup.list()).toEqual(["backup", "list"]);
  });

  test("useBackupList coerces a null/undefined ListBackups response to []", async () => {
    // Drives the `list ?? []` fallback branch.
    listBackupsMock.mockResolvedValue(null);
    const { result, unmount } = renderHookWithClient(() => useBackupList());
    await waitFor(() => result.current.isSuccess);
    expect(result.current.data).toEqual([]);
    unmount();
  });
});
