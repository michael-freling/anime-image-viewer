/**
 * Barrel export for the Settings page.
 *
 * Re-exports both the named `SettingsPage` component and the default export
 * so `createBrowserRouter` and test utilities can reach the page through
 * the directory entry point.
 */
export { default, SettingsPage } from "./settings-page";
export type { SettingsSectionId } from "./settings-page";
