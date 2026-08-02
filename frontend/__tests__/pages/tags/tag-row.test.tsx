/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * Tests for `TagRow` (ui-design §3.5).
 *
 * Verifies:
 *   - The tag chip renders and clicking it fires the `onEdit` callback (there
 *     is no separate edit button — the chip is the edit affordance).
 *   - The selection checkbox renders only when `onToggleSelect` is passed,
 *     reflects `selected` via aria-checked, and toggles without editing.
 *   - The delete X button fires `onDelete` and stops propagation.
 *   - Usage count renders when a numeric value is passed; it's omitted when
 *     null/undefined.
 */
jest.mock("@chakra-ui/react", () =>
  require("../../components/chakra-stub").chakraStubFactory(),
);
jest.mock("lucide-react", () =>
  require("../../components/chakra-stub").lucideStubFactory(),
);

import { createElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { TagRow } from "../../../src/pages/tags/tag-row";
import type { Tag } from "../../../src/types";

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

const TAG: Tag = { id: 7, name: "Sunset", category: "scene" };

describe("TagRow", () => {
  test("renders the tag chip and the row container", () => {
    const r = render(
      createElement(TagRow, {
        tag: TAG,
        onEdit: jest.fn(),
        onDelete: jest.fn(),
      }),
    );
    const row = r.container.querySelector("[data-testid='tag-row']");
    expect(row).not.toBeNull();
    expect(row?.getAttribute("data-tag-id")).toBe("7");
    expect(r.container.textContent).toContain("Sunset");
    r.unmount();
  });

  test("clicking the chip calls onEdit", () => {
    const onEdit = jest.fn();
    const r = render(
      createElement(TagRow, {
        tag: TAG,
        onEdit,
        onDelete: jest.fn(),
      }),
    );
    const chip = r.container.querySelector<HTMLElement>(
      "[data-testid='tag-chip']",
    )!;
    act(() => {
      chip.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith(TAG);
    r.unmount();
  });

  test("has no separate edit button — the chip is the only edit affordance", () => {
    const r = render(
      createElement(TagRow, {
        tag: TAG,
        onEdit: jest.fn(),
        onDelete: jest.fn(),
      }),
    );
    expect(
      r.container.querySelector("[data-testid='tag-row-edit']"),
    ).toBeNull();
    r.unmount();
  });

  test("checkbox is absent unless onToggleSelect is provided", () => {
    const r = render(
      createElement(TagRow, {
        tag: TAG,
        onEdit: jest.fn(),
        onDelete: jest.fn(),
      }),
    );
    expect(
      r.container.querySelector("[data-testid='tag-row-select']"),
    ).toBeNull();
    r.unmount();
  });

  test("checkbox reflects selected state and toggles without editing", () => {
    const onEdit = jest.fn();
    const onToggleSelect = jest.fn();
    const r = render(
      createElement(TagRow, {
        tag: TAG,
        onEdit,
        onDelete: jest.fn(),
        selected: true,
        onToggleSelect,
      }),
    );
    const checkbox = r.container.querySelector<HTMLButtonElement>(
      "[data-testid='tag-row-select']",
    )!;
    expect(checkbox.getAttribute("aria-checked")).toBe("true");
    expect(checkbox.getAttribute("aria-label")).toBe("Select tag Sunset");
    act(() => {
      checkbox.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onToggleSelect).toHaveBeenCalledTimes(1);
    expect(onToggleSelect).toHaveBeenCalledWith(TAG);
    // Selecting must not open the edit dialog.
    expect(onEdit).not.toHaveBeenCalled();
    r.unmount();
  });

  test("delete X fires onDelete without bubbling chip click", () => {
    const onEdit = jest.fn();
    const onDelete = jest.fn();
    const r = render(
      createElement(TagRow, {
        tag: TAG,
        onEdit,
        onDelete,
      }),
    );
    const deleteBtn = r.container.querySelector<HTMLButtonElement>(
      "[data-testid='tag-row-delete']",
    )!;
    act(() => {
      deleteBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith(TAG);
    // The chip click was NOT dispatched, so onEdit stays untouched.
    expect(onEdit).not.toHaveBeenCalled();
    expect(deleteBtn.getAttribute("aria-label")).toBe("Delete tag Sunset");
    r.unmount();
  });

  test("search button fires onSearch without editing", () => {
    const onEdit = jest.fn();
    const onSearch = jest.fn();
    const r = render(
      createElement(TagRow, {
        tag: TAG,
        onEdit,
        onDelete: jest.fn(),
        onSearch,
      }),
    );
    const searchBtn = r.container.querySelector<HTMLButtonElement>(
      "[data-testid='tag-row-search']",
    )!;
    act(() => {
      searchBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onSearch).toHaveBeenCalledWith(TAG);
    expect(onEdit).not.toHaveBeenCalled();
    r.unmount();
  });

  test("usage count block renders when a number is passed", () => {
    const r = render(
      createElement(TagRow, {
        tag: TAG,
        usageCount: 3,
        onEdit: jest.fn(),
        onDelete: jest.fn(),
      }),
    );
    const usage = r.container.querySelector(
      "[data-testid='tag-row-usage']",
    );
    expect(usage).not.toBeNull();
    expect(usage?.textContent).toContain("3 images");
    r.unmount();
  });

  test("usage count block is absent when null", () => {
    const r = render(
      createElement(TagRow, {
        tag: TAG,
        usageCount: null,
        onEdit: jest.fn(),
        onDelete: jest.fn(),
      }),
    );
    expect(
      r.container.querySelector("[data-testid='tag-row-usage']"),
    ).toBeNull();
    r.unmount();
  });
});
