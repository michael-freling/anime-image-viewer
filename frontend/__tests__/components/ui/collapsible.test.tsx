/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * Tests for `Collapsible`.
 *
 * We animate via a `grid-template-rows` transition described in an inline
 * `<style data-testid="collapsible-style">` block. A
 * `@media (prefers-reduced-motion: reduce)` rule disables the transition,
 * and we assert the stylesheet contains both the transition and the guard.
 */
jest.mock("@chakra-ui/react", () =>
  require("../chakra-stub").chakraStubFactory(),
);

import { createElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Collapsible } from "../../../src/components/ui/collapsible";

interface Rendered {
  container: HTMLDivElement;
  root: Root;
  unmount: () => void;
  rerender: (el: React.ReactElement) => void;
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
    rerender(next) {
      act(() => {
        root.render(next);
      });
    },
    unmount() {
      act(() => {
        root.unmount();
      });
      container.parentNode?.removeChild(container);
    },
  };
}

describe("Collapsible", () => {
  test("open=true renders children", () => {
    const r = render(
      createElement(Collapsible, {
        open: true,
        children: createElement(
          "span",
          { "data-testid": "inner" },
          "payload",
        ),
      }),
    );
    expect(
      r.container.querySelector("[data-testid='inner']"),
    ).not.toBeNull();
    expect(r.container.textContent).toContain("payload");
    r.unmount();
  });

  test("open=false does NOT render children", () => {
    const r = render(
      createElement(Collapsible, {
        open: false,
        children: createElement(
          "span",
          { "data-testid": "inner" },
          "payload",
        ),
      }),
    );
    expect(
      r.container.querySelector("[data-testid='inner']"),
    ).toBeNull();
    expect(r.container.textContent).not.toContain("payload");
    r.unmount();
  });

  test("data-state reflects the open prop", () => {
    const r = render(
      createElement(Collapsible, {
        open: true,
        children: createElement("span", null, "x"),
      }),
    );
    const root = r.container.querySelector(
      "[data-testid='collapsible-root']",
    ) as HTMLElement;
    expect(root.getAttribute("data-state")).toBe("open");
    expect(root.getAttribute("aria-hidden")).toBe("false");

    r.rerender(
      createElement(Collapsible, {
        open: false,
        children: createElement("span", null, "x"),
      }),
    );
    const rootClosed = r.container.querySelector(
      "[data-testid='collapsible-root']",
    ) as HTMLElement;
    expect(rootClosed.getAttribute("data-state")).toBe("closed");
    expect(rootClosed.getAttribute("aria-hidden")).toBe("true");
    r.unmount();
  });

  test("inlined stylesheet contains grid-template-rows transition", () => {
    const r = render(
      createElement(Collapsible, {
        open: true,
        children: createElement("span", null, "x"),
      }),
    );
    const style = r.container.querySelector(
      "[data-testid='collapsible-style']",
    );
    expect(style).not.toBeNull();
    expect(style!.textContent).toContain("grid-template-rows");
    expect(style!.textContent).toContain("transition");
    r.unmount();
  });

  test("inlined stylesheet disables the animation via prefers-reduced-motion", () => {
    const r = render(
      createElement(Collapsible, {
        open: true,
        children: createElement("span", null, "x"),
      }),
    );
    const style = r.container.querySelector(
      "[data-testid='collapsible-style']",
    );
    expect(style!.textContent).toContain("prefers-reduced-motion: reduce");
    expect(style!.textContent).toContain("transition: none");
    r.unmount();
  });
});
