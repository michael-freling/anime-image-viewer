/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * Tests for `FilterChip`.
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
import { FilterChip } from "../../../src/components/shared/filter-chip";

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

describe("FilterChip", () => {
  test("renders the label", () => {
    const r = render(
      createElement(FilterChip, { label: "Outdoor", onRemove: jest.fn() }),
    );
    expect(r.container.textContent).toContain("Outdoor");
    r.unmount();
  });

  test("default variant is include, marked via data-variant", () => {
    const r = render(
      createElement(FilterChip, { label: "Outdoor", onRemove: jest.fn() }),
    );
    const chip = r.container.querySelector("[data-variant]");
    expect(chip?.getAttribute("data-variant")).toBe("include");
    expect(chip?.textContent).toContain("+");
    r.unmount();
  });

  test("exclude variant uses data-variant='exclude' and minus prefix", () => {
    const r = render(
      createElement(FilterChip, {
        label: "Indoor",
        variant: "exclude",
        onRemove: jest.fn(),
      }),
    );
    const chip = r.container.querySelector("[data-variant='exclude']");
    expect(chip).not.toBeNull();
    expect(chip?.textContent).toContain("−");
    r.unmount();
  });

  test("onRemove fires when the X button is clicked", () => {
    const onRemove = jest.fn();
    const r = render(
      createElement(FilterChip, { label: "Outdoor", onRemove }),
    );
    const btn = r.container.querySelector(
      "[aria-label='Remove filter Outdoor']",
    ) as HTMLButtonElement | null;
    expect(btn).not.toBeNull();
    act(() => {
      btn!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onRemove).toHaveBeenCalledTimes(1);
    r.unmount();
  });

  test("include and exclude chips differ in aria-label for screen readers", () => {
    const a = render(
      createElement(FilterChip, {
        label: "One",
        onRemove: jest.fn(),
      }),
    );
    const b = render(
      createElement(FilterChip, {
        label: "Two",
        variant: "exclude",
        onRemove: jest.fn(),
      }),
    );
    expect(
      a.container.querySelector("[aria-label='Remove filter One']"),
    ).not.toBeNull();
    expect(
      b.container.querySelector("[aria-label='Remove filter Two']"),
    ).not.toBeNull();
    a.unmount();
    b.unmount();
  });
});
