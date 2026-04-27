/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * Tests for `TagRow` (ui-design §3.5 / wireframe 05).
 *
 * Verifies:
 *   - The tag chip renders and clicking it fires the `onEdit` callback.
 *   - The edit pencil button fires `onEdit` and stops propagation so the chip
 *     onClick does NOT also fire.
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

  test("edit pencil fires onEdit without bubbling chip click", () => {
    const onEdit = jest.fn();
    const r = render(
      createElement(TagRow, {
        tag: TAG,
        onEdit,
        onDelete: jest.fn(),
      }),
    );
    const editBtn = r.container.querySelector<HTMLButtonElement>(
      "[data-testid='tag-row-edit']",
    )!;
    act(() => {
      editBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    // Only the explicit handler fires — the chip's onClick is not reached
    // because stopPropagation halts the bubble, and even if it did bubble
    // through, the call would still be one because the pencil delegates to
    // onEdit directly.
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(editBtn.getAttribute("aria-label")).toBe("Edit tag Sunset");
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
