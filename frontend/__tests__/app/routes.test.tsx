/**
 * Tests for the route tree.
 *
 * Every path in frontend-design.md §3 must resolve without throwing, and the
 * nested anime-detail redirect (`/anime/:id` -> `/anime/:id/images`) must fire.
 *
 * We use `createMemoryRouter` + `RouterProvider` (via `renderRoutes`) instead
 * of the real `createBrowserRouter` so jsdom can drive navigation without
 * touching window.location.
 */

import { routes, Placeholder } from "../../src/app/routes";
import { renderRoutes } from "../test-utils";

describe("app routes", () => {
  const paths: Array<{ url: string; expect: string }> = [
    { url: "/", expect: "Home" },
    { url: "/anime/42/images", expect: "Images tab" },
    { url: "/anime/42/entries", expect: "Entries tab" },
    { url: "/anime/42/characters", expect: "Characters tab" },
    { url: "/anime/42/tags", expect: "Tags tab" },
    { url: "/anime/42/info", expect: "Info tab" },
    { url: "/search", expect: "Search" },
    { url: "/tags", expect: "Tag Management" },
    { url: "/images/edit/tags", expect: "Image Tag Editor" },
    { url: "/settings", expect: "Settings" },
  ];

  test.each(paths)("resolves $url and renders $expect", ({ url, expect: text }) => {
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: [url],
    });
    // Placeholder pages render as "<name>\nComing from Phase D" so a contains
    // check against the expected name is sufficient.
    expect(container.textContent ?? "").toContain(text);
    unmount();
  });

  test("redirects /anime/:id to /anime/:id/images (default tab)", () => {
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/123"],
    });
    // <Navigate to="images" replace/> should land us on Images tab.
    expect(container.textContent ?? "").toContain("Images tab");
    // Make sure we are NOT accidentally on any other tab.
    expect(container.textContent ?? "").not.toContain("Entries tab");
    expect(container.textContent ?? "").not.toContain("Characters tab");
    unmount();
  });

  test("every route renders inside the AppShell (nav rail is present on tablet+ viewports)", () => {
    // Regardless of viewport, the AppShell wraps all routes so the primary
    // nav landmark is part of the tree even when hidden by CSS media.
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/search"],
    });
    const navs = container.querySelectorAll('nav[aria-label="Primary"]');
    // Both the desktop IconRail and the mobile BottomTabBar are mounted; CSS
    // hides one or the other based on viewport width. Tests just verify that
    // at least one primary-nav landmark is present.
    expect(navs.length).toBeGreaterThan(0);
    unmount();
  });

  test("unmatched paths surface the RootErrorPage (not a crash)", () => {
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/this-route-does-not-exist"],
    });
    // errorElement renders on unmatched paths. Our RootErrorPage shows
    // either "Something went wrong" or a 404 title + a "Reload app" button.
    expect(container.textContent ?? "").toMatch(/Reload app|404/i);
    unmount();
  });

  test("Placeholder helper renders the given name", () => {
    const { container, unmount } = renderRoutes(
      [
        {
          path: "/",
          element: <Placeholder name="Sample page" />,
        },
      ],
      { initialEntries: ["/"] },
    );
    expect(container.textContent).toContain("Sample page");
    expect(container.textContent).toContain("Coming from Phase D");
    unmount();
  });
});
