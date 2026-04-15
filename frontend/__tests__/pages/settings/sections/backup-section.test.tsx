/**
 * Tests for the BackupSection.
 *
 * Covers the six states required by the phase brief:
 *   - Loading skeleton while the backup list query is pending.
 *   - Success list renders formatted rows.
 *   - Empty state shows `EmptyState` copy.
 *   - Create Backup triggers the mutation and shows a success toast.
 *   - Restore opens the ConfirmDialog; confirming fires the mutation.
 *   - Destination path from `useConfig` is shown.
 *
 * All Wails bindings are mocked at the `lib/api` module boundary, and the
 * shared `toast` helper is stubbed so we can assert on its calls without
 * driving Chakra's portal.
 */
const getConfigMock = jest.fn();
const updateConfigMock = jest.fn();
const listBackupsMock = jest.fn();
const createBackupMock = jest.fn();
const restoreBackupMock = jest.fn();
const deleteBackupMock = jest.fn();

jest.mock("../../../../src/lib/api", () => ({
  __esModule: true,
  ConfigFrontendService: {
    GetConfig: (...args: unknown[]) => getConfigMock(...args),
    UpdateConfig: (...args: unknown[]) => updateConfigMock(...args),
  },
  BackupFrontendService: {
    ListBackups: (...args: unknown[]) => listBackupsMock(...args),
    Backup: (...args: unknown[]) => createBackupMock(...args),
    Restore: (...args: unknown[]) => restoreBackupMock(...args),
    DeleteBackup: (...args: unknown[]) => deleteBackupMock(...args),
  },
}));

const toastSuccess = jest.fn();
const toastError = jest.fn();
jest.mock("../../../../src/components/ui/toaster", () => ({
  __esModule: true,
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
    info: jest.fn(),
    warning: jest.fn(),
    dismiss: jest.fn(),
  },
  toaster: {
    create: jest.fn(),
    dismiss: jest.fn(),
  },
  Toaster: () => null,
}));

import { act } from "react-dom/test-utils";

import { BackupSection } from "../../../../src/pages/settings/sections/backup-section";
import { renderWithClient, waitFor } from "../../../test-utils";

const sampleConfig = {
  imageRootDirectory: "/root",
  configDirectory: "/cfg",
  logDirectory: "/log",
  backupDirectory: "/backup",
  retentionCount: 5,
  idleBackupEnabled: false,
  idleBackupIncludeImages: false,
  idleMinutes: 15,
};

const sampleBackups = [
  {
    createdAt: "2024-02-20T10:30:00Z",
    includesImages: false,
    path: "/backup/2024-02-20T10-30-00.tar.gz",
  },
  {
    createdAt: "2024-03-15T08:00:00Z",
    includesImages: true,
    path: "/backup/2024-03-15T08-00-00.tar.gz",
  },
];

