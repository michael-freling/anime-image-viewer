/**
 * Tests for the UI store.
 *
 * Tests run under jest's jsdom environment (see jest.config.js), which gives
 * us a real window.localStorage that zustand's persist middleware can reach.
 *
 * We use the ES-module top-level `import` plus `jest.isolateModules` when a
 * test needs a fresh module evaluation (for rehydration assertions).
 */

import { useUIStore } from "../../src/stores/ui-store";
import type { useUIStore as UseUIStore } from "../../src/stores/ui-store";

const STORAGE_KEY = "animevault:ui";

function resetStore() {
  useUIStore.setState({
    commandPaletteOpen: false,
    sidebarExpanded: false,
    theme: "dark",
  });
}

describe("ui-store", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetStore();
  });

  test("commandPaletteOpen starts false and toggles", () => {
    expect(useUIStore.getState().commandPaletteOpen).toBe(false);

    useUIStore.getState().toggleCommandPalette();
    expect(useUIStore.getState().commandPaletteOpen).toBe(true);

    useUIStore.getState().toggleCommandPalette();
    expect(useUIStore.getState().commandPaletteOpen).toBe(false);
  });

  test("setCommandPaletteOpen accepts an explicit boolean", () => {
    useUIStore.getState().setCommandPaletteOpen(true);
    expect(useUIStore.getState().commandPaletteOpen).toBe(true);
  });

  test("sidebarExpanded toggles and sets", () => {
    expect(useUIStore.getState().sidebarExpanded).toBe(false);

    useUIStore.getState().toggleSidebar();
    expect(useUIStore.getState().sidebarExpanded).toBe(true);

    useUIStore.getState().setSidebarExpanded(false);
    expect(useUIStore.getState().sidebarExpanded).toBe(false);
  });

  test("setTheme writes the value to localStorage via persist", () => {
    useUIStore.getState().setTheme("light");
    expect(useUIStore.getState().theme).toBe("light");

    const raw = window.localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string);
    expect(parsed.state.theme).toBe("light");
  });

  test("transient UI state (sidebar, palette) is NOT persisted", () => {
    useUIStore.getState().setSidebarExpanded(true);
    useUIStore.getState().setCommandPaletteOpen(true);
    // setTheme is required to trigger a persist write at all.
    useUIStore.getState().setTheme("dark");

    const raw = window.localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string);
    expect(parsed.state.sidebarExpanded).toBeUndefined();
    expect(parsed.state.commandPaletteOpen).toBeUndefined();
  });

  test("theme rehydrates from localStorage on next module load", async () => {
    // Seed localStorage as if a previous session saved a preference.
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: { theme: "light" }, version: 0 }),
    );

    // Evaluate the module in isolation so the persist middleware rehydrates
    // from the seeded value rather than the current in-memory store.
    let rehydrated!: typeof UseUIStore;
    await jest.isolateModulesAsync(async () => {
      const mod = await import("../../src/stores/ui-store");
      rehydrated = mod.useUIStore;
    });

    expect(rehydrated.getState().theme).toBe("light");
  });

  test("falls back to a noop storage when window.localStorage is missing", async () => {
    // Simulate an environment (SSR, stripped jsdom) where localStorage is
    // unreachable. We remove the descriptor so the `typeof` + truthy check
    // inside `safeStorage` falls into the noop branch (lines 35–38).
    const originalDescriptor = Object.getOwnPropertyDescriptor(
      window,
      "localStorage",
    );
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get: () => undefined,
    });

    let storeModule!: typeof UseUIStore;
    let didThrow = false;
    try {
      await jest.isolateModulesAsync(async () => {
        const mod = await import("../../src/stores/ui-store");
        storeModule = mod.useUIStore;
        // Exercise the persist write path so the noop setItem/removeItem
        // getters run at least once.
        storeModule.getState().setTheme("light");
        storeModule.getState().setTheme("dark");
      });
    } catch {
      didThrow = true;
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(window, "localStorage", originalDescriptor);
      }
    }
    expect(didThrow).toBe(false);
    // The in-memory store still reflects our updates even though nothing
    // was persisted externally.
    expect(storeModule.getState().theme).toBe("dark");
  });
});
