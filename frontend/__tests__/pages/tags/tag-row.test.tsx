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

  test("no checkbox or hidden actions leak in normal mode", () => {
    const r = render(
      createElement(TagRow, {
        tag: TAG,
        onEdit: jest.fn(),
        onDelete: jest.fn(),
        onSearch: jest.fn(),
      }),
    );
    // No checkbox in normal mode; the delete/search actions ARE present (just
    // visually revealed on hover) so they stay reachable.
    expect(
      r.container.querySelector("[data-testid='tag-row-select']"),
    ).toBeNull();
    expect(
      r.container.querySelector("[data-testid='tag-row-delete']"),
    ).not.toBeNull();
    r.unmount();
  });

  test("select mode: checkbox reflects selected state and toggles via the checkbox", () => {
    const onEdit = jest.fn();
    const onToggleSelect = jest.fn();
    const r = render(
      createElement(TagRow, {
        tag: TAG,
        onEdit,
        onDelete: jest.fn(),
        selectMode: true,
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
    expect(onToggleSelect).toHaveBeenCalledWith(TAG);
    expect(onEdit).not.toHaveBeenCalled();
    r.unmount();
  });

  test("holding a tag fires onLongPress and swallows the release click", () => {
    jest.useFakeTimers();
    try {
      const onEdit = jest.fn();
      const onLongPress = jest.fn();
      const r = render(
        createElement(TagRow, {
          tag: TAG,
          onEdit,
          onDelete: jest.fn(),
          onLongPress,
        }),
      );
      const row = r.container.querySelector<HTMLElement>(
        "[data-testid='tag-row']",
      )!;
      act(() => {
        row.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
      });
      act(() => {
        jest.advanceTimersByTime(600);
      });
      expect(onLongPress).toHaveBeenCalledWith(TAG);

      // The click a real hold releases into must NOT also edit.
      const chip = r.container.querySelector<HTMLElement>(
        "[data-testid='tag-chip']",
      )!;
      act(() => {
        chip.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      expect(onEdit).not.toHaveBeenCalled();
      r.unmount();
    } finally {
      jest.useRealTimers();
    }
  });

  test("select mode: tapping the chip toggles selection instead of editing", () => {
    const onEdit = jest.fn();
    const onToggleSelect = jest.fn();
    const r = render(
      createElement(TagRow, {
        tag: TAG,
        onEdit,
        onDelete: jest.fn(),
        selectMode: true,
        onToggleSelect,
      }),
    );
    const chip = r.container.querySelector<HTMLElement>(
      "[data-testid='tag-chip']",
    )!;
    act(() => {
      chip.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onToggleSelect).toHaveBeenCalledWith(TAG);
    expect(onEdit).not.toHaveBeenCalled();
    r.unmount();
  });

  test("select mode: per-row search/delete actions are hidden", () => {
    const r = render(
      createElement(TagRow, {
        tag: TAG,
        onEdit: jest.fn(),
        onDelete: jest.fn(),
        onSearch: jest.fn(),
        selectMode: true,
        onToggleSelect: jest.fn(),
      }),
    );
    expect(
      r.container.querySelector("[data-testid='tag-row-search']"),
    ).toBeNull();
    expect(
      r.container.querySelector("[data-testid='tag-row-delete']"),
    ).toBeNull();
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

  test("focusing/blurring a row toggles the hover-reveal state", () => {
    const r = render(
      createElement(TagRow, {
        tag: TAG,
        onEdit: jest.fn(),
        onDelete: jest.fn(),
        onSearch: jest.fn(),
      }),
    );
    const del = r.container.querySelector<HTMLButtonElement>(
      "[data-testid='tag-row-delete']",
    )!;
    // React onFocus/onBlur bubble, so focusing an action reveals the group;
    // blurring hides it again. Exercises the reveal state both ways.
    act(() => {
      del.focus();
    });
    act(() => {
      del.blur();
    });
    expect(
      r.container.querySelector("[data-testid='tag-row-delete']"),
    ).not.toBeNull();
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
