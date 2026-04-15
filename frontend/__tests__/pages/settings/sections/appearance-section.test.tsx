/**
 * Tests for the AppearanceSection — theme selector.
 *
 * We drive the real Zustand store (rather than mocking it) because the store
 * is the source of truth we want to verify. `beforeEach` resets the store
 * to the default so test ordering doesn't leak state.
 */
import { act } from "react-dom/test-utils";

import { AppearanceSection } from "../../../../src/pages/settings/sections/appearance-section";
import { useUIStore } from "../../../../src/stores/ui-store";
import { renderWithClient } from "../../../test-utils";

describe("AppearanceSection", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useUIStore.setState({
      commandPaletteOpen: false,
      sidebarExpanded: false,
      theme: "dark",
    });
  });

  test("renders the three theme options with the current theme pre-selected", () => {
    const r = renderWithClient(<AppearanceSection />);
    try {
      expect(r.container.querySelector("[data-testid='theme-option-light']")).not.toBeNull();
      const darkOption = r.container.querySelector(
        "[data-testid='theme-option-dark']",
      ) as HTMLElement;
      const systemOption = r.container.querySelector(
        "[data-testid='theme-option-system']",
      ) as HTMLElement;
      expect(darkOption).not.toBeNull();
      expect(systemOption).not.toBeNull();

      // Default "dark" is pre-selected.
      expect(darkOption.getAttribute("aria-checked")).toBe("true");
      expect(darkOption.getAttribute("data-selected")).toBe("true");
      expect(systemOption.getAttribute("aria-checked")).toBe("false");
    } finally {
      r.unmount();
    }
  });

  test("clicking a theme option updates the store", async () => {
    const r = renderWithClient(<AppearanceSection />);
    try {
      const lightOption = r.container.querySelector(
        "[data-testid='theme-option-light']",
      ) as HTMLElement;
      await act(async () => {
        lightOption.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      expect(useUIStore.getState().theme).toBe("light");

      const systemOption = r.container.querySelector(
        "[data-testid='theme-option-system']",
      ) as HTMLElement;
      await act(async () => {
        systemOption.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      expect(useUIStore.getState().theme).toBe("system");
    } finally {
      r.unmount();
    }
  });

  test("the radiogroup is labelled for screen readers", () => {
    const r = renderWithClient(<AppearanceSection />);
    try {
      const group = r.container.querySelector("[role='radiogroup']") as HTMLElement;
      expect(group).not.toBeNull();
      expect(group.getAttribute("aria-label")).toBe("Theme");
    } finally {
      r.unmount();
    }
  });
});
