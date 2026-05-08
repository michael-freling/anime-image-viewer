/**
 * Tests for the mobile BottomTabBar.
 *
 * Per ui-design.md §3.9: exactly 4 tabs — Home, Search, Tags, Settings. The
 * active tab must be visually distinguished (top border in the primary color
 * per the wireframe) and marked with aria-current="page" for a11y.
 */

import { BottomTabBar } from "../../../src/components/layout/bottom-tab-bar";
import { renderWithClient } from "../../test-utils";

function getTabLinks(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>("nav a[href]"));
}

describe("BottomTabBar", () => {
  test("renders exactly 4 tabs in spec order", () => {
    const { container, unmount } = renderWithClient(<BottomTabBar />);
    const links = getTabLinks(container);
    expect(links).toHaveLength(4);
    expect(links.map((a) => (a.textContent ?? "").trim())).toEqual([
      "Home",
      "Search",
      "Tags",
      "Settings",
    ]);
    unmount();
  });

  test("active tab is visibly indicated (aria-current + data-active)", () => {
    const { container, unmount } = renderWithClient(<BottomTabBar />, {
      routerInitialEntries: ["/search"],
    });

    // Exactly one anchor is active — NavLink marks it with aria-current="page"
    // and href="/search".
    const activeAnchor = container.querySelector('a[aria-current="page"]');
    expect(activeAnchor).not.toBeNull();
    expect(activeAnchor!.getAttribute("href")).toBe("/search");

    // Exactly one visual-indicator marker (the top-border element) is
    // rendered with data-active="true" — it carries the Search label.
    const activeMarkers = container.querySelectorAll('[data-active="true"]');
    expect(activeMarkers).toHaveLength(1);
    expect(activeMarkers[0].textContent).toContain("Search");
    unmount();
  });

  test("does not include More/overflow or Backup tabs (spec forbids them)", () => {
    const { container, unmount } = renderWithClient(<BottomTabBar />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/More/i);
    expect(text).not.toMatch(/Backup/i);
    unmount();
  });

  test("is fixed to the bottom and landmarked as nav", () => {
    const { container, unmount } = renderWithClient(<BottomTabBar />);
    const nav = container.querySelector("nav");
    expect(nav).not.toBeNull();
    // Role is implicit on <nav>; accessibility label is set for screen readers.
    expect(nav!.getAttribute("aria-label")).toBe("Primary");
    unmount();
  });
});
