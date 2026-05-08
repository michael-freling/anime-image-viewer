/**
 * BottomTabBar — mobile-only primary navigation.
 *
 * Per ui-design.md §3.9: "4-tab bottom bar (Home, Search, Tags, Settings) --
 * No More menu, Backup is under Settings". The active tab uses a top border
 * in the primary color plus primary foreground for icon + label.
 *
 * Fixed to the bottom of the viewport. AppShell reserves bottom padding on
 * the main content so the last row of scrolling content is not obscured.
 */
import { Box, Stack, Text } from "@chakra-ui/react";
import { Home, Search, Settings, Tag } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { NavLink } from "react-router";

export interface BottomTabItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

export const BOTTOM_TAB_ITEMS: readonly BottomTabItem[] = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/search", label: "Search", icon: Search },
  { to: "/tags", label: "Tags", icon: Tag },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function TabItem({ item }: { item: BottomTabItem }): JSX.Element {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      style={{ textDecoration: "none", flex: 1 }}
    >
      {({ isActive }) => (
        <Box
          aria-current={isActive ? "page" : undefined}
          display="flex"
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          gap="1"
          py="2"
          h="full"
          // 44x44 minimum touch target (ui-design.md §7).
          minH="44px"
          color={isActive ? "primary" : "fg.secondary"}
          borderTopWidth="2px"
          borderTopColor={isActive ? "primary" : "transparent"}
          data-active={isActive ? "true" : undefined}
        >
          <Box aria-hidden="true" display="inline-flex">
            <Icon size={20} strokeWidth={2} />
          </Box>
          <Text as="span" fontSize="xs" fontWeight="medium">
            {item.label}
          </Text>
        </Box>
      )}
    </NavLink>
  );
}

export function BottomTabBar(): JSX.Element {
  return (
    <Box
      as="nav"
      aria-label="Primary"
      position="fixed"
      bottom="0"
      left="0"
      right="0"
      bg="bg.surfaceAlt"
      borderTopWidth="1px"
      borderTopColor="border"
      zIndex="docked"
    >
      <Stack
        as="ul"
        role="list"
        listStyleType="none"
        direction="row"
        gap="0"
        h="64px"
      >
        {BOTTOM_TAB_ITEMS.map((item) => (
          <Box
            as="li"
            key={item.to}
            flex="1"
            display="flex"
            alignItems="stretch"
          >
            <TabItem item={item} />
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

export default BottomTabBar;