describe("BackupSection", () => {
  beforeEach(() => {
    getConfigMock.mockReset();
    updateConfigMock.mockReset();
    listBackupsMock.mockReset();
    createBackupMock.mockReset();
    restoreBackupMock.mockReset();
    deleteBackupMock.mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();

    getConfigMock.mockResolvedValue(sampleConfig);
  });

  test("shows a loading skeleton while the backup list is pending", () => {
    // Leave list promise unresolved.
    listBackupsMock.mockReturnValue(new Promise(() => undefined));
    const r = renderWithClient(<BackupSection />);
    try {
      expect(r.container.querySelector("[data-testid='backup-list-loading']")).not.toBeNull();
    } finally {
      r.unmount();
    }
  });

  test("renders each backup row with a formatted date and size info", async () => {
    listBackupsMock.mockResolvedValue(sampleBackups);
    const r = renderWithClient(<BackupSection />);
    try {
      await waitFor(() => r.container.querySelector("[data-testid='backup-list']") !== null);
      const rows = r.container.querySelectorAll("[data-testid^='backup-row-']");
      expect(rows.length).toBe(2);
      // The first row mentions "Database only" (no images) and the path.
      const firstText = rows[0].textContent ?? "";
      expect(firstText).toContain("Database only");
      expect(firstText).toContain("/backup/2024-02-20T10-30-00.tar.gz");
      // The second row mentions "Includes images".
      const secondText = rows[1].textContent ?? "";
      expect(secondText).toContain("Includes images");
    } finally {
      r.unmount();
    }
  });

  test("shows the EmptyState when there are no backups", async () => {
    listBackupsMock.mockResolvedValue([]);
    const r = renderWithClient(<BackupSection />);
    try {
      await waitFor(() =>
        (r.container.textContent ?? "").includes("No backups yet"),
      );
      expect(r.container.textContent).toContain("No backups yet");
    } finally {
      r.unmount();
    }
  });

  test("renders the backup destination from config", async () => {
    listBackupsMock.mockResolvedValue([]);
    const r = renderWithClient(<BackupSection />);
    try {
      await waitFor(() =>
        r.container.querySelector("[data-testid='backup-destination']") !== null,
      );
      const destination = r.container.querySelector(
        "[data-testid='backup-destination']",
      ) as HTMLElement;
      // waitFor above ensured the config query resolved; the value
      // mirrors the mock directly once the section re-renders.
      await waitFor(() => destination.textContent === "/backup");
      expect(destination.textContent).toBe("/backup");
    } finally {
      r.unmount();
    }
  });

  test("Create Backup button fires the mutation and surfaces a success toast", async () => {
    listBackupsMock.mockResolvedValue([]);
    createBackupMock.mockResolvedValue("/backup/2024-04-14T12-00-00.tar.gz");

    const r = renderWithClient(<BackupSection />);
    try {
      await waitFor(() =>
        r.container.querySelector("[data-testid='create-backup']") !== null,
      );
      const createBtn = r.container.querySelector(
        "[data-testid='create-backup']",
      ) as HTMLButtonElement;
      await act(async () => {
        createBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await waitFor(() => toastSuccess.mock.calls.length > 0);
      expect(createBackupMock).toHaveBeenCalledWith(false, "");
      expect(toastSuccess).toHaveBeenCalledWith(
        "Backup created",
        "/backup/2024-04-14T12-00-00.tar.gz",
      );
    } finally {
      r.unmount();
    }
  });

  test("Restore opens a ConfirmDialog and firing Confirm triggers the mutation", async () => {
    listBackupsMock.mockResolvedValue(sampleBackups);
    restoreBackupMock.mockResolvedValue(undefined);

    const r = renderWithClient(<BackupSection />);
    try {
      await waitFor(() => r.container.querySelector("[data-testid='backup-list']") !== null);
      const restoreBtn = r.container.querySelector(
        `[data-testid="backup-restore-${sampleBackups[0].path}"]`,
      ) as HTMLButtonElement;
      expect(restoreBtn).not.toBeNull();
      await act(async () => {
        restoreBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });

      // Confirm dialog is now open.
      await waitFor(() => document.querySelector("[data-testid='confirm-dialog']") !== null);
      const dialog = document.querySelector("[data-testid='confirm-dialog']") as HTMLElement;
      expect(dialog.getAttribute("data-variant")).toBe("danger");
      expect(dialog.textContent).toContain("This will overwrite your current data");

      const confirmBtn = document.querySelector(
        "[data-testid='confirm-dialog-confirm']",
      ) as HTMLButtonElement;
      await act(async () => {
        confirmBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });

      await waitFor(() => restoreBackupMock.mock.calls.length > 0);
      expect(restoreBackupMock).toHaveBeenCalledWith(
        sampleBackups[0].path,
        sampleBackups[0].includesImages,
        "",
      );
    } finally {
      r.unmount();
    }
  });

  test("Delete opens a ConfirmDialog and firing Confirm triggers the mutation", async () => {
    listBackupsMock.mockResolvedValue(sampleBackups);
    deleteBackupMock.mockResolvedValue(undefined);

    const r = renderWithClient(<BackupSection />);
    try {
      await waitFor(() => r.container.querySelector("[data-testid='backup-list']") !== null);
      const deleteBtn = r.container.querySelector(
        `[data-testid="backup-delete-${sampleBackups[1].path}"]`,
      ) as HTMLButtonElement;
      await act(async () => {
        deleteBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await waitFor(() => document.querySelector("[data-testid='confirm-dialog']") !== null);
      const confirmBtn = document.querySelector(
        "[data-testid='confirm-dialog-confirm']",
      ) as HTMLButtonElement;
      await act(async () => {
        confirmBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await waitFor(() => deleteBackupMock.mock.calls.length > 0);
      expect(deleteBackupMock).toHaveBeenCalledWith(sampleBackups[1].path);
    } finally {
      r.unmount();
    }
  });
});
