/**
 * AppShell — the top-level layout wrapper used by every route.
 *
 * Desktop (>=1024px): two-column CSS grid. Left column is a 64px icon rail
 *   that expands to 180px on hover (or when pinned open via ui-store).
 * Tablet (640-1023px): 64px icon rail, no hover expand.
 * Mobile (<640px): single column with a fixed bottom tab bar.
 *
 * Breakpoints come from ui-design.md §6.1/§6.2. Chakra v3's default `lg`
 * breakpoint is 1024px which matches our spec's desktop threshold, but our
 * mobile/tablet split (640px) does not align with Chakra's default `sm`
 * (480px), so we use raw `@media (min-width: ...)` queries to stay faithful
 * to the spec rather than redefining Chakra breakpoints globally (which would
 * affect every other component in the app).
 */
import { Box } from "@chakra-ui/react";
import { Outlet } from "react-router";
import { useUIStore } from "../../stores/ui-store";
import { BottomTabBar } from "./bottom-tab-bar";
import { IconRail } from "./icon-rail";

/**
 * Data attribute toggled based on `sidebarExpanded` so CSS can pin the rail
 * open without needing JS on every frame.
 */
export function AppShell(): JSX.Element {
  const sidebarExpanded = useUIStore((state) => state.sidebarExpanded);

  return (
    <Box
      data-sidebar-expanded={sidebarExpanded ? "true" : "false"}
      minH="100vh"
      bg="bg.base"
      color="fg"
      css={{
        // Mobile default: single column, content fills the viewport. Bottom
        // tab bar is position:fixed so it doesn't participate in the grid.
        display: "grid",
        gridTemplateColumns: "1fr",
        gridTemplateRows: "1fr auto",

        // Tablet: 64px icon rail, no hover expand.
        "@media (min-width: 640px)": {
          gridTemplateColumns: "64px 1fr",
          gridTemplateRows: "1fr",
        },

        // Desktop: 64px rail that widens to 180px on hover (or when pinned).
        "@media (min-width: 1024px)": {
          gridTemplateColumns: "var(--rail-width, 64px) 1fr",
          transition: "grid-template-columns 180ms ease",
          "&:hover, &[data-sidebar-expanded='true']": {
            gridTemplateColumns: "180px 1fr",
          },
        },
      }}
    >
      {/* Icon rail — hidden on mobile, shown from tablet up. */}
      <Box
        as="aside"
        aria-label="Primary navigation"
        display={{ base: "none", sm: "block" }}
        css={{
          position: "sticky",
          top: 0,
          height: "100vh",
          // Let the rail paint to the grid column width (64px or 180px).
          // Inner content reads this width via container queries / hover.
        }}
      >
        <IconRail />
      </Box>

      {/* Main content slot. Pages are responsible for their own scroll. */}
      <Box
        as="main"
        minW={0}
        minH="100vh"
        css={{
          // Leave room for the fixed bottom bar on mobile so sticky page
          // headers and content bottoms don't disappear behind it.
          "@media (max-width: 639px)": {
            paddingBottom: "72px",
          },
        }}
      >
        <Outlet />
      </Box>

      {/* Mobile-only bottom tab bar. Fixed at the bottom of the viewport. */}
      <Box display={{ base: "block", sm: "none" }}>
        <BottomTabBar />
      </Box>
    </Box>
  );
}

export default AppShell;
