/**
 * Tests for `CategorySection` (ui-design §3.5, wireframe 05).
 *
 * Proves:
 *   - Renders the header with label + count.
 *   - Clicking the header toggles children visibility.
 *   - Keyboard Enter and Space toggle the section (button semantics).
 *   - `onToggle` is called with the new state.
 *   - Controlled mode: the component respects a parent-owned `open` prop.
 */
import { act } from "react-dom/test-utils";

import { CategorySection } from "../../../src/components/shared/category-section";
import { renderWithClient } from "../../test-utils";

const CATEGORY = {
  key: "scene" as const,
  label: "Scene / Action",
  tagCount: 5,
};

function pressKey(node: HTMLElement, key: string) {
  act(() => {
    const event = new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
    });
    node.dispatchEvent(event);
  });
}

describe("CategorySection", () => {
  test("renders label + tag count", () => {
    const { container, unmount } = renderWithClient(
      <CategorySection category={CATEGORY}>
        <div>Child A</div>
      </CategorySection>,
    );
    try {
      expect(container.textContent).toContain("Scene / Action");
      const badge = container.querySelector(
        "[data-testid='category-section-badge']",
      );
      expect(badge?.textContent).toBe("5");
    } finally {
      unmount();
    }
  });

  test("starts open by default so children are visible", () => {
    const { container, unmount } = renderWithClient(
      <CategorySection category={CATEGORY}>
        <div data-testid="child">Child A</div>
      </CategorySection>,
    );
    try {
      const header = container.querySelector(
        "[data-testid='category-section-header']",
      );
      expect(header?.getAttribute("aria-expanded")).toBe("true");
      expect(container.querySelector("[data-testid='child']")).not.toBeNull();
    } finally {
      unmount();
    }
  });

  test("defaultOpen=false starts closed and hides children", () => {
    const { container, unmount } = renderWithClient(
      <CategorySection category={CATEGORY} defaultOpen={false}>
        <div data-testid="child">Child A</div>
      </CategorySection>,
    );
    try {
      const header = container.querySelector(
        "[data-testid='category-section-header']",
      );
      expect(header?.getAttribute("aria-expanded")).toBe("false");
      expect(container.querySelector("[data-testid='child']")).toBeNull();
    } finally {
      unmount();
    }
  });

  test("clicking the header toggles visibility and calls onToggle", () => {
    const onToggle = jest.fn();
    const { container, unmount } = renderWithClient(
      <CategorySection category={CATEGORY} onToggle={onToggle}>
        <div data-testid="child">Child A</div>
      </CategorySection>,
    );
    try {
      const header = container.querySelector<HTMLElement>(
        "[data-testid='category-section-header']",
      );
      act(() => {
        header!.click();
      });
      expect(onToggle).toHaveBeenCalledWith(false);
      expect(header!.getAttribute("aria-expanded")).toBe("false");
      expect(container.querySelector("[data-testid='child']")).toBeNull();

      // Re-open.
      act(() => {
        header!.click();
      });
      expect(onToggle).toHaveBeenLastCalledWith(true);
      expect(header!.getAttribute("aria-expanded")).toBe("true");
      expect(container.querySelector("[data-testid='child']")).not.toBeNull();
    } finally {
      unmount();
    }
  });

  test("keyboard Enter toggles the section", () => {
    const onToggle = jest.fn();
    const { container, unmount } = renderWithClient(
      <CategorySection category={CATEGORY} onToggle={onToggle}>
        <div data-testid="child">Child A</div>
      </CategorySection>,
    );
    try {
      const header = container.querySelector<HTMLElement>(
        "[data-testid='category-section-header']",
      );
      expect(header).not.toBeNull();
      pressKey(header!, "Enter");
      expect(onToggle).toHaveBeenCalledWith(false);
      expect(header!.getAttribute("aria-expanded")).toBe("false");
    } finally {
      unmount();
    }
  });

  test("keyboard Space toggles the section", () => {
    const onToggle = jest.fn();
    const { container, unmount } = renderWithClient(
      <CategorySection category={CATEGORY} onToggle={onToggle}>
        <div data-testid="child">Child A</div>
      </CategorySection>,
    );
    try {
      const header = container.querySelector<HTMLElement>(
        "[data-testid='category-section-header']",
      );
      pressKey(header!, " ");
      expect(onToggle).toHaveBeenCalledWith(false);
      expect(header!.getAttribute("aria-expanded")).toBe("false");
    } finally {
      unmount();
    }
  });

  test("controlled open prop overrides internal state", () => {
    const onToggle = jest.fn();
    const { container, unmount } = renderWithClient(
      <CategorySection category={CATEGORY} open={false} onToggle={onToggle}>
        <div data-testid="child">Child A</div>
      </CategorySection>,
    );
    try {
      const header = container.querySelector<HTMLElement>(
        "[data-testid='category-section-header']",
      );
      expect(header!.getAttribute("aria-expanded")).toBe("false");
      act(() => {
        header!.click();
      });
      // Controlled: parent must react to onToggle; internal state is
      // ignored so the element stays closed.
      expect(onToggle).toHaveBeenCalledWith(true);
      expect(header!.getAttribute("aria-expanded")).toBe("false");
    } finally {
      unmount();
    }
  });
});
