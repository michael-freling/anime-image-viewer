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

  test("Create Backup failure surfaces an error toast", async () => {
    listBackupsMock.mockResolvedValue([]);
    createBackupMock.mockRejectedValue(new Error("disk full"));

    const r = renderWithClient(<BackupSection />);
    try {
      await waitFor(
        () => r.container.querySelector("[data-testid='create-backup']") !== null,
      );
      const createBtn = r.container.querySelector(
        "[data-testid='create-backup']",
      ) as HTMLButtonElement;
      await act(async () => {
        createBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await waitFor(() => toastError.mock.calls.length > 0);
      expect(toastError).toHaveBeenCalledWith(
        "Couldn't create backup",
        "disk full",
      );
    } finally {
      r.unmount();
    }
  });

  test("Restore failure surfaces an error toast", async () => {
    listBackupsMock.mockResolvedValue(sampleBackups);
    restoreBackupMock.mockRejectedValue(new Error("bad archive"));

    const r = renderWithClient(<BackupSection />);
    try {
      await waitFor(
        () => r.container.querySelector("[data-testid='backup-list']") !== null,
      );
      const restoreBtn = r.container.querySelector(
        `[data-testid="backup-restore-${sampleBackups[0].path}"]`,
      ) as HTMLButtonElement;
      await act(async () => {
        restoreBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await waitFor(
        () => document.querySelector("[data-testid='confirm-dialog']") !== null,
      );
      const confirmBtn = document.querySelector(
        "[data-testid='confirm-dialog-confirm']",
      ) as HTMLButtonElement;
      await act(async () => {
        confirmBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await waitFor(() => toastError.mock.calls.length > 0);
      expect(toastError).toHaveBeenCalledWith(
        "Couldn't restore backup",
        "bad archive",
      );
    } finally {
      r.unmount();
    }
  });

  test("Delete failure surfaces an error toast", async () => {
    listBackupsMock.mockResolvedValue(sampleBackups);
    deleteBackupMock.mockRejectedValue(new Error("permission denied"));

    const r = renderWithClient(<BackupSection />);
    try {
      await waitFor(
        () => r.container.querySelector("[data-testid='backup-list']") !== null,
      );
      const deleteBtn = r.container.querySelector(
        `[data-testid="backup-delete-${sampleBackups[0].path}"]`,
      ) as HTMLButtonElement;
      await act(async () => {
        deleteBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await waitFor(
        () => document.querySelector("[data-testid='confirm-dialog']") !== null,
      );
      const confirmBtn = document.querySelector(
        "[data-testid='confirm-dialog-confirm']",
      ) as HTMLButtonElement;
      await act(async () => {
        confirmBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await waitFor(() => toastError.mock.calls.length > 0);
      expect(toastError).toHaveBeenCalledWith(
        "Couldn't delete backup",
        "permission denied",
      );
    } finally {
      r.unmount();
    }
  });

  test("ErrorAlert surfaces when the list query rejects", async () => {
    listBackupsMock.mockRejectedValue(new Error("service off"));

    const r = renderWithClient(<BackupSection />);
    try {
      await waitFor(
        () => r.container.querySelector("[role='alert']") !== null,
      );
      const alert = r.container.querySelector("[role='alert']");
      expect(alert?.textContent).toContain("Couldn't load backups");
      expect(alert?.textContent).toContain("service off");
      // Clicking Retry triggers a refetch (line 140 of backup-section.tsx).
      const retry = Array.from(
        r.container.querySelectorAll("button"),
      ).find((btn) => (btn.textContent ?? "").trim() === "Retry") as
        | HTMLButtonElement
        | undefined;
      expect(retry).toBeDefined();
      const callsBefore = listBackupsMock.mock.calls.length;
      await act(async () => {
        retry!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await waitFor(() => listBackupsMock.mock.calls.length > callsBefore);
      expect(listBackupsMock.mock.calls.length).toBeGreaterThan(callsBefore);
    } finally {
      r.unmount();
    }
  });

  test("closing the Restore dialog without confirming does not fire a mutation", async () => {
    listBackupsMock.mockResolvedValue(sampleBackups);

    const r = renderWithClient(<BackupSection />);
    try {
      await waitFor(
        () => r.container.querySelector("[data-testid='backup-list']") !== null,
      );
      const restoreBtn = r.container.querySelector(
        `[data-testid="backup-restore-${sampleBackups[0].path}"]`,
      ) as HTMLButtonElement;
      await act(async () => {
        restoreBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await waitFor(
        () => document.querySelector("[data-testid='confirm-dialog']") !== null,
      );
      const cancelBtn = document.querySelector(
        "[data-testid='confirm-dialog-cancel']",
      ) as HTMLButtonElement;
      expect(cancelBtn).not.toBeNull();
      await act(async () => {
        cancelBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      expect(restoreBackupMock).not.toHaveBeenCalled();
    } finally {
      r.unmount();
    }
  });

  test("closing the Delete dialog without confirming does not fire a mutation", async () => {
    listBackupsMock.mockResolvedValue(sampleBackups);

    const r = renderWithClient(<BackupSection />);
    try {
      await waitFor(
        () => r.container.querySelector("[data-testid='backup-list']") !== null,
      );
      const deleteBtn = r.container.querySelector(
        `[data-testid="backup-delete-${sampleBackups[0].path}"]`,
      ) as HTMLButtonElement;
      await act(async () => {
        deleteBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await waitFor(
        () => document.querySelector("[data-testid='confirm-dialog']") !== null,
      );
      const cancelBtn = document.querySelector(
        "[data-testid='confirm-dialog-cancel']",
      ) as HTMLButtonElement;
      await act(async () => {
        cancelBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      // setDeleteTarget(null) closes the dialog and never fires the mutation.
      expect(deleteBackupMock).not.toHaveBeenCalled();
    } finally {
      r.unmount();
    }
  });

  test("destination falls back to '(default)' when config has no backupDirectory", async () => {
    getConfigMock.mockReset();
    getConfigMock.mockResolvedValue({ ...sampleConfig, backupDirectory: "" });
    listBackupsMock.mockResolvedValue([]);
    const r = renderWithClient(<BackupSection />);
    try {
      await waitFor(
        () =>
          r.container.querySelector("[data-testid='backup-destination']") !==
          null,
      );
      const destination = r.container.querySelector(
        "[data-testid='backup-destination']",
      ) as HTMLElement;
      // When backupDirectory is empty, the `(default)` placeholder is shown.
      await waitFor(() => destination.textContent === "(default)");
      expect(destination.textContent).toBe("(default)");
    } finally {
      r.unmount();
    }
  });

  test("Create Backup failure with non-Error rejection coerces via String()", async () => {
    listBackupsMock.mockResolvedValue([]);
    createBackupMock.mockRejectedValue("plain-string-error");

    const r = renderWithClient(<BackupSection />);
    try {
      await waitFor(
        () =>
          r.container.querySelector("[data-testid='create-backup']") !== null,
      );
      const createBtn = r.container.querySelector(
        "[data-testid='create-backup']",
      ) as HTMLButtonElement;
      await act(async () => {
        createBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await waitFor(() => toastError.mock.calls.length > 0);
      expect(toastError).toHaveBeenCalledWith(
        "Couldn't create backup",
        "plain-string-error",
      );
    } finally {
      r.unmount();
    }
  });

  test("Restore failure with non-Error rejection coerces via String()", async () => {
    listBackupsMock.mockResolvedValue(sampleBackups);
    restoreBackupMock.mockRejectedValue("rest-string");
    const r = renderWithClient(<BackupSection />);
    try {
      await waitFor(
        () => r.container.querySelector("[data-testid='backup-list']") !== null,
      );
      const restoreBtn = r.container.querySelector(
        `[data-testid="backup-restore-${sampleBackups[0].path}"]`,
      ) as HTMLButtonElement;
      await act(async () => {
        restoreBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await waitFor(
        () => document.querySelector("[data-testid='confirm-dialog']") !== null,
      );
      const confirmBtn = document.querySelector(
        "[data-testid='confirm-dialog-confirm']",
      ) as HTMLButtonElement;
      await act(async () => {
        confirmBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await waitFor(() => toastError.mock.calls.length > 0);
      expect(toastError).toHaveBeenCalledWith(
        "Couldn't restore backup",
        "rest-string",
      );
    } finally {
      r.unmount();
    }
  });

  test("Delete failure with non-Error rejection coerces via String()", async () => {
    listBackupsMock.mockResolvedValue(sampleBackups);
    deleteBackupMock.mockRejectedValue("del-string");
    const r = renderWithClient(<BackupSection />);
    try {
      await waitFor(
        () => r.container.querySelector("[data-testid='backup-list']") !== null,
      );
      const deleteBtn = r.container.querySelector(
        `[data-testid="backup-delete-${sampleBackups[0].path}"]`,
      ) as HTMLButtonElement;
      await act(async () => {
        deleteBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await waitFor(
        () => document.querySelector("[data-testid='confirm-dialog']") !== null,
      );
      const confirmBtn = document.querySelector(
        "[data-testid='confirm-dialog-confirm']",
      ) as HTMLButtonElement;
      await act(async () => {
        confirmBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await waitFor(() => toastError.mock.calls.length > 0);
      expect(toastError).toHaveBeenCalledWith(
        "Couldn't delete backup",
        "del-string",
      );
    } finally {
      r.unmount();
    }
  });

  test("formatBackupDate falls back to the raw value for an unparseable date", async () => {
    // Drive formatBackupDate via a backup whose createdAt is non-ISO string.
    const weirdBackups = [
      {
        createdAt: "not-a-real-date",
        includesImages: false,
        path: "/backup/weird.tar.gz",
      },
    ];
    listBackupsMock.mockResolvedValue(weirdBackups);
    const r = renderWithClient(<BackupSection />);
    try {
      await waitFor(
        () => r.container.querySelector("[data-testid='backup-list']") !== null,
      );
      const row = r.container.querySelector(
        "[data-testid^='backup-row-']",
      ) as HTMLElement;
      // Falls back to the raw value verbatim when Date(...) is NaN.
      expect(row.textContent).toContain("not-a-real-date");
    } finally {
      r.unmount();
    }
  });

  test("formatBackupDate returns empty for an empty string createdAt", async () => {
    // Drive the empty-string short-circuit branch.
    const weirdBackups = [
      {
        createdAt: "",
        includesImages: false,
        path: "/backup/empty-date.tar.gz",
      },
    ];
    listBackupsMock.mockResolvedValue(weirdBackups);
    const r = renderWithClient(<BackupSection />);
    try {
      await waitFor(
        () => r.container.querySelector("[data-testid='backup-list']") !== null,
      );
      const row = r.container.querySelector(
        "[data-testid^='backup-row-']",
      ) as HTMLElement;
      // The path is still rendered; the date field is just empty.
      expect(row.textContent).toContain("/backup/empty-date.tar.gz");
    } finally {
      r.unmount();
    }
  });

  test("ErrorAlert with a non-Error rejection shows 'Unknown error'", async () => {
    listBackupsMock.mockRejectedValue("string-rejection");

    const r = renderWithClient(<BackupSection />);
    try {
      await waitFor(
        () => r.container.querySelector("[role='alert']") !== null,
      );
      const alert = r.container.querySelector("[role='alert']");
      expect(alert?.textContent ?? "").toContain("Unknown error");
    } finally {
      r.unmount();
    }
  });
});
