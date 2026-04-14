/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * Tests for `EntryTab`.
 */
jest.mock("@chakra-ui/react", () =>
  require("../chakra-stub").chakraStubFactory(),
);

import { createElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EntryTab } from "../../../src/components/shared/entry-tab";

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

describe("EntryTab", () => {
  test("renders the label", () => {
    const r = render(createElement(EntryTab, { label: "Season 1" }));
    expect(r.container.textContent).toContain("Season 1");
    r.unmount();
  });

  test("inactive state: no data-active, aria-selected=false", () => {
    const r = render(createElement(EntryTab, { label: "All" }));
    const btn = r.container.querySelector("button")!;
    expect(btn.getAttribute("aria-selected")).toBe("false");
    expect(btn.getAttribute("data-active")).toBeNull();
    r.unmount();
  });

  test("active state sets data-active and aria-selected=true", () => {
    const r = render(createElement(EntryTab, { label: "All", active: true }));
    const btn = r.container.querySelector("button")!;
    expect(btn.getAttribute("aria-selected")).toBe("true");
    expect(btn.getAttribute("data-active")).toBe("true");
    r.unmount();
  });

  test("count badge renders only when count is provided", () => {
    const r = render(
      createElement(EntryTab, { label: "All", count: 342 }),
    );
    const badge = r.container.querySelector(
      "[data-testid='entry-tab-count']",
    );
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toBe("342");
    r.unmount();

    const r2 = render(createElement(EntryTab, { label: "All" }));
    expect(
      r2.container.querySelector("[data-testid='entry-tab-count']"),
    ).toBeNull();
    r2.unmount();
  });

  test("count=0 still renders (per spec: show count when provided)", () => {
    const r = render(createElement(EntryTab, { label: "All", count: 0 }));
    const badge = r.container.querySelector(
      "[data-testid='entry-tab-count']",
    );
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toBe("0");
    r.unmount();
  });

  test("onClick fires on left click", () => {
    const onClick = jest.fn();
    const r = render(createElement(EntryTab, { label: "All", onClick }));
    const btn = r.container.querySelector("button")!;
    act(() => {
      btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onClick).toHaveBeenCalledTimes(1);
    r.unmount();
  });

  test("onContextMenu fires on right click", () => {
    const onContextMenu = jest.fn();
    const r = render(
      createElement(EntryTab, { label: "All", onContextMenu }),
    );
    const btn = r.container.querySelector("button")!;
    act(() => {
      btn.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });
    expect(onContextMenu).toHaveBeenCalledTimes(1);
    r.unmount();
  });
});
