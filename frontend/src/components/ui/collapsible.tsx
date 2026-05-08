/**
 * Thin wrapper over Chakra's `Collapsible` with controlled open/close
 * semantics. We animate `grid-template-rows` — the most reliable way to
 * transition an unknown content height — and short-circuit the animation
 * when `prefers-reduced-motion: reduce` is active.
 *
 * We intentionally keep this minimal: no trigger button, no indicator. The
 * parent renders whatever header it wants and toggles the `open` prop. This
 * matches the usage pattern already established in
 * `tag-management-page` category sections.
 */
import { Box } from "@chakra-ui/react";
import type { ReactElement, ReactNode } from "react";

export interface CollapsibleProps {
  open: boolean;
  children: ReactNode;
}

const ANIMATION_CSS = `
.animevault-collapsible {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 180ms ease-out;
}
.animevault-collapsible[data-state="open"] {
  grid-template-rows: 1fr;
}
.animevault-collapsible > .animevault-collapsible-inner {
  overflow: hidden;
  min-height: 0;
}
@media (prefers-reduced-motion: reduce) {
  .animevault-collapsible {
    transition: none !important;
  }
}
`;

export function Collapsible({ open, children }: CollapsibleProps): ReactElement {
  return (
    <>
      <style data-testid="collapsible-style">{ANIMATION_CSS}</style>
      <Box
        className="animevault-collapsible"
        data-state={open ? "open" : "closed"}
        data-testid="collapsible-root"
        aria-hidden={!open}
      >
        <Box
          className="animevault-collapsible-inner"
          data-testid="collapsible-inner"
        >
          {open ? children : null}
        </Box>
      </Box>
    </>
  );
}

export default Collapsible;
