/**
 * SettingsPage smoke tests.
 *
 * Focus: the tab bar navigates between sections, and both responsive
 * variants render into the DOM (visibility is handled by CSS, not by
 * conditional rendering).
 *
 * Rationale for `jest.mock("../../../src/lib/api", ...)`: each section
 * dispatches Wails service calls on mount. Mocking at module boundary
 * keeps these tests fast, deterministic, and decoupled from binding
 * generation.
 */
const getConfigMock = jest.fn();
const updateConfigMock = jest.fn();
const listBackupsMock = jest.fn();
const createBackupMock = jest.fn();
const restoreBackupMock = jest.fn();
const deleteBackupMock = jest.fn();
const selectDirectoryMock = jest.fn();

jest.mock("../../../src/lib/api", () => ({
  __esModule: true,
  ConfigFrontendService: {
    GetConfig: (...args: unknown[]) => getConfigMock(...args),
    UpdateConfig: (...args: unknown[]) => updateConfigMock(...args),
    SelectDirectory: (...args: unknown[]) => selectDirectoryMock(...args),
  },
  BackupFrontendService: {
    ListBackups: (...args: unknown[]) => listBackupsMock(...args),
    Backup: (...args: unknown[]) => createBackupMock(...args),
    Restore: (...args: unknown[]) => restoreBackupMock(...args),
    DeleteBackup: (...args: unknown[]) => deleteBackupMock(...args),
  },
}));

import { act } from "react-dom/test-utils";

import { SettingsPage } from "../../../src/pages/settings";
import { renderWithClient, waitFor } from "../../test-utils";

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

describe("SettingsPage", () => {
  beforeEach(() => {
    getConfigMock.mockReset();
    updateConfigMock.mockReset();
    listBackupsMock.mockReset();
    createBackupMock.mockReset();
    restoreBackupMock.mockReset();
    deleteBackupMock.mockReset();
    selectDirectoryMock.mockReset();

    // Default: every query resolves quickly so the page stabilises.
    getConfigMock.mockResolvedValue(sampleConfig);
    listBackupsMock.mockResolvedValue([]);
  });

  test("renders the page header and all four tab triggers", async () => {
    const r = renderWithClient(<SettingsPage />);
    try {
      expect(r.container.textContent).toContain("Settings");
      // Tab triggers exist for all four sections.
      expect(r.container.querySelector("[data-testid='settings-tab-general']")).not.toBeNull();
      expect(
        r.container.querySelector("[data-testid='settings-tab-appearance']"),
      ).not.toBeNull();
      expect(r.container.querySelector("[data-testid='settings-tab-backup']")).not.toBeNull();
      expect(r.container.querySelector("[data-testid='settings-tab-about']")).not.toBeNull();
    } finally {
      r.unmount();
    }
  });

  test("General tab is selected by default", () => {
    const r = renderWithClient(<SettingsPage />);
    try {
      const generalTab = r.container.querySelector(
        "[data-testid='settings-tab-general']",
      ) as HTMLElement;
      expect(generalTab.getAttribute("aria-selected")).toBe("true");
      expect(generalTab.getAttribute("data-active")).toBe("true");
    } finally {
      r.unmount();
    }
  });

  test("clicking Appearance tab reveals the appearance panel", async () => {
    const r = renderWithClient(<SettingsPage />);
    try {
      const appearanceTab = r.container.querySelector(
        "[data-testid='settings-tab-appearance']",
      ) as HTMLElement;
      await act(async () => {
        appearanceTab.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });

      // The desktop tabpanel should now wrap the appearance section.
      const panel = r.container.querySelector(
        "[data-testid='settings-tabpanel-appearance']",
      );
      expect(panel).not.toBeNull();
      // The theme radiogroup is inside the appearance section.
      expect(r.container.querySelector("[data-testid='theme-radiogroup']")).not.toBeNull();
    } finally {
      r.unmount();
    }
  });

  test("clicking Backup tab reveals the backup panel", async () => {
    const r = renderWithClient(<SettingsPage />);
    try {
      const backupTab = r.container.querySelector(
        "[data-testid='settings-tab-backup']",
      ) as HTMLElement;
      await act(async () => {
        backupTab.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      const panel = r.container.querySelector("[data-testid='settings-tabpanel-backup']");
      expect(panel).not.toBeNull();
      expect(r.container.querySelector("[data-testid='backup-section']")).not.toBeNull();
    } finally {
      r.unmount();
    }
  });

  test("clicking About tab reveals the about panel", async () => {
    const r = renderWithClient(<SettingsPage />);
    try {
      const aboutTab = r.container.querySelector(
        "[data-testid='settings-tab-about']",
      ) as HTMLElement;
      await act(async () => {
        aboutTab.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      const panel = r.container.querySelector("[data-testid='settings-tabpanel-about']");
      expect(panel).not.toBeNull();
      expect(r.container.querySelector("[data-testid='about-version']")).not.toBeNull();
    } finally {
      r.unmount();
    }
  });

  test("mounts both desktop and mobile layouts — CSS decides which is visible", async () => {
    const r = renderWithClient(<SettingsPage />);
    try {
      // Wait for config to settle so section content actually renders.
      await waitFor(
        () =>
          r.container.querySelector("[data-testid='settings-desktop']") !== null,
      );
      expect(r.container.querySelector("[data-testid='settings-desktop']")).not.toBeNull();
      expect(r.container.querySelector("[data-testid='settings-mobile']")).not.toBeNull();
    } finally {
      r.unmount();
    }
  });

  test("mobile layout surfaces every section group with a label", () => {
    const r = renderWithClient(<SettingsPage />);
    try {
      expect(r.container.querySelector("[data-testid='settings-group-general']")).not.toBeNull();
      expect(
        r.container.querySelector("[data-testid='settings-group-appearance']"),
      ).not.toBeNull();
      expect(r.container.querySelector("[data-testid='settings-group-backup']")).not.toBeNull();
      expect(r.container.querySelector("[data-testid='settings-group-about']")).not.toBeNull();
    } finally {
      r.unmount();
    }
  });
});
