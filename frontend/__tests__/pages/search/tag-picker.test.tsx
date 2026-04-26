/**
 * Tests for `TagPicker`.
 *
 * Verifies bucketing-by-category, the empty-state branch when there are no
 * tags, and that clicking a chip fires onCycleTag.
 */
import { act } from "react-dom/test-utils";

import { TagPicker } from "../../../src/pages/search/tag-picker";
import type { Tag } from "../../../src/types";
import { renderWithClient } from "../../test-utils";

const TAGS: Tag[] = [
  { id: 1, name: "Outdoor", category: "scene" },
  { id: 2, name: "Indoor", category: "scene" },
  { id: 3, name: "Sunny", category: "nature" },
];

describe("TagPicker", () => {
  test("renders one CategorySection per non-empty bucket", () => {
    const { container, unmount } = renderWithClient(
      <TagPicker
        tags={TAGS}
        includedIds={[]}
        excludedIds={[]}
        onCycleTag={() => undefined}
      />,
    );
    try {
      const sections = container.querySelectorAll(
        "[data-testid='category-section']",
      );
      expect(sections.length).toBe(2); // scene + nature
      const keys = Array.from(sections).map((s) =>
        s.getAttribute("data-category-key"),
      );
      expect(keys).toEqual(["scene", "nature"]);
    } finally {
      unmount();
    }
  });

  test("empty tag list renders the 'No tags yet' empty state", () => {
    // Drives the `buckets.length === 0` branch.
    const { container, unmount } = renderWithClient(
      <TagPicker
        tags={[]}
        includedIds={[]}
        excludedIds={[]}
        onCycleTag={() => undefined}
      />,
    );
    try {
      expect(
        container.querySelector("[data-testid='tag-picker-empty']"),
      ).not.toBeNull();
      expect(container.textContent).toContain("No tags yet");
    } finally {
      unmount();
    }
  });

  test("clicking an unincluded chip fires onCycleTag with its id", () => {
    const onToggle = jest.fn();
    const { container, unmount } = renderWithClient(
      <TagPicker
        tags={TAGS}
        includedIds={[]}
        excludedIds={[]}
        onCycleTag={onToggle}
      />,
    );
    try {
      // Expand all sections since groups are collapsed by default.
      const headers = container.querySelectorAll("[data-testid='category-section-header']");
      headers.forEach((h) => {
        act(() => {
          (h as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
      });

      const chips = container.querySelectorAll(
        "[data-testid='tag-chip']",
      );
      // Find the "Outdoor" chip.
      const outdoor = Array.from(chips).find((c) =>
        (c.textContent ?? "").includes("Outdoor"),
      ) as HTMLElement;
      expect(outdoor).toBeDefined();
      act(() => {
        outdoor.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      expect(onToggle).toHaveBeenCalledWith(1);
    } finally {
      unmount();
    }
  });

  test("included chips render with active=true", () => {
    const { container, unmount } = renderWithClient(
      <TagPicker
        tags={TAGS}
        includedIds={[1]}
        excludedIds={[]}
        onCycleTag={() => undefined}
      />,
    );
    try {
      // Expand all sections since groups are collapsed by default.
      const headers = container.querySelectorAll("[data-testid='category-section-header']");
      headers.forEach((h) => {
        act(() => {
          (h as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
      });

      const chips = container.querySelectorAll(
        "[data-testid='tag-chip']",
      );
      const outdoor = Array.from(chips).find((c) =>
        (c.textContent ?? "").includes("Outdoor"),
      ) as HTMLElement;
      // The TagChip writes data-active="true" when active.
      expect(outdoor.getAttribute("data-active")).toBe("true");
    } finally {
      unmount();
    }
  });

  test("excluded chips render with the '(excluded)' label suffix", () => {
    // Drives the `isExcluded ? ... : undefined` ternary inside the chip map.
    const { container, unmount } = renderWithClient(
      <TagPicker
        tags={TAGS}
        includedIds={[]}
        excludedIds={[1]}
        onCycleTag={() => undefined}
      />,
    );
    try {
      // Expand all sections since groups are collapsed by default.
      const headers = container.querySelectorAll("[data-testid='category-section-header']");
      headers.forEach((h) => {
        act(() => {
          (h as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
      });

      // The TagChip renders the `label` prop verbatim in its label box.
      const labels = container.querySelectorAll(
        "[data-testid='tag-chip-label']",
      );
      const matched = Array.from(labels).some((l) =>
        (l.textContent ?? "").includes("Outdoor (excluded)"),
      );
      expect(matched).toBe(true);
    } finally {
      unmount();
    }
  });

  test("excluded chips render with data-excluded attribute", () => {
    const { container, unmount } = renderWithClient(
      <TagPicker
        tags={TAGS}
        includedIds={[]}
        excludedIds={[1]}
        onCycleTag={() => undefined}
      />,
    );
    try {
      // Expand all sections since groups are collapsed by default.
      const headers = container.querySelectorAll("[data-testid='category-section-header']");
      headers.forEach((h) => {
        act(() => {
          (h as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
      });

      const chips = container.querySelectorAll("[data-testid='tag-chip']");
      const outdoor = Array.from(chips).find((c) =>
        (c.textContent ?? "").includes("Outdoor"),
      ) as HTMLElement;
      // The TagChip writes data-excluded="true" when excluded.
      expect(outdoor.getAttribute("data-excluded")).toBe("true");
      // Should NOT be active.
      expect(outdoor.getAttribute("data-active")).toBeNull();
    } finally {
      unmount();
    }
  });

  test("clicking an excluded chip fires onCycleTag to advance to unset", () => {
    const onCycle = jest.fn();
    const { container, unmount } = renderWithClient(
      <TagPicker
        tags={TAGS}
        includedIds={[]}
        excludedIds={[2]}
        onCycleTag={onCycle}
      />,
    );
    try {
      // Expand all sections since groups are collapsed by default.
      const headers = container.querySelectorAll("[data-testid='category-section-header']");
      headers.forEach((h) => {
        act(() => {
          (h as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
      });

      const chips = container.querySelectorAll("[data-testid='tag-chip']");
      const indoor = Array.from(chips).find((c) =>
        (c.textContent ?? "").includes("Indoor"),
      ) as HTMLElement;
      expect(indoor).toBeDefined();
      act(() => {
        indoor.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      // The cycle callback receives the tag id regardless of current state.
      expect(onCycle).toHaveBeenCalledWith(2);
    } finally {
      unmount();
    }
  });

  test("alphabetical ordering inside a bucket", () => {
    const { container, unmount } = renderWithClient(
      <TagPicker
        tags={[
          { id: 1, name: "Zoo", category: "scene" },
          { id: 2, name: "Aardvark", category: "scene" },
          { id: 3, name: "Mango", category: "scene" },
        ]}
        includedIds={[]}
        excludedIds={[]}
        onCycleTag={() => undefined}
      />,
    );
    try {
      // Expand all sections since groups are collapsed by default.
      const headers = container.querySelectorAll("[data-testid='category-section-header']");
      headers.forEach((h) => {
        act(() => {
          (h as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
      });

      const bucket = container.querySelector(
        "[data-testid='tag-picker-scene']",
      );
      const names = Array.from(
        bucket?.querySelectorAll("[data-testid='tag-chip']") ?? [],
      ).map((c) => c.textContent?.trim());
      expect(names).toEqual(["Aardvark", "Mango", "Zoo"]);
    } finally {
      unmount();
    }
  });

  test("unknown category falls into the uncategorized bucket", () => {
    const { container, unmount } = renderWithClient(
      <TagPicker
        tags={[{ id: 1, name: "Loose", category: "made-up" }]}
        includedIds={[]}
        excludedIds={[]}
        onCycleTag={() => undefined}
      />,
    );
    try {
      const section = container.querySelector(
        "[data-testid='category-section']",
      );
      expect(section?.getAttribute("data-category-key")).toBe("uncategorized");
    } finally {
      unmount();
    }
  });
});
