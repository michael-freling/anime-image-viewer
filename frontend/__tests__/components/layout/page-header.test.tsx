/**
 * Tests for PageHeader.
 *
 * The component accepts title (required), subtitle, actions, and breadcrumbs.
 * We assert each piece renders when provided and is hidden when omitted.
 */

import { Box } from "@chakra-ui/react";
import { PageHeader } from "../../../src/components/layout/page-header";
import { renderWithClient } from "../../test-utils";

describe("PageHeader", () => {
  test("renders the title as a heading", () => {
    const { container, unmount } = renderWithClient(
      <PageHeader title="Home" />,
    );
    const h1 = container.querySelector("h1");
    expect(h1).not.toBeNull();
    expect(h1!.textContent).toBe("Home");
    unmount();
  });

  test("renders the subtitle when provided", () => {
    const { container, unmount } = renderWithClient(
      <PageHeader title="Settings" subtitle="Manage directories and theme" />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("Settings");
    expect(text).toContain("Manage directories and theme");
    unmount();
  });

  test("omits the subtitle element entirely when not provided", () => {
    const { container, unmount } = renderWithClient(
      <PageHeader title="Home" />,
    );
    // Only the h1 and (possibly) the actions container should exist; no
    // stray paragraph for the missing subtitle.
    const paragraphs = container.querySelectorAll("p");
    expect(paragraphs).toHaveLength(0);
    unmount();
  });

  test("renders actions nodes inside the header", () => {
    const { container, unmount } = renderWithClient(
      <PageHeader
        title="Home"
        actions={
          <>
            <Box as="button" data-testid="primary-action">
              Upload
            </Box>
            <Box as="button" data-testid="secondary-action">
              More
            </Box>
          </>
        }
      />,
    );
    expect(
      container.querySelector('[data-testid="primary-action"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="secondary-action"]'),
    ).not.toBeNull();
    unmount();
  });

  test("renders breadcrumbs when provided", () => {
    const { container, unmount } = renderWithClient(
      <PageHeader
        title="Attack on Titan"
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Anime", href: "/" },
          { label: "Attack on Titan" },
        ]}
      />,
    );

    // The breadcrumb nav has aria-label="Breadcrumb" per spec.
    const crumbNav = container.querySelector('nav[aria-label="Breadcrumb"]');
    expect(crumbNav).not.toBeNull();

    // Current page crumb is labelled aria-current="page".
    const current = crumbNav!.querySelector('[aria-current="page"]');
    expect(current).not.toBeNull();
    expect(current!.textContent).toBe("Attack on Titan");

    // Linked crumbs render as anchors with the given href.
    const anchors = crumbNav!.querySelectorAll("a[href]");
    expect(anchors.length).toBeGreaterThanOrEqual(2);
    expect(anchors[0].getAttribute("href")).toBe("/");
    unmount();
  });

  test("omits breadcrumbs nav when breadcrumbs prop is empty or absent", () => {
    const without = renderWithClient(<PageHeader title="Home" />);
    expect(
      without.container.querySelector('nav[aria-label="Breadcrumb"]'),
    ).toBeNull();
    without.unmount();

    const emptyList = renderWithClient(
      <PageHeader title="Home" breadcrumbs={[]} />,
    );
    expect(
      emptyList.container.querySelector('nav[aria-label="Breadcrumb"]'),
    ).toBeNull();
    emptyList.unmount();
  });
});
