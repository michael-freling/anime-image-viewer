/**
 * UnderlineTabBar — a reusable horizontal tab bar with an active-tab underline.
 *
 * Each tab is rendered as a React Router `NavLink` so that browser
 * back/forward navigation works seamlessly. The active tab is highlighted
 * with a primary-colored bottom border.
 */
import { Box, Stack, Text } from "@chakra-ui/react";
import type { LucideIcon } from "lucide-react";
import { NavLink } from "react-router";

export interface TabItem {
  /** Route path for NavLink (relative). */
  to: string;
  label: string;
  icon?: LucideIcon;
}

export interface UnderlineTabBarProps {
  items: readonly TabItem[];
  ariaLabel: string;
  /** Optional content rendered above the tab row (e.g., breadcrumb). */
  prefix?: React.ReactNode;
  /** `data-testid` for the outer nav element. */
  testId?: string;
  /**
   * When provided, sets `data-testid="{testIdPrefix}-{item.to}"` on each
   * tab link.
   */
  testIdPrefix?: string;
}

function TabLink({ item, testId }: { item: TabItem; testId?: string }): JSX.Element {
  const Icon = item.icon;
  return (
    <NavLink to={item.to} style={{ textDecoration: "none" }} data-testid={testId}>
      {({ isActive }) => (
        <Box
          role="tab"
          aria-selected={isActive}
          aria-current={isActive ? "page" : undefined}
          data-active={isActive ? "true" : undefined}
          display="inline-flex"
          alignItems="center"
          gap="2"
          px="3"
          py="2.5"
          borderBottomWidth="2px"
          borderBottomColor={isActive ? "primary" : "transparent"}
          color={isActive ? "primary" : "fg.secondary"}
          fontSize="sm"
          fontWeight="500"
          cursor="pointer"
          transition="color 120ms, border-color 120ms"
          _hover={{
            color: isActive ? "primary" : "fg",
            borderBottomColor: isActive ? "primary" : "border",
          }}
        >
          {Icon && (
            <Box as="span" aria-hidden="true" display="inline-flex">
              <Icon size={16} />
            </Box>
          )}
          <Text as="span">{item.label}</Text>
        </Box>
      )}
    </NavLink>
  );
}

export function UnderlineTabBar({
  items,
  ariaLabel,
  prefix,
  testId,
  testIdPrefix,
}: UnderlineTabBarProps): JSX.Element {
  return (
    <Box
      as="nav"
      aria-label={ariaLabel}
      data-testid={testId}
      role="tablist"
      position="sticky"
      top="0"
      zIndex="1"
      bg="bg.surface"
      borderBottomWidth="1px"
      borderColor="border"
    >
      {prefix && (
        <Box px={{ base: "2", md: "4" }} pt="2" pb="0" fontSize="sm" color="fg.muted">
          {prefix}
        </Box>
      )}
      <Stack
        direction="row"
        gap="1"
        overflow="auto"
        px={{ base: "2", md: "4" }}
      >
        {items.map((item) => (
          <TabLink
            key={item.to}
            item={item}
            testId={testIdPrefix ? `${testIdPrefix}-${item.to}` : undefined}
          />
        ))}
      </Stack>
    </Box>
  );
}

export default UnderlineTabBar;
