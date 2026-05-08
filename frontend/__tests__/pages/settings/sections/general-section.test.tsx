/**
 * Tests for the GeneralSection — directory configuration.
 *
 * Covers:
 *   - loading skeleton while config is pending
 *   - error alert + retry when the config query rejects
 *   - Browse button calls `SelectDirectory` and updates the draft input
 *   - Save calls `UpdateConfig` with the draft and surfaces a success toast
 *   - Save failure surfaces an error toast
 *   - Browse picker rejection surfaces an error toast
 *
 * Spec: ui-design.md §3.7 (Settings — General) and §2.8 (General edit flow).
 */
const getConfigMock = jest.fn();
const updateConfigMock = jest.fn();
const selectDirectoryMock = jest.fn();

jest.mock("../../../../src/lib/api", () => ({
  __esModule: true,
  ConfigFrontendService: {
    GetConfig: (...args: unknown[]) => getConfigMock(...args),
    UpdateConfig: (...args: unknown[]) => updateConfigMock(...args),
    SelectDirectory: (...args: unknown[]) => selectDirectoryMock(...args),
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

import { GeneralSection } from "../../../../src/pages/settings/sections/general-section";
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

describe("GeneralSection", () => {
  beforeEach(() => {
    getConfigMock.mockReset();
    updateConfigMock.mockReset();
    selectDirectoryMock.mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();
  });

  test("shows a loading skeleton while the config is pending", () => {
    // Leave the promise unresolved so `isLoading` stays true.
    getConfigMock.mockReturnValue(new Promise(() => undefined));
    const r = renderWithClient(<GeneralSection />);
    try {
      // Skeleton rows live inside `[data-testid='general-section']`.
      const section = r.container.querySelector(
        "[data-testid='general-section']",
      );
      expect(section).not.toBeNull();
      // No directory fields until the query resolves.
      expect(
        r.container.querySelector("[data-testid='field-imageRootDirectory']"),
      ).toBeNull();
    } finally {
      r.unmount();
    }
  });

  test("renders an ErrorAlert when the config query fails", async () => {
    getConfigMock.mockRejectedValue(new Error("cfg down"));
    const r = renderWithClient(<GeneralSection />);
    try {
      await waitFor(
        () => r.container.querySelector("[role='alert']") !== null,
      );
      const alert = r.container.querySelector("[role='alert']");
      expect(alert?.textContent).toContain("Couldn't load settings");
      expect(alert?.textContent).toContain("cfg down");
      // Clicking Retry triggers refetch (lines 70–72).
      const retry = Array.from(
        r.container.querySelectorAll("button"),
      ).find((btn) => (btn.textContent ?? "").trim() === "Retry") as
        | HTMLButtonElement
        | undefined;
      expect(retry).toBeDefined();
      // After refetch it calls GetConfig again at least once more.
      const callsBefore = getConfigMock.mock.calls.length;
      await act(async () => {
        retry!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await waitFor(
        () => getConfigMock.mock.calls.length > callsBefore,
      );
      expect(getConfigMock.mock.calls.length).toBeGreaterThan(callsBefore);
    } finally {
      r.unmount();
    }
  });

  test("renders each directory input with the config values", async () => {
    getConfigMock.mockResolvedValue(sampleConfig);
    const r = renderWithClient(<GeneralSection />);
    try {
      await waitFor(
        () =>
          r.container.querySelector(
            "[data-testid='field-imageRootDirectory']",
          ) !== null,
      );
      const image = r.container.querySelector(
        "[data-testid='field-imageRootDirectory']",
      ) as HTMLInputElement;
      const cfg = r.container.querySelector(
        "[data-testid='field-configDirectory']",
      ) as HTMLInputElement;
      const log = r.container.querySelector(
        "[data-testid='field-logDirectory']",
      ) as HTMLInputElement;
      const backup = r.container.querySelector(
        "[data-testid='field-backupDirectory']",
      ) as HTMLInputElement;
      expect(image.value).toBe("/root");
      expect(cfg.value).toBe("/cfg");
      expect(log.value).toBe("/log");
      expect(backup.value).toBe("/backup");
      // Save starts disabled because draft equals server.
      const save = r.container.querySelector(
        "[data-testid='save-config']",
      ) as HTMLButtonElement;
      expect(save.disabled).toBe(true);
    } finally {
      r.unmount();
    }
  });

  test("Browse updates the draft and enables Save", async () => {
    getConfigMock.mockResolvedValue(sampleConfig);
    selectDirectoryMock.mockResolvedValue("/new-root");
    const r = renderWithClient(<GeneralSection />);
    try {
      await waitFor(
        () =>
          r.container.querySelector(
            "[data-testid='browse-imageRootDirectory']",
          ) !== null,
      );
      const browse = r.container.querySelector(
        "[data-testid='browse-imageRootDirectory']",
      ) as HTMLButtonElement;
      await act(async () => {
        browse.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await waitFor(() => {
        const input = r.container.querySelector(
          "[data-testid='field-imageRootDirectory']",
        ) as HTMLInputElement | null;
        return input?.value === "/new-root";
      });
      // Save is now enabled since the draft diverged from the server.
      const save = r.container.querySelector(
        "[data-testid='save-config']",
      ) as HTMLButtonElement;
      expect(save.disabled).toBe(false);
    } finally {
      r.unmount();
    }
  });

  test("Browse that returns empty string keeps the draft unchanged", async () => {
    getConfigMock.mockResolvedValue(sampleConfig);
    selectDirectoryMock.mockResolvedValue("");
    const r = renderWithClient(<GeneralSection />);
    try {
      await waitFor(
        () =>
          r.container.querySelector(
            "[data-testid='browse-configDirectory']",
          ) !== null,
      );
      const browse = r.container.querySelector(
        "[data-testid='browse-configDirectory']",
      ) as HTMLButtonElement;
      await act(async () => {
        browse.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      // Wait for the async handler to settle; value remains original.
      const input = r.container.querySelector(
        "[data-testid='field-configDirectory']",
      ) as HTMLInputElement;
      expect(input.value).toBe("/cfg");
      // No toast either way.
      expect(toastError).not.toHaveBeenCalled();
    } finally {
      r.unmount();
    }
  });

  test("Browse failure surfaces an error toast", async () => {
    getConfigMock.mockResolvedValue(sampleConfig);
    selectDirectoryMock.mockRejectedValue(new Error("picker closed"));
    const r = renderWithClient(<GeneralSection />);
    try {
      await waitFor(
        () =>
          r.container.querySelector(
            "[data-testid='browse-logDirectory']",
          ) !== null,
      );
      const browse = r.container.querySelector(
        "[data-testid='browse-logDirectory']",
      ) as HTMLButtonElement;
      await act(async () => {
        browse.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await waitFor(() => toastError.mock.calls.length > 0);
      expect(toastError).toHaveBeenCalledWith(
        "Couldn't open folder picker",
        "picker closed",
      );
    } finally {
      r.unmount();
    }
  });

  test("Save commits the draft and shows a success toast", async () => {
    getConfigMock.mockResolvedValue(sampleConfig);
    selectDirectoryMock.mockResolvedValue("/mutated");
    updateConfigMock.mockResolvedValue(undefined);
    const r = renderWithClient(<GeneralSection />);
    try {
      await waitFor(
        () =>
          r.container.querySelector(
            "[data-testid='browse-backupDirectory']",
          ) !== null,
      );
      // Make the draft dirty so Save is enabled.
      const browse = r.container.querySelector(
        "[data-testid='browse-backupDirectory']",
      ) as HTMLButtonElement;
      await act(async () => {
        browse.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await waitFor(() => {
        const save = r.container.querySelector(
          "[data-testid='save-config']",
        ) as HTMLButtonElement;
        return !save.disabled;
      });
      const save = r.container.querySelector(
        "[data-testid='save-config']",
      ) as HTMLButtonElement;
      await act(async () => {
        save.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await waitFor(() => updateConfigMock.mock.calls.length > 0);
      const [payload] = updateConfigMock.mock.calls[0] as [typeof sampleConfig];
      expect(payload.backupDirectory).toBe("/mutated");
      await waitFor(() => toastSuccess.mock.calls.length > 0);
      expect(toastSuccess).toHaveBeenCalledWith(
        "Settings saved",
        expect.any(String),
      );
    } finally {
      r.unmount();
    }
  });

  test("Save failure surfaces an error toast", async () => {
    getConfigMock.mockResolvedValue(sampleConfig);
    selectDirectoryMock.mockResolvedValue("/mutated");
    updateConfigMock.mockRejectedValue(new Error("disk full"));
    const r = renderWithClient(<GeneralSection />);
    try {
      await waitFor(
        () =>
          r.container.querySelector(
            "[data-testid='browse-imageRootDirectory']",
          ) !== null,
      );
      const browse = r.container.querySelector(
        "[data-testid='browse-imageRootDirectory']",
      ) as HTMLButtonElement;
      await act(async () => {
        browse.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await waitFor(() => {
        const save = r.container.querySelector(
          "[data-testid='save-config']",
        ) as HTMLButtonElement;
        return !save.disabled;
      });
      const save = r.container.querySelector(
        "[data-testid='save-config']",
      ) as HTMLButtonElement;
      await act(async () => {
        save.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await waitFor(() => toastError.mock.calls.length > 0);
      expect(toastError).toHaveBeenCalledWith(
        "Couldn't save settings",
        "disk full",
      );
    } finally {
      r.unmount();
    }
  });
});
