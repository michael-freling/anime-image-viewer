/**
 * PageHeader — sticky per-page header used inside the main content slot.
 *
 * Pages render this as their first child to get a consistent top bar with
 * title, subtitle, breadcrumbs, and action buttons. Sticks to the top of
 * the scroll container so the title stays visible when the grid scrolls.
 *
 * On mobile the actions row stacks below the title so long titles or
 * 3+ actions don't overflow. Breadcrumbs, when provided, render above the
 * title and use a subtle color.
 */
import { Box, Heading, Stack, Text } from "@chakra-ui/react";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Fragment } from "react";
import { Link as RouterLink } from "react-router";

export interface PageHeaderBreadcrumb {
  label: string;
  /**
   * When provided, the breadcrumb renders as a link to this route.
   * When omitted, it renders as plain text (current location).
   */
  href?: string;
}

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Action buttons or controls shown on the right (desktop) / below (mobile). */
  actions?: ReactNode;
  breadcrumbs?: PageHeaderBreadcrumb[];
}

function Breadcrumbs({ items }: { items: PageHeaderBreadcrumb[] }): JSX.Element {
  return (
    <Box
      as="nav"
      aria-label="Breadcrumb"
      fontSize="sm"
      color="fg.muted"
      mb="1"
    >
      <Stack
        as="ol"
        role="list"
        direction="row"
        align="center"
        gap="1"
        listStyleType="none"
      >
        {items.map((crumb, index) => {
          const isLast = index === items.length - 1;
          return (
            <Fragment key={`${crumb.label}-${index}`}>
              <Box as="li" display="inline-flex" alignItems="center">
                {crumb.href && !isLast ? (
                  <RouterLink
                    to={crumb.href}
                    style={{
                      color: "inherit",
                      textDecoration: "none",
                    }}
                  >
                    <Text as="span" _hover={{ color: "fg" }}>
                      {crumb.label}
                    </Text>
                  </RouterLink>
                ) : (
                  <Text
                    as="span"
                    color={isLast ? "fg.secondary" : undefined}
                    aria-current={isLast ? "page" : undefined}
                  >
                    {crumb.label}
                  </Text>
                )}
              </Box>
              {!isLast && (
                <Box
                  as="li"
                  role="presentation"
                  aria-hidden="true"
                  display="inline-flex"
                  alignItems="center"
                  color="fg.dim"
                >
                  <ChevronRight size={14} />
                </Box>
              )}
            </Fragment>
          );
        })}
      </Stack>
    </Box>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  breadcrumbs,
}: PageHeaderProps): JSX.Element {
  return (
    <Box
      as="header"
      position="sticky"
      top="0"
      zIndex="sticky"
      bg="bg.surface"
      borderBottomWidth="1px"
      borderBottomColor="border"
      backdropFilter="saturate(180%) blur(8px)"
      px={{ base: "4", md: "6" }}
      py={{ base: "3", md: "4" }}
    >
      <Stack
        direction={{ base: "column", md: "row" }}
        align={{ base: "stretch", md: "center" }}
        justify="space-between"
        gap={{ base: "3", md: "4" }}
      >
        <Box minW={0} flex="1">
          {breadcrumbs && breadcrumbs.length > 0 && (
            <Breadcrumbs items={breadcrumbs} />
          )}
          <Heading
            as="h1"
            size={{ base: "lg", md: "xl" }}
            lineHeight="1.2"
            color="fg"
          >
            {title}
          </Heading>
          {subtitle && (
            <Text mt="1" color="fg.secondary" fontSize="sm">
              {subtitle}
            </Text>
          )}
        </Box>
        {actions && (
          <Box
            display="flex"
            alignItems="center"
            gap="2"
            flexWrap="wrap"
            justifyContent={{ base: "flex-start", md: "flex-end" }}
          >
            {actions}
          </Box>
        )}
      </Stack>
    </Box>
  );
}

export default PageHeader;
