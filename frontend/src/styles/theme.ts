/**
 * Chakra v3 theme system for AnimeVault.
 *
 * Tokens mirror ui-design.md §1 Design Tokens exactly. Semantic tokens wire
 * dark (default) and light values to the same name so components can reference
 * a single token and automatically adapt to color mode.
 *
 * Tag category colors come from ui-design.md §4.3. Each category has a
 * background/foreground pair. Order is consistent: dark pair for dark mode,
 * light pair for light mode.
 */
import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";

const appConfig = defineConfig({
  // Persist color mode with the `class` strategy so next-themes can drive it.
  globalCss: {
    "html, body": {
      bg: "bg.base",
      color: "fg",
    },
  },
  theme: {
    tokens: {
      fonts: {
        body: { value: "'Inter Variable', Inter, system-ui, sans-serif" },
        heading: { value: "'Inter Variable', Inter, system-ui, sans-serif" },
      },
      radii: {
        sm: { value: "6px" },
        md: { value: "10px" },
        lg: { value: "16px" },
        pill: { value: "24px" },
      },
      // 4px spacing base unit: 4, 8, 12, 16, 24, 32, 48, 64, 80.
      spacing: {
        "0.5": { value: "2px" },
        "1": { value: "4px" },
        "2": { value: "8px" },
        "3": { value: "12px" },
        "4": { value: "16px" },
        "6": { value: "24px" },
        "8": { value: "32px" },
        "12": { value: "48px" },
        "16": { value: "64px" },
        "20": { value: "80px" },
      },
      colors: {
        // Dark palette (default) — ui-design.md §1.
        darkBackground: { value: "#0f0f14" },
        darkSurface: { value: "#1e1e2e" },
        darkSurfaceAlt: { value: "#16161e" },
        darkPrimary: { value: "#818cf8" },
        darkPrimaryHover: { value: "#6366f1" },
        darkPrimarySubtle: { value: "#312e81" },
        darkText: { value: "#f1f5f9" },
        darkTextSecondary: { value: "#94a3b8" },
        darkTextMuted: { value: "#64748b" },
        darkTextDim: { value: "#475569" },
        darkBorder: { value: "#2d2d3f" },
        darkDanger: { value: "#fca5a5" },
        darkDangerBg: { value: "#3b1a1a" },
        darkSuccess: { value: "#6ee7b7" },
        darkSuccessBg: { value: "#1a3a2e" },
        darkWarning: { value: "#fcd34d" },
        darkWarningBg: { value: "#3b2600" },

        // Light palette — ui-design.md §1.
        lightBackground: { value: "#fafafa" },
        lightSurface: { value: "#ffffff" },
        lightSurfaceAlt: { value: "#f8fafc" },
        lightPrimary: { value: "#6366f1" },
        lightPrimaryHover: { value: "#4f46e5" },
        lightPrimarySubtle: { value: "#eef2ff" },
        lightText: { value: "#111827" },
        lightTextSecondary: { value: "#6b7280" },
        lightTextMuted: { value: "#9ca3af" },
        lightBorder: { value: "#e5e7eb" },

        // Tag category pairs — ui-design.md §4.3 (dark bg / dark fg).
        tagSceneDarkBg: { value: "#312e81" },
        tagSceneDarkFg: { value: "#818cf8" },
        tagNatureDarkBg: { value: "#1a3a2e" },
        tagNatureDarkFg: { value: "#6ee7b7" },
        tagLocationDarkBg: { value: "#3b2600" },
        tagLocationDarkFg: { value: "#fcd34d" },
        tagMoodDarkBg: { value: "#3b1a1a" },
        tagMoodDarkFg: { value: "#fca5a5" },
        tagCharacterDarkBg: { value: "#2e1065" },
        tagCharacterDarkFg: { value: "#c084fc" },
        tagUncategorizedDarkBg: { value: "#1e1e2e" },
        tagUncategorizedDarkFg: { value: "#94a3b8" },

        // Tag category pairs — light counterparts.
        // Light mode uses a subtle background (primary-subtle style) and a
        // saturated foreground so chips stay readable on light surfaces.
        tagSceneLightBg: { value: "#eef2ff" },
        tagSceneLightFg: { value: "#4338ca" },
        tagNatureLightBg: { value: "#ecfdf5" },
        tagNatureLightFg: { value: "#047857" },
        tagLocationLightBg: { value: "#fffbeb" },
        tagLocationLightFg: { value: "#b45309" },
        tagMoodLightBg: { value: "#fef2f2" },
        tagMoodLightFg: { value: "#b91c1c" },
        tagCharacterLightBg: { value: "#f5f3ff" },
        tagCharacterLightFg: { value: "#7c3aed" },
        tagUncategorizedLightBg: { value: "#f1f5f9" },
        tagUncategorizedLightFg: { value: "#475569" },
      },
    },
    semanticTokens: {
      colors: {
        // Page background — mapped by color mode.
        "bg.base": {
          value: { base: "{colors.lightBackground}", _dark: "{colors.darkBackground}" },
        },
        "bg.surface": {
          value: { base: "{colors.lightSurface}", _dark: "{colors.darkSurface}" },
        },
        "bg.surfaceAlt": {
          value: { base: "{colors.lightSurfaceAlt}", _dark: "{colors.darkSurfaceAlt}" },
        },

        // Text hierarchy.
        fg: { value: { base: "{colors.lightText}", _dark: "{colors.darkText}" } },
        "fg.secondary": {
          value: { base: "{colors.lightTextSecondary}", _dark: "{colors.darkTextSecondary}" },
        },
        "fg.muted": {
          value: { base: "{colors.lightTextMuted}", _dark: "{colors.darkTextMuted}" },
        },
        // text-dim is dark-only per the spec; fall back to muted in light mode.
        "fg.dim": {
          value: { base: "{colors.lightTextMuted}", _dark: "{colors.darkTextDim}" },
        },

        // Primary palette.
        primary: {
          value: { base: "{colors.lightPrimary}", _dark: "{colors.darkPrimary}" },
        },
        "primary.hover": {
          value: { base: "{colors.lightPrimaryHover}", _dark: "{colors.darkPrimaryHover}" },
        },
        "primary.subtle": {
          value: { base: "{colors.lightPrimarySubtle}", _dark: "{colors.darkPrimarySubtle}" },
        },

        // Edges.
        border: {
          value: { base: "{colors.lightBorder}", _dark: "{colors.darkBorder}" },
        },

        // Status — spec lists dark values only; in light mode we reuse the
        // same saturated foreground against a soft background.
        danger: {
          value: { base: "{colors.darkDanger}", _dark: "{colors.darkDanger}" },
        },
        "danger.bg": {
          value: { base: "{colors.tagMoodLightBg}", _dark: "{colors.darkDangerBg}" },
        },
        success: {
          value: { base: "{colors.darkSuccess}", _dark: "{colors.darkSuccess}" },
        },
        "success.bg": {
          value: { base: "{colors.tagNatureLightBg}", _dark: "{colors.darkSuccessBg}" },
        },
        warning: {
          value: { base: "{colors.darkWarning}", _dark: "{colors.darkWarning}" },
        },
        "warning.bg": {
          value: { base: "{colors.tagLocationLightBg}", _dark: "{colors.darkWarningBg}" },
        },

        // Tag chip category pairs (ui-design §4.3).
        "tag.scene.bg": {
          value: { base: "{colors.tagSceneLightBg}", _dark: "{colors.tagSceneDarkBg}" },
        },
        "tag.scene.fg": {
          value: { base: "{colors.tagSceneLightFg}", _dark: "{colors.tagSceneDarkFg}" },
        },
        "tag.nature.bg": {
          value: { base: "{colors.tagNatureLightBg}", _dark: "{colors.tagNatureDarkBg}" },
        },
        "tag.nature.fg": {
          value: { base: "{colors.tagNatureLightFg}", _dark: "{colors.tagNatureDarkFg}" },
        },
        "tag.location.bg": {
          value: { base: "{colors.tagLocationLightBg}", _dark: "{colors.tagLocationDarkBg}" },
        },
        "tag.location.fg": {
          value: { base: "{colors.tagLocationLightFg}", _dark: "{colors.tagLocationDarkFg}" },
        },
        "tag.mood.bg": {
          value: { base: "{colors.tagMoodLightBg}", _dark: "{colors.tagMoodDarkBg}" },
        },
        "tag.mood.fg": {
          value: { base: "{colors.tagMoodLightFg}", _dark: "{colors.tagMoodDarkFg}" },
        },
        "tag.character.bg": {
          value: { base: "{colors.tagCharacterLightBg}", _dark: "{colors.tagCharacterDarkBg}" },
        },
        "tag.character.fg": {
          value: { base: "{colors.tagCharacterLightFg}", _dark: "{colors.tagCharacterDarkFg}" },
        },
        "tag.uncategorized.bg": {
          value: {
            base: "{colors.tagUncategorizedLightBg}",
            _dark: "{colors.tagUncategorizedDarkBg}",
          },
        },
        "tag.uncategorized.fg": {
          value: {
            base: "{colors.tagUncategorizedLightFg}",
            _dark: "{colors.tagUncategorizedDarkFg}",
          },
        },
      },
    },
  },
});

// The exported system is passed to <ChakraProvider value={system} /> in
// src/app/providers.tsx.
const system = createSystem(defaultConfig, appConfig);

export default system;
