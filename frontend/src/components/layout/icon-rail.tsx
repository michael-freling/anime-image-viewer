/**
 * IconRail — vertical primary navigation used on tablet and desktop.
 *
 * Mirrors the navigation wireframe (docs/static/wireframes/10-navigation-pattern.svg):
 *   - App brand mark at top
 *   - Primary group: Home, Search, Tags
 *   - Divider
 *   - Secondary group: Settings (pinned to bottom)
 *
 * Width is controlled by the AppShell grid column, not by the rail itself:
 *   - 64px collapsed (default on desktop & always on tablet)
 *   - 180px expanded (desktop hover, or ui-store.sidebarExpanded)
 *
 * The rail fills its column (100% width) and switches between icon-only and
 * icon+label layouts based on the rendered width via a container query,
 * which keeps the visual state in sync with the grid column width animation
 * without re-rendering on every tick.
 */
import { Box, Stack, Text } from "@chakra-ui/react";
import { Home, Search, Settings, Tag } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { NavLink } from "react-router";

export interface IconRailItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** When true, matches only the exact path (used for the Home index route). */
  end?: boolean;
}

export const PRIMARY_NAV_ITEMS: readonly IconRailItem[] = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/search", label: "Search", icon: Search },
  { to: "/tags", label: "Tags", icon: Tag },
] as const;

export const SECONDARY_NAV_ITEMS: readonly IconRailItem[] = [
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function RailItem({ item }: { item: IconRailItem }): JSX.Element {
  const Icon = item.icon;
  return (
    <NavLink to={item.to} end={item.end} style={{ textDecoration: "none" }}>
      {({ isActive }) => (
        <Box
          role="presentation"
          aria-current={isActive ? "page" : undefined}
          display="flex"
          alignItems="center"
          gap="3"
          px="3"
          mx="2"
          py="2"
          borderRadius="md"
          bg={isActive ? "primary.subtle" : "transparent"}
          color={isActive ? "primary" : "fg.secondary"}
          transition="background-color 120ms ease, color 120ms ease"
          _hover={{
            bg: isActive ? "primary.subtle" : "bg.surface",
            color: isActive ? "primary" : "fg",
          }}
          // When the rail is narrow (64px), center the icon and hide the
          // label. When wide (180px), show the label alongside.
          css={{
            // Show label only when the rail column is wide enough.
            "@container rail (max-width: 90px)": {
              justifyContent: "center",
              paddingLeft: 0,
              paddingRight: 0,
            },
            "@container rail (max-width: 90px) .rail-label": {
              display: "none",
            },
          }}
        >
          <Box
            as="span"
            display="inline-flex"
            alignItems="center"
            justifyContent="center"
            aria-hidden="true"
          >
            <Icon size={20} strokeWidth={2} />
          </Box>
          <Text
            className="rail-label"
            as="span"
            fontSize="sm"
            fontWeight="medium"
            whiteSpace="nowrap"
            overflow="hidden"
            textOverflow="ellipsis"
          >
            {item.label}
          </Text>
        </Box>
      )}
    </NavLink>
  );
}

export function IconRail(): JSX.Element {
  return (
    <Box
      as="nav"
      aria-label="Primary"
      w="100%"
      h="100%"
      bg="bg.surfaceAlt"
      borderRightWidth="1px"
      borderRightColor="border"
      display="flex"
      flexDirection="column"
      // Enable inline container queries so rail items can respond to the
      // effective width (64px vs 180px) without JS.
      css={{ containerType: "inline-size", containerName: "rail" }}
    >
      {/* Brand mark — square block on the left matches the wireframe dot. */}
      <Box
        display="flex"
        alignItems="center"
        gap="3"
        px="3"
        py="3"
        css={{
          "@container rail (max-width: 90px)": {
            justifyContent: "center",
            paddingLeft: 0,
            paddingRight: 0,
          },
          "@container rail (max-width: 90px) .rail-brand-text": {
            display: "none",
          },
        }}
      >
        <Box
          aria-hidden="true"
          w="40px"
          h="40px"
          borderRadius="md"
          bg="primary"
          color="white"
          display="flex"
          alignItems="center"
          justifyContent="center"
          fontWeight="700"
          fontSize="lg"
        >
          A
        </Box>
        <Text
          className="rail-brand-text"
          fontWeight="600"
          fontSize="md"
          color="fg"
        >
          AnimeVault
        </Text>
      </Box>

      <Stack
        as="ul"
        role="list"
        listStyleType="none"
        gap="1"
        mt="2"
        px="0"
        flex="1"
      >
        {PRIMARY_NAV_ITEMS.map((item) => (
          <Box as="li" key={item.to}>
            <RailItem item={item} />
          </Box>
        ))}
      </Stack>

      <Box role="separator" aria-hidden="true" mx="3" my="2" h="1px" bg="border" />

      <Stack
        as="ul"
        role="list"
        listStyleType="none"
        gap="1"
        pb="3"
        px="0"
      >
        {SECONDARY_NAV_ITEMS.map((item) => (
          <Box as="li" key={item.to}>
            <RailItem item={item} />
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

export default IconRail;
