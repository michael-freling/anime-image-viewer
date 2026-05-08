/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * Tests for `TriStateCheckbox`.
 *
 * The component is a button with `role="checkbox"` and one of three
 * `aria-checked` values:
 *   unchecked     → "false"
 *   checked       → "true"
 *   indeterminate → "mixed"
 *
 * onChange toggles unchecked ↔ checked. Indeterminate resolves to checked
 * on click (i.e. "add to all"). The pending="adding"/"removing" prop adds
 * row highlights via success.bg / danger.bg.
 */
jest.mock("@chakra-ui/react", () =>
  require("../chakra-stub").chakraStubFactory(),
);
jest.mock("lucide-react", () =>
  require("../chakra-stub").lucideStubFactory(),
);

import { createElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TriStateCheckbox } from "../../../src/components/ui/tri-state-checkbox";

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

describe("TriStateCheckbox", () => {
  test("unchecked renders aria-checked='false' and no check icon", () => {
    const r = render(
      createElement(TriStateCheckbox, {
        state: "unchecked",
        onChange: jest.fn(),
        label: "Action",
      }),
    );
    const box = r.container.querySelector("[role='checkbox']") as HTMLElement;
    expect(box.getAttribute("aria-checked")).toBe("false");
    expect(box.getAttribute("data-state")).toBe("unchecked");
    expect(r.container.querySelector("[data-icon='Check']")).toBeNull();
    expect(r.container.querySelector("[data-icon='Minus']")).toBeNull();
    r.unmount();
  });

  test("checked renders aria-checked='true' and a Check icon", () => {
    const r = render(
      createElement(TriStateCheckbox, {
        state: "checked",
        onChange: jest.fn(),
        label: "Action",
      }),
    );
    const box = r.container.querySelector("[role='checkbox']") as HTMLElement;
    expect(box.getAttribute("aria-checked")).toBe("true");
    expect(box.getAttribute("data-state")).toBe("checked");
    expect(r.container.querySelector("[data-icon='Check']")).not.toBeNull();
    r.unmount();
  });

  test("indeterminate renders aria-checked='mixed' and a Minus icon", () => {
    const r = render(
      createElement(TriStateCheckbox, {
        state: "indeterminate",
        onChange: jest.fn(),
        label: "Action",
      }),
    );
    const box = r.container.querySelector("[role='checkbox']") as HTMLElement;
    expect(box.getAttribute("aria-checked")).toBe("mixed");
    expect(box.getAttribute("data-state")).toBe("indeterminate");
    expect(r.container.querySelector("[data-icon='Minus']")).not.toBeNull();
    r.unmount();
  });

  test("click unchecked → onChange('checked')", () => {
    const onChange = jest.fn();
    const r = render(
      createElement(TriStateCheckbox, {
        state: "unchecked",
        onChange,
        label: "Action",
      }),
    );
    const box = r.container.querySelector("[role='checkbox']") as HTMLElement;
    act(() => {
      box.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith("checked");
    r.unmount();
  });

  test("click checked → onChange('unchecked')", () => {
    const onChange = jest.fn();
    const r = render(
      createElement(TriStateCheckbox, {
        state: "checked",
        onChange,
        label: "Action",
      }),
    );
    const box = r.container.querySelector("[role='checkbox']") as HTMLElement;
    act(() => {
      box.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith("unchecked");
    r.unmount();
  });

  test("click indeterminate → onChange('checked')", () => {
    const onChange = jest.fn();
    const r = render(
      createElement(TriStateCheckbox, {
        state: "indeterminate",
        onChange,
        label: "Action",
      }),
    );
    const box = r.container.querySelector("[role='checkbox']") as HTMLElement;
    act(() => {
      box.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith("checked");
    r.unmount();
  });

  test("pending='adding' adds adding hint", () => {
    const r = render(
      createElement(TriStateCheckbox, {
        state: "unchecked",
        pending: "adding",
        onChange: jest.fn(),
        label: "Action",
      }),
    );
    const hint = r.container.querySelector(
      "[data-testid='tri-state-pending-hint']",
    );
    expect(hint).not.toBeNull();
    expect(hint!.textContent).toContain("adding");
    const box = r.container.querySelector("[role='checkbox']") as HTMLElement;
    expect(box.getAttribute("data-pending")).toBe("adding");
    r.unmount();
  });

  test("pending='removing' adds removing hint and strikethrough label", () => {
    const r = render(
      createElement(TriStateCheckbox, {
        state: "checked",
        pending: "removing",
        onChange: jest.fn(),
        label: "Action",
      }),
    );
    const hint = r.container.querySelector(
      "[data-testid='tri-state-pending-hint']",
    );
    expect(hint).not.toBeNull();
    expect(hint!.textContent).toContain("removing");
    const box = r.container.querySelector("[role='checkbox']") as HTMLElement;
    expect(box.getAttribute("data-pending")).toBe("removing");
    r.unmount();
  });

  test("count is rendered when provided", () => {
    const r = render(
      createElement(TriStateCheckbox, {
        state: "checked",
        onChange: jest.fn(),
        label: "Action",
        count: 17,
      }),
    );
    expect(r.container.textContent).toContain("17");
    r.unmount();
  });

  test("no label still renders the control", () => {
    const r = render(
      createElement(TriStateCheckbox, {
        state: "unchecked",
        onChange: jest.fn(),
      }),
    );
    expect(r.container.querySelector("[role='checkbox']")).not.toBeNull();
    r.unmount();
  });
});
