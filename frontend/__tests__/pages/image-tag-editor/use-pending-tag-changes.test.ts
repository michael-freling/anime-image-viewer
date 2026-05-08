/**
 * Unit tests for `usePendingTagChanges` and `deriveBaselineState`.
 *
 * These tests exercise the state-transition matrix documented in
 * `ui-design.md §3.6` (Image Tag Editor): the interaction between the
 * baseline tri-state (derived from useTagStats) and the user's pending
 * add/remove edits. Keeping this coverage separate from the page tests
 * lets us assert the pure logic without paying for DOM/Chakra rendering.
 */
import { act } from "react-dom/test-utils";

import {
  deriveBaselineState,
  usePendingTagChanges,
} from "../../../src/pages/image-tag-editor/use-pending-tag-changes";
import { renderHookWithClient } from "../../test-utils";

describe("deriveBaselineState", () => {
  test("returns 'checked' when every selected image has the tag", () => {
    expect(deriveBaselineState(5, 5)).toBe("checked");
  });

  test("returns 'indeterminate' when some but not all have the tag", () => {
    expect(deriveBaselineState(2, 5)).toBe("indeterminate");
  });

  test("returns 'unchecked' when no selected image has the tag", () => {
    expect(deriveBaselineState(0, 5)).toBe("unchecked");
  });

  test("returns 'unchecked' when selection is empty", () => {
    expect(deriveBaselineState(0, 0)).toBe("unchecked");
    // fileCount can't exceed totalSelected in practice, but be defensive:
    expect(deriveBaselineState(3, 0)).toBe("unchecked");
  });

  test("fileCount >= totalSelected counts as 'checked' (over-count safety)", () => {
    expect(deriveBaselineState(7, 5)).toBe("checked");
  });
});

describe("usePendingTagChanges", () => {
  test("starts empty — no adding, no removing, no changes", () => {
    const { result, unmount } = renderHookWithClient(() =>
      usePendingTagChanges(),
    );
    try {
      expect(result.current.adding.size).toBe(0);
      expect(result.current.removing.size).toBe(0);
      expect(result.current.count).toBe(0);
      expect(result.current.hasChanges).toBe(false);
    } finally {
      unmount();
    }
  });

  test("unchecked baseline + toggle → pending adding", () => {
    const { result, unmount } = renderHookWithClient(() =>
      usePendingTagChanges(),
    );
    try {
      act(() => {
        result.current.toggle(42, "unchecked");
      });
      expect(result.current.adding.has(42)).toBe(true);
      expect(result.current.removing.has(42)).toBe(false);
      expect(result.current.count).toBe(1);
      expect(result.current.hasChanges).toBe(true);
      const eff = result.current.getEffectiveState(42, "unchecked");
      expect(eff.pending).toBe("adding");
      expect(eff.state).toBe("unchecked");
    } finally {
      unmount();
    }
  });

  test("indeterminate baseline + toggle → pending adding (resolve to add-all)", () => {
    const { result, unmount } = renderHookWithClient(() =>
      usePendingTagChanges(),
    );
    try {
      act(() => {
        result.current.toggle(7, "indeterminate");
      });
      expect(result.current.adding.has(7)).toBe(true);
      expect(result.current.removing.has(7)).toBe(false);
      const eff = result.current.getEffectiveState(7, "indeterminate");
      expect(eff.pending).toBe("adding");
    } finally {
      unmount();
    }
  });

  test("checked baseline + toggle → pending removing", () => {
    const { result, unmount } = renderHookWithClient(() =>
      usePendingTagChanges(),
    );
    try {
      act(() => {
        result.current.toggle(9, "checked");
      });
      expect(result.current.removing.has(9)).toBe(true);
      expect(result.current.adding.has(9)).toBe(false);
      const eff = result.current.getEffectiveState(9, "checked");
      expect(eff.pending).toBe("removing");
    } finally {
      unmount();
    }
  });

  test("second toggle on a pending add clears the edit (back to baseline)", () => {
    const { result, unmount } = renderHookWithClient(() =>
      usePendingTagChanges(),
    );
    try {
      act(() => {
        result.current.toggle(1, "unchecked");
      });
      expect(result.current.adding.has(1)).toBe(true);
      act(() => {
        // Baseline is still "unchecked" — re-click clears the pending entry.
        result.current.toggle(1, "unchecked");
      });
      expect(result.current.adding.has(1)).toBe(false);
      expect(result.current.removing.has(1)).toBe(false);
      expect(result.current.hasChanges).toBe(false);
    } finally {
      unmount();
    }
  });

  test("second toggle on a pending remove clears the edit", () => {
    const { result, unmount } = renderHookWithClient(() =>
      usePendingTagChanges(),
    );
    try {
      act(() => {
        result.current.toggle(2, "checked");
      });
      expect(result.current.removing.has(2)).toBe(true);
      act(() => {
        result.current.toggle(2, "checked");
      });
      expect(result.current.removing.has(2)).toBe(false);
      expect(result.current.hasChanges).toBe(false);
    } finally {
      unmount();
    }
  });

  test("count and hasChanges track adding + removing set sizes", () => {
    const { result, unmount } = renderHookWithClient(() =>
      usePendingTagChanges(),
    );
    try {
      // Each toggle is its own synchronous user click; dispatch them in
      // separate act() blocks so the hook's state is re-read between calls.
      act(() => {
        result.current.toggle(10, "unchecked"); // adds 10
      });
      act(() => {
        result.current.toggle(11, "unchecked"); // adds 11
      });
      act(() => {
        result.current.toggle(20, "checked"); // removes 20
      });
      expect(result.current.count).toBe(3);
      expect(result.current.hasChanges).toBe(true);
      expect(result.current.adding.size).toBe(2);
      expect(result.current.removing.size).toBe(1);
    } finally {
      unmount();
    }
  });

  test("clear() resets both sets to empty", () => {
    const { result, unmount } = renderHookWithClient(() =>
      usePendingTagChanges(),
    );
    try {
      act(() => {
        result.current.toggle(10, "unchecked");
      });
      act(() => {
        result.current.toggle(20, "checked");
      });
      expect(result.current.hasChanges).toBe(true);
      act(() => {
        result.current.clear();
      });
      expect(result.current.adding.size).toBe(0);
      expect(result.current.removing.size).toBe(0);
      expect(result.current.hasChanges).toBe(false);
      expect(result.current.count).toBe(0);
    } finally {
      unmount();
    }
  });

  test("getEffectiveState returns pending=null when no edit is queued", () => {
    const { result, unmount } = renderHookWithClient(() =>
      usePendingTagChanges(),
    );
    try {
      const eff = result.current.getEffectiveState(99, "indeterminate");
      expect(eff.pending).toBeNull();
      expect(eff.state).toBe("indeterminate");
    } finally {
      unmount();
    }
  });
});
