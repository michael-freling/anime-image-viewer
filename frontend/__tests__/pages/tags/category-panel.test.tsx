/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * Tests for `CategoryPanel` — the per-category body of the Tag Management
 * page (ui-design §3.5).
 *
 * The panel wraps `CategorySection` (tested separately) and renders either a
 * flex-wrap grid of `TagRow`s or the "no tags" stub with an inline add button.
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

import { CategoryPanel } from "../../../src/pages/tags/category-panel";
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

const NATURE_TAGS: Tag[] = [
  { id: 1, name: "Rain", category: "nature" },
  { id: 2, name: "Snow", category: "nature" },
];

describe("CategoryPanel", () => {
  test("renders a grid of TagRow entries when tags are present", () => {
    const r = render(
      createElement(CategoryPanel, {
        categoryKey: "nature",
        tags: NATURE_TAGS,
        usageByTagId: new Map(),
        onAddInCategory: jest.fn(),
        onEditTag: jest.fn(),
        onDeleteTag: jest.fn(),
      }),
    );
    const grid = r.container.querySelector(
      "[data-testid='category-panel-grid']",
    );
    expect(grid).not.toBeNull();
    expect(grid?.getAttribute("data-category-key")).toBe("nature");
    const rows = r.container.querySelectorAll("[data-testid='tag-row']");
    expect(rows.length).toBe(2);
    expect(r.container.textContent).toContain("Rain");
    expect(r.container.textContent).toContain("Snow");
    r.unmount();
  });

  test("renders the empty stub + inline add button when tags is empty", () => {
    const onAdd = jest.fn();
    const r = render(
      createElement(CategoryPanel, {
        categoryKey: "mood",
        tags: [],
        usageByTagId: new Map(),
        onAddInCategory: onAdd,
        onEditTag: jest.fn(),
        onDeleteTag: jest.fn(),
      }),
    );
    const empty = r.container.querySelector(
      "[data-testid='category-panel-empty']",
    );
    expect(empty).not.toBeNull();
    expect(empty?.getAttribute("data-category-key")).toBe("mood");
    expect(r.container.textContent).toContain("No tags in this category yet.");

    const add = r.container.querySelector<HTMLButtonElement>(
      "[data-testid='category-panel-add']",
    )!;
    act(() => {
      add.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onAdd).toHaveBeenCalledWith("mood");
    r.unmount();
  });

  test("passes usage counts through to the rendered rows", () => {
    const r = render(
      createElement(CategoryPanel, {
        categoryKey: "nature",
        tags: NATURE_TAGS,
        usageByTagId: new Map<number, number>([
          [1, 4],
          [2, 0],
        ]),
        onAddInCategory: jest.fn(),
        onEditTag: jest.fn(),
        onDeleteTag: jest.fn(),
      }),
    );
    // The usage block is only rendered when count is a number; both rows
    // receive numeric values so both show a block.
    const usages = r.container.querySelectorAll(
      "[data-testid='tag-row-usage']",
    );
    expect(usages.length).toBe(2);
    expect(usages[0].textContent).toContain("4 images");
    expect(usages[1].textContent).toContain("0 images");
    r.unmount();
  });

  test("delegates row edit/delete to the parent callbacks", () => {
    const onEdit = jest.fn();
    const onDelete = jest.fn();
    const r = render(
      createElement(CategoryPanel, {
        categoryKey: "nature",
        tags: NATURE_TAGS,
        usageByTagId: new Map(),
        onAddInCategory: jest.fn(),
        onEditTag: onEdit,
        onDeleteTag: onDelete,
      }),
    );
    const edits = r.container.querySelectorAll<HTMLButtonElement>(
      "[data-testid='tag-row-edit']",
    );
    const deletes = r.container.querySelectorAll<HTMLButtonElement>(
      "[data-testid='tag-row-delete']",
    );
    act(() => {
      edits[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onEdit).toHaveBeenCalledWith(NATURE_TAGS[0]);

    act(() => {
      deletes[1].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onDelete).toHaveBeenCalledWith(NATURE_TAGS[1]);
    r.unmount();
  });
});
