/**
 * AnimeDetailTabBar — horizontal primary tab bar for the Anime Detail page.
 *
 * Spec: ui-design.md §3.2 "Tabs: Images (default) | Entries | Characters |
 * Tags | Info" with the active tab marked by a primary underline.
 *
 * Each tab is a react-router `NavLink` so browser back/forward navigation
 * across tabs works out of the box. NavLink applies `aria-current="page"` to
 * the active tab automatically (see icon-rail.tsx for the same pattern).
 */
import { Box, Stack, Text } from "@chakra-ui/react";
import { Film, ListOrdered, Image as ImageIcon, Tag, Info } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { NavLink } from "react-router";

export interface AnimeDetailTabItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

/**
 * Tabs in canonical order (ui-design §3.2). The paths are relative so they
 * resolve against the /anime/:animeId parent when used inside the
 * AnimeDetailLayout.
 */
export const ANIME_DETAIL_TABS: readonly AnimeDetailTabItem[] = [
  { to: "images", label: "Images", icon: ImageIcon },
  { to: "entries", label: "Entries", icon: ListOrdered },
  { to: "characters", label: "Characters", icon: Film },
  { to: "tags", label: "Tags", icon: Tag },
  { to: "info", label: "Info", icon: Info },
] as const;

function TabLink({ item }: { item: AnimeDetailTabItem }): JSX.Element {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      style={{ textDecoration: "none" }}
      data-testid={`anime-detail-tab-${item.to}`}
    >
      {({ isActive }) => (
        <Box
          role="tab"
          aria-selected={isActive}
          aria-current={isActive ? "page" : undefined}
          data-active={isActive ? "true" : undefined}
          display="inline-flex"
          alignItems="center"
          gap="2"
          px="4"
          py="3"
          borderBottomWidth="2px"
          borderBottomColor={isActive ? "primary" : "transparent"}
          color={isActive ? "primary" : "fg.secondary"}
          fontSize="sm"
          fontWeight={isActive ? "600" : "500"}
          cursor="pointer"
          transition="color 120ms, border-color 120ms"
          _hover={{
            color: isActive ? "primary" : "fg",
            borderBottomColor: isActive ? "primary" : "border",
          }}
        >
          <Box as="span" aria-hidden="true" display="inline-flex">
            <Icon size={16} strokeWidth={2} />
          </Box>
          <Text as="span">{item.label}</Text>
        </Box>
      )}
    </NavLink>
  );
}

export function AnimeDetailTabBar(): JSX.Element {
  return (
    <Box
      as="nav"
      role="tablist"
      aria-label="Anime detail tabs"
      data-testid="anime-detail-tab-bar"
      position="sticky"
      top="0"
      zIndex="1"
      bg="bg.surface"
      borderBottomWidth="1px"
      borderBottomColor="border"
      px={{ base: "2", md: "4" }}
      overflow="auto"
    >
      <Stack
        as="ul"
        role="list"
        direction="row"
        listStyleType="none"
        gap="1"
        align="center"
      >
        {ANIME_DETAIL_TABS.map((item) => (
          <Box as="li" key={item.to} listStyleType="none">
            <TabLink item={item} />
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

export default AnimeDetailTabBar;
