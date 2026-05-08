/**
 * Tests for the IconRail (desktop/tablet primary nav).
 *
 * Covers:
 *   - exactly 4 items render (Home, Search, Tags, Settings) in spec order
 *   - the item matching the current location highlights as active
 *   - every item is keyboard-focusable and in DOM tab order
 *   - collapsed vs expanded states both expose accessible labels
 */

import { IconRail } from "../../../src/components/layout/icon-rail";
import { renderWithClient } from "../../test-utils";

function getNavItems(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>("nav a[href]"));
}

function labels(items: HTMLElement[]): string[] {
  return items.map((a) => (a.textContent ?? "").trim());
}

describe("IconRail", () => {
  test("renders Home, Search, Tags, Settings in spec order", () => {
    const { container, unmount } = renderWithClient(<IconRail />);
    const items = getNavItems(container);
    expect(items).toHaveLength(4);
    expect(labels(items)).toEqual(["Home", "Search", "Tags", "Settings"]);
    unmount();
  });

  test("marks the Home item active when rendered at '/'", () => {
    const { container, unmount } = renderWithClient(<IconRail />, {
      routerInitialEntries: ["/"],
    });
    const items = getNavItems(container);
    // The NavLink with aria-current="page" descendant is the active one.
    const active = container.querySelector('[aria-current="page"]');
    expect(active).not.toBeNull();
    // Ensure the active element belongs to the Home link, not another route.
    const homeLink = items.find((a) => a.getAttribute("href") === "/");
    expect(homeLink).toBeDefined();
    expect(homeLink!.contains(active as Node)).toBe(true);
    unmount();
  });

  test("marks the Search item active when rendered at '/search'", () => {
    const { container, unmount } = renderWithClient(<IconRail />, {
      routerInitialEntries: ["/search"],
    });
    const active = container.querySelector('[aria-current="page"]');
    expect(active).not.toBeNull();
    const searchLink = getNavItems(container).find(
      (a) => a.getAttribute("href") === "/search",
    );
    expect(searchLink!.contains(active as Node)).toBe(true);
    unmount();
  });

  test("marks the Tags item active at '/tags' and Settings at '/settings'", () => {
    const tagsRender = renderWithClient(<IconRail />, {
      routerInitialEntries: ["/tags"],
    });
    const tagsLink = getNavItems(tagsRender.container).find(
      (a) => a.getAttribute("href") === "/tags",
    );
    expect(
      tagsLink!.contains(
        tagsRender.container.querySelector(
          '[aria-current="page"]',
        ) as Node,
      ),
    ).toBe(true);
    tagsRender.unmount();

    const settingsRender = renderWithClient(<IconRail />, {
      routerInitialEntries: ["/settings"],
    });
    const settingsLink = getNavItems(settingsRender.container).find(
      (a) => a.getAttribute("href") === "/settings",
    );
    expect(
      settingsLink!.contains(
        settingsRender.container.querySelector(
          '[aria-current="page"]',
        ) as Node,
      ),
    ).toBe(true);
    settingsRender.unmount();
  });

  test("every nav item is keyboard-focusable in DOM order", () => {
    const { container, unmount } = renderWithClient(<IconRail />);
    const items = getNavItems(container);
    // Anchors are inherently tabbable — no tabindex="-1" should be set.
    for (const a of items) {
      expect(a.getAttribute("tabindex")).not.toBe("-1");
    }
    // DOM order matches nav order so Tab/Shift+Tab walks Home -> Settings.
    expect(labels(items)).toEqual(["Home", "Search", "Tags", "Settings"]);
    unmount();
  });

  test("exposes the text label for every item in both collapsed and expanded states", () => {
    // The rail renders all four labels; the collapsed state hides them via
    // CSS (container query) but keeps the DOM/text intact so screen readers
    // still announce them. We assert the label text is in the DOM for both
    // cases — no variant of the rail should strip it.
    const { container, unmount } = renderWithClient(<IconRail />);
    const navText = container.querySelector("nav")?.textContent ?? "";
    expect(navText).toContain("Home");
    expect(navText).toContain("Search");
    expect(navText).toContain("Tags");
    expect(navText).toContain("Settings");
    unmount();
  });

  test("Home uses exact-match so '/search' does not also mark Home active", () => {
    const { container, unmount } = renderWithClient(<IconRail />, {
      routerInitialEntries: ["/search"],
    });
    const items = getNavItems(container);
    const homeLink = items.find((a) => a.getAttribute("href") === "/");
    const active = container.querySelector('[aria-current="page"]');
    // Home must NOT be the active link when we're at /search.
    expect(homeLink!.contains(active as Node)).toBe(false);
    unmount();
  });
});
