/**
 * Chrome-level UI state — command palette visibility, sidebar expansion,
 * preferred theme.
 *
 * Theme is persisted via zustand's `persist` middleware keyed by localStorage.
 * We picked persist over `@mantine/hooks`' `useLocalStorage` because the
 * store is already the source of truth for other UI bits; duplicating the
 * theme into a hook would split state and invite drift.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type ThemePreference = "light" | "dark" | "system";

export interface UIState {
  commandPaletteOpen: boolean;
  sidebarExpanded: boolean;
  theme: ThemePreference;

  setCommandPaletteOpen: (open: boolean) => void;
  toggleCommandPalette: () => void;
  setSidebarExpanded: (expanded: boolean) => void;
  toggleSidebar: () => void;
  setTheme: (theme: ThemePreference) => void;
}

const STORAGE_KEY = "animevault:ui";

// Safe storage: tests (or SSR) may not have window.localStorage, so we fall
// back to a noop to avoid throwing at import time.
const safeStorage = () =>
  typeof window !== "undefined" && window.localStorage
    ? createJSONStorage(() => window.localStorage)
    : createJSONStorage(() => ({
        getItem: () => null,
        setItem: () => undefined,
        removeItem: () => undefined,
      }));

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      commandPaletteOpen: false,
      sidebarExpanded: false,
      theme: "dark",

      setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
      toggleCommandPalette: () =>
        set({ commandPaletteOpen: !get().commandPaletteOpen }),
      setSidebarExpanded: (expanded) => set({ sidebarExpanded: expanded }),
      toggleSidebar: () =>
        set({ sidebarExpanded: !get().sidebarExpanded }),
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: STORAGE_KEY,
      storage: safeStorage(),
      // Persist only durable preferences; transient chrome state resets on
      // every app launch.
      partialize: (state) => ({ theme: state.theme }),
    },
  ),
);
