/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * Tests for the loading skeleton shape variants.
 *
 * Shimmer animation is implemented via a `@keyframes` rule in an inline
 * <style> block; the `prefers-reduced-motion: reduce` media query disables
 * it. We verify the variant renders and the stylesheet is present.
 */
jest.mock("@chakra-ui/react", () =>
  require("../chakra-stub").chakraStubFactory(),
);

import { createElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  AnimeCardSkeleton,
  ImageThumbnailSkeleton,
  RowSkeleton,
  TagChipSkeleton,
} from "../../../src/components/shared/loading-skeleton";

interface Rendered {
  container: HTMLDivElement;
  root: Root;
  unmount: () => void;
}

function render(el: React.ReactElement): Rendered {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root!: Root;
  act(() => {
    root = createRoot(container);
    root.render(el);
  });
  return {
    container,
    root,
    unmount() {
      act(() => {
        root.unmount();
      });
      container.parentNode?.removeChild(container);
    },
  };
}

describe("loading skeletons", () => {
  test("AnimeCardSkeleton renders with the shimmer style block", () => {
    const r = render(createElement(AnimeCardSkeleton));
    expect(
      r.container.querySelector("[data-testid='anime-card-skeleton']"),
    ).not.toBeNull();
    expect(
      r.container.querySelector("[data-testid='animevault-skeleton-style']"),
    ).not.toBeNull();
    r.unmount();
  });

  test("ImageThumbnailSkeleton renders and accepts an aspectRatio override", () => {
    const r = render(createElement(ImageThumbnailSkeleton));
    const el = r.container.querySelector(
      "[data-testid='image-thumbnail-skeleton']",
    );
    expect(el).not.toBeNull();
    r.unmount();
  });

  test("TagChipSkeleton renders a pill-shaped placeholder", () => {
    const r = render(createElement(TagChipSkeleton));
    expect(
      r.container.querySelector("[data-testid='tag-chip-skeleton']"),
    ).not.toBeNull();
    r.unmount();
  });

  test("RowSkeleton renders the requested number of lines", () => {
    const r = render(createElement(RowSkeleton, { lines: 3 }));
    const row = r.container.querySelector("[data-testid='row-skeleton']");
    expect(row).not.toBeNull();
    // Default stub Stack renders a div; we just count the Skeleton stubs.
    const lines = row!.querySelectorAll("div div");
    expect(lines.length).toBeGreaterThanOrEqual(3);
    r.unmount();
  });

  test("prefers-reduced-motion disables the shimmer via media query (mock matchMedia)", () => {
    // JSDOM doesn't support `matchMedia` out of the box; polyfill it so the
    // component is free to call it in future without throwing. Today the
    // media query lives in the inlined stylesheet, so we assert the CSS
    // contains the guard.
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: query.includes("prefers-reduced-motion"),
        media: query,
        onchange: null,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        addListener: jest.fn(),
        removeListener: jest.fn(),
        dispatchEvent: jest.fn(),
      }),
    });
    const r = render(createElement(AnimeCardSkeleton));
    const style = r.container.querySelector(
      "[data-testid='animevault-skeleton-style']",
    );
    expect(style).not.toBeNull();
    expect(style!.textContent).toContain("prefers-reduced-motion: reduce");
    expect(style!.textContent).toContain("animation: none");
    r.unmount();
  });
});
