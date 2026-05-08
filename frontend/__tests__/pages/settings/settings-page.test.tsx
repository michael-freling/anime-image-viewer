/**
 * Settings layout + routing tests.
 *
 * Focus: the UnderlineTabBar renders all four tab links, the index route
 * redirects to /settings/general, and each sub-route renders the correct
 * section component.
 *
 * Uses `renderRoutes` (createMemoryRouter + RouterProvider) so nested
 * routes and `<Navigate>` redirects behave exactly like in production.
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

import { Navigate } from "react-router";
import type { RouteObject } from "react-router";

import { SettingsLayout } from "../../../src/pages/settings/settings-layout";
import { GeneralSection } from "../../../src/pages/settings/sections/general-section";
import { AppearanceSection } from "../../../src/pages/settings/sections/appearance-section";
import { BackupSection } from "../../../src/pages/settings/sections/backup-section";
import { AboutSection } from "../../../src/pages/settings/sections/about-section";
import { renderRoutes, waitFor } from "../../test-utils";

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

const settingsRoutes: RouteObject[] = [
  {
    path: "settings",
    element: <SettingsLayout />,
    children: [
      { index: true, element: <Navigate to="general" replace /> },
      { path: "general", element: <GeneralSection /> },
      { path: "appearance", element: <AppearanceSection /> },
      { path: "backup", element: <BackupSection /> },
      { path: "about", element: <AboutSection /> },
    ],
  },
];

describe("SettingsLayout", () => {
  beforeEach(() => {
    getConfigMock.mockReset();
    updateConfigMock.mockReset();
    listBackupsMock.mockReset();
    createBackupMock.mockReset();
    restoreBackupMock.mockReset();
    deleteBackupMock.mockReset();
    selectDirectoryMock.mockReset();

    getConfigMock.mockResolvedValue(sampleConfig);
    listBackupsMock.mockResolvedValue([]);
  });

  test("renders the tab bar with all four tab links", async () => {
    const r = renderRoutes(settingsRoutes, {
      initialEntries: ["/settings/general"],
    });
    try {
      await waitFor(
        () => r.container.querySelector("[data-testid='settings-layout']") !== null,
      );
      const nav = r.container.querySelector("nav[aria-label='Settings']");
      expect(nav).not.toBeNull();
      expect(nav!.textContent).toContain("General");
      expect(nav!.textContent).toContain("Appearance");
      expect(nav!.textContent).toContain("Backup");
      expect(nav!.textContent).toContain("About");
    } finally {
      r.unmount();
    }
  });

  test("index route /settings redirects to /settings/general", async () => {
    const r = renderRoutes(settingsRoutes, {
      initialEntries: ["/settings"],
    });
    try {
      await waitFor(
        () => r.container.querySelector("[data-testid='general-section']") !== null,
      );
      expect(r.container.querySelector("[data-testid='general-section']")).not.toBeNull();
    } finally {
      r.unmount();
    }
  });

  test("/settings/general renders the GeneralSection", async () => {
    const r = renderRoutes(settingsRoutes, {
      initialEntries: ["/settings/general"],
    });
    try {
      await waitFor(
        () => r.container.querySelector("[data-testid='general-section']") !== null,
      );
      expect(r.container.querySelector("[data-testid='general-section']")).not.toBeNull();
    } finally {
      r.unmount();
    }
  });

  test("/settings/appearance renders the AppearanceSection", async () => {
    const r = renderRoutes(settingsRoutes, {
      initialEntries: ["/settings/appearance"],
    });
    try {
      await waitFor(
        () => r.container.querySelector("[data-testid='appearance-section']") !== null,
      );
      expect(r.container.querySelector("[data-testid='appearance-section']")).not.toBeNull();
      expect(r.container.querySelector("[data-testid='theme-radiogroup']")).not.toBeNull();
    } finally {
      r.unmount();
    }
  });

  test("/settings/backup renders the BackupSection", async () => {
    const r = renderRoutes(settingsRoutes, {
      initialEntries: ["/settings/backup"],
    });
    try {
      await waitFor(
        () => r.container.querySelector("[data-testid='backup-section']") !== null,
      );
      expect(r.container.querySelector("[data-testid='backup-section']")).not.toBeNull();
    } finally {
      r.unmount();
    }
  });

  test("/settings/about renders the AboutSection", async () => {
    const r = renderRoutes(settingsRoutes, {
      initialEntries: ["/settings/about"],
    });
    try {
      await waitFor(
        () => r.container.querySelector("[data-testid='about-section']") !== null,
      );
      expect(r.container.querySelector("[data-testid='about-section']")).not.toBeNull();
      expect(r.container.querySelector("[data-testid='about-version']")).not.toBeNull();
    } finally {
      r.unmount();
    }
  });

  test("General tab link has active state when on /settings/general", async () => {
    const r = renderRoutes(settingsRoutes, {
      initialEntries: ["/settings/general"],
    });
    try {
      await waitFor(
        () => r.container.querySelector("[data-testid='settings-layout']") !== null,
      );
      const nav = r.container.querySelector("nav[aria-label='Settings']");
      const activeTab = nav!.querySelector("[data-active='true']");
      expect(activeTab).not.toBeNull();
      expect(activeTab!.textContent).toContain("General");
    } finally {
      r.unmount();
    }
  });
});
