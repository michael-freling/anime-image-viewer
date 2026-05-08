/**
 * SettingsLayout — URL-routed settings shell with UnderlineTabBar + Outlet.
 *
 * Each settings section (General, Appearance, Backup, About) is a separate
 * nested route rendered via `<Outlet />`. The tab bar uses the shared
 * `UnderlineTabBar` component with NavLink-driven active states, matching
 * the anime detail page pattern.
 */
import { Box } from "@chakra-ui/react";
import { Settings, Palette, Database, Info } from "lucide-react";
import { Outlet } from "react-router";

import {
  UnderlineTabBar,
  type TabItem,
} from "../../components/shared/underline-tab-bar";

export const SETTINGS_TABS: readonly TabItem[] = [
  { to: "general", label: "General", icon: Settings },
  { to: "appearance", label: "Appearance", icon: Palette },
  { to: "backup", label: "Backup", icon: Database },
  { to: "about", label: "About", icon: Info },
] as const;

export function SettingsLayout(): JSX.Element {
  return (
    <Box
      data-testid="settings-layout"
      display="flex"
      flexDirection="column"
      minHeight="100%"
    >
      <UnderlineTabBar items={SETTINGS_TABS} ariaLabel="Settings" />

      <Box
        as="section"
        data-testid="settings-tab-panel"
        flex="1"
        maxWidth="760px"
        width="full"
        mx="auto"
        px={{ base: "4", md: "6" }}
        py={{ base: "3", md: "4" }}
      >
        <Outlet />
      </Box>
    </Box>
  );
}

export default SettingsLayout;
