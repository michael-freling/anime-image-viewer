/**
 * Tests for `AppShell` — the top-level layout shell.
 *
 * Verifies the data-sidebar-expanded attribute reflects the ui-store, and the
 * shell renders nav landmarks for both the icon rail and bottom tab bar.
 */
import { AppShell } from "../../../src/components/layout/app-shell";
import { useUIStore } from "../../../src/stores/ui-store";
import { renderWithClient } from "../../test-utils";

describe("AppShell", () => {
  beforeEach(() => {
    // Reset the UI store so each test starts with the default
    // `sidebarExpanded: false` state.
    useUIStore.setState({ sidebarExpanded: false });
  });

  test("renders with data-sidebar-expanded='false' by default", () => {
    const { container, unmount } = renderWithClient(<AppShell />);
    try {
      const shell = container.querySelector("[data-sidebar-expanded]");
      expect(shell).not.toBeNull();
      expect(shell?.getAttribute("data-sidebar-expanded")).toBe("false");
    } finally {
      unmount();
    }
  });

  test("data-sidebar-expanded flips to 'true' when the store says so", () => {
    // Pre-set the store before mount so the first render reflects the
    // expanded sidebar.
    useUIStore.setState({ sidebarExpanded: true });
    const { container, unmount } = renderWithClient(<AppShell />);
    try {
      const shell = container.querySelector("[data-sidebar-expanded]");
      expect(shell?.getAttribute("data-sidebar-expanded")).toBe("true");
    } finally {
      unmount();
    }
  });

  test("renders the primary navigation landmark", () => {
    const { container, unmount } = renderWithClient(<AppShell />);
    try {
      const navs = container.querySelectorAll('nav[aria-label="Primary"]');
      expect(navs.length).toBeGreaterThan(0);
    } finally {
      unmount();
    }
  });
});
