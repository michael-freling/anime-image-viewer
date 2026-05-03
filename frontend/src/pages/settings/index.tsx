/**
 * Barrel export for the Settings page.
 *
 * Re-exports the layout component (used by the router) and individual
 * section components for nested route rendering.
 */
export { default, SettingsLayout, SETTINGS_TABS } from "./settings-layout";
export { GeneralSection } from "./sections/general-section";
export { AppearanceSection } from "./sections/appearance-section";
export { BackupSection } from "./sections/backup-section";
export { AboutSection } from "./sections/about-section";
