/**
 * Tests for `usePendingCharacterChanges` hook and `deriveCharacterBaselineState`.
 *
 * Covers:
 *   - toggle: unchecked -> adding
 *   - toggle: checked -> removing
 *   - toggle: indeterminate -> adding
 *   - toggle: adding -> neutral (undo)
 *   - toggle: removing -> neutral (undo)
 *   - clear resets all state
 *   - getEffectiveState returns correct pending info
 *   - hasChanges tracks add/remove sets
 *   - count returns sum of add + remove
 *   - deriveCharacterBaselineState with all variations
 */

import { act } from "react-dom/test-utils";
import {
  usePendingCharacterChanges,
  deriveCharacterBaselineState,
} from "../../../src/pages/image-editor/use-pending-character-changes";
import { renderHookWithClient } from "../../test-utils";

describe("usePendingCharacterChanges", () => {
  test("initially has no changes", () => {
    const { result, unmount } = renderHookWithClient(() =>
      usePendingCharacterChanges(),
    );
    try {
      expect(result.current.hasChanges).toBe(false);
      expect(result.current.count).toBe(0);
      expect(result.current.adding.size).toBe(0);
      expect(result.current.removing.size).toBe(0);
    } finally {
      unmount();
    }
  });

  test("toggle: unchecked -> adding", () => {
    const { result, unmount } = renderHookWithClient(() =>
      usePendingCharacterChanges(),
    );
    try {
      act(() => {
        result.current.toggle(100, "unchecked");
      });
      expect(result.current.adding.has(100)).toBe(true);
      expect(result.current.removing.has(100)).toBe(false);
      expect(result.current.hasChanges).toBe(true);
      expect(result.current.count).toBe(1);
    } finally {
      unmount();
    }
  });

  test("toggle: checked -> removing", () => {
    const { result, unmount } = renderHookWithClient(() =>
      usePendingCharacterChanges(),
    );
    try {
      act(() => {
        result.current.toggle(100, "checked");
      });
      expect(result.current.removing.has(100)).toBe(true);
      expect(result.current.adding.has(100)).toBe(false);
      expect(result.current.hasChanges).toBe(true);
      expect(result.current.count).toBe(1);
    } finally {
      unmount();
    }
  });

  test("toggle: indeterminate -> adding", () => {
    const { result, unmount } = renderHookWithClient(() =>
      usePendingCharacterChanges(),
    );
    try {
      act(() => {
        result.current.toggle(100, "indeterminate");
      });
      expect(result.current.adding.has(100)).toBe(true);
      expect(result.current.removing.has(100)).toBe(false);
    } finally {
      unmount();
    }
  });

  test("toggle: adding -> neutral (undo add)", () => {
    const { result, unmount } = renderHookWithClient(() =>
      usePendingCharacterChanges(),
    );
    try {
      act(() => {
        result.current.toggle(100, "unchecked");
      });
      expect(result.current.adding.has(100)).toBe(true);
      act(() => {
        result.current.toggle(100, "unchecked");
      });
      expect(result.current.adding.has(100)).toBe(false);
      expect(result.current.hasChanges).toBe(false);
    } finally {
      unmount();
    }
  });

  test("toggle: removing -> neutral (undo remove)", () => {
    const { result, unmount } = renderHookWithClient(() =>
      usePendingCharacterChanges(),
    );
    try {
      act(() => {
        result.current.toggle(100, "checked");
      });
      expect(result.current.removing.has(100)).toBe(true);
      act(() => {
        result.current.toggle(100, "checked");
      });
      expect(result.current.removing.has(100)).toBe(false);
      expect(result.current.hasChanges).toBe(false);
    } finally {
      unmount();
    }
  });

  test("clear resets all pending state", () => {
    const { result, unmount } = renderHookWithClient(() =>
      usePendingCharacterChanges(),
    );
    try {
      act(() => {
        result.current.toggle(100, "unchecked");
        result.current.toggle(200, "checked");
      });
      expect(result.current.count).toBe(2);
      act(() => {
        result.current.clear();
      });
      expect(result.current.hasChanges).toBe(false);
      expect(result.current.count).toBe(0);
      expect(result.current.adding.size).toBe(0);
      expect(result.current.removing.size).toBe(0);
    } finally {
      unmount();
    }
  });

  test("getEffectiveState returns pending info for adding", () => {
    const { result, unmount } = renderHookWithClient(() =>
      usePendingCharacterChanges(),
    );
    try {
      act(() => {
        result.current.toggle(100, "unchecked");
      });
      const effective = result.current.getEffectiveState(100, "unchecked");
      expect(effective.pending).toBe("adding");
      expect(effective.state).toBe("unchecked");
    } finally {
      unmount();
    }
  });

  test("getEffectiveState returns pending info for removing", () => {
    const { result, unmount } = renderHookWithClient(() =>
      usePendingCharacterChanges(),
    );
    try {
      act(() => {
        result.current.toggle(100, "checked");
      });
      const effective = result.current.getEffectiveState(100, "checked");
      expect(effective.pending).toBe("removing");
      expect(effective.state).toBe("checked");
    } finally {
      unmount();
    }
  });

  test("getEffectiveState returns null pending when not modified", () => {
    const { result, unmount } = renderHookWithClient(() =>
      usePendingCharacterChanges(),
    );
    try {
      const effective = result.current.getEffectiveState(100, "checked");
      expect(effective.pending).toBeNull();
      expect(effective.state).toBe("checked");
    } finally {
      unmount();
    }
  });

  test("multiple characters can be toggled independently", () => {
    const { result, unmount } = renderHookWithClient(() =>
      usePendingCharacterChanges(),
    );
    try {
      act(() => {
        result.current.toggle(100, "unchecked");
      });
      act(() => {
        result.current.toggle(200, "checked");
      });
      act(() => {
        result.current.toggle(300, "indeterminate");
      });
      expect(result.current.adding.has(100)).toBe(true);
      expect(result.current.removing.has(200)).toBe(true);
      expect(result.current.adding.has(300)).toBe(true);
      expect(result.current.count).toBe(3);
    } finally {
      unmount();
    }
  });
});

describe("deriveCharacterBaselineState", () => {
  test("returns unchecked when totalSelected <= 0", () => {
    expect(deriveCharacterBaselineState(5, 0)).toBe("unchecked");
    expect(deriveCharacterBaselineState(5, -1)).toBe("unchecked");
  });

  test("returns checked when fileCount >= totalSelected", () => {
    expect(deriveCharacterBaselineState(3, 3)).toBe("checked");
    expect(deriveCharacterBaselineState(5, 3)).toBe("checked");
  });

  test("returns indeterminate when 0 < fileCount < totalSelected", () => {
    expect(deriveCharacterBaselineState(2, 5)).toBe("indeterminate");
    expect(deriveCharacterBaselineState(1, 3)).toBe("indeterminate");
  });

  test("returns unchecked when fileCount is 0", () => {
    expect(deriveCharacterBaselineState(0, 5)).toBe("unchecked");
  });
});
