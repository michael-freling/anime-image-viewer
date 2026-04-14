/**
 * Tests for `use-rubber-band`.
 *
 * Coverage:
 *   - Pure helpers (normaliseRect, rectsOverlap) — unit tests.
 *   - Stateful hook lifecycle — driven through the shared render harness
 *     with stubbed element bounding rects.
 *
 * We mock `getBoundingClientRect` on fake DOM nodes by overriding the
 * method per-node — jsdom returns zeroes otherwise.
 */
import { useRef } from "react";
import { act } from "react-dom/test-utils";

import {
  useRubberBand,
  __test,
  type UseRubberBandReturn,
} from "../../src/hooks/use-rubber-band";
import { renderHookWithClient } from "../test-utils";

const { normaliseRect, rectsOverlap } = __test;

describe("normaliseRect", () => {
  test("produces positive width/height for forward drag", () => {
    expect(normaliseRect({ x: 10, y: 20 }, { x: 50, y: 80 })).toEqual({
      x: 10,
      y: 20,
      w: 40,
      h: 60,
    });
  });

  test("normalises a backward drag (right-to-left, bottom-to-top)", () => {
    expect(normaliseRect({ x: 50, y: 80 }, { x: 10, y: 20 })).toEqual({
      x: 10,
      y: 20,
      w: 40,
      h: 60,
    });
  });

  test("handles zero-distance drags", () => {
    expect(normaliseRect({ x: 5, y: 5 }, { x: 5, y: 5 })).toEqual({
      x: 5,
      y: 5,
      w: 0,
      h: 0,
    });
  });
});

describe("rectsOverlap", () => {
  const A = { x: 0, y: 0, w: 100, h: 100 };

  test("returns true for fully contained rect", () => {
    expect(rectsOverlap(A, { x: 10, y: 10, w: 20, h: 20 })).toBe(true);
  });

  test("returns true for partial overlap (right edge)", () => {
    expect(rectsOverlap(A, { x: 90, y: 40, w: 50, h: 20 })).toBe(true);
  });

  test("returns true for partial overlap (corner)", () => {
    expect(rectsOverlap(A, { x: 95, y: 95, w: 50, h: 50 })).toBe(true);
  });

  test("returns false for disjoint rects (horizontal gap)", () => {
    expect(rectsOverlap(A, { x: 200, y: 10, w: 10, h: 10 })).toBe(false);
  });

  test("returns false for disjoint rects (vertical gap)", () => {
    expect(rectsOverlap(A, { x: 10, y: 200, w: 10, h: 10 })).toBe(false);
  });

  test("returns false when rects merely touch (no overlap)", () => {
    // Strict inequality: touching edges don't overlap.
    expect(rectsOverlap(A, { x: 100, y: 0, w: 10, h: 10 })).toBe(false);
  });
});

// -----------------------------------------------------------------------
// Stateful hook tests
// -----------------------------------------------------------------------

/**
 * Create a jsdom-compatible DOMRect stub whose `getBoundingClientRect`
 * returns the supplied coordinates.
 */
function mockBounds(
  el: HTMLElement,
  box: { left: number; top: number; width: number; height: number },
): void {
  el.getBoundingClientRect = () =>
    ({
      left: box.left,
      top: box.top,
      width: box.width,
      height: box.height,
      right: box.left + box.width,
      bottom: box.top + box.height,
      x: box.left,
      y: box.top,
      toJSON: () => ({}),
    }) as DOMRect;
}

interface Fixture {
  hook: UseRubberBandReturn;
  container: HTMLDivElement;
  unmount: () => void;
}

function mountFixture(
  containerBox: { left: number; top: number; width: number; height: number },
  imageBoxes: Array<{
    id: number;
    left: number;
    top: number;
    width: number;
    height: number;
  }>,
): Fixture {
  // Real jsdom container + real image nodes so refs point at live
  // elements. We mock their getBoundingClientRect above jsdom's default.
  const container = document.createElement("div");
  mockBounds(container, containerBox);
  document.body.appendChild(container);

  const refs = new Map<number, HTMLElement>();
  for (const box of imageBoxes) {
    const node = document.createElement("div");
    mockBounds(node, box);
    container.appendChild(node);
    refs.set(box.id, node);
  }

  // Render the hook via the shared harness. The ref contents are captured
  // via closure so the thunk doesn't need parameters.
  const view = renderHookWithClient<UseRubberBandReturn>(() => {
    const cRef = useRef<HTMLElement>(container);
    const rRef = useRef<Map<number, HTMLElement>>(refs);
    // Keep refs pointing at the outer instances across rerenders.
    cRef.current = container;
    rRef.current = refs;
    return useRubberBand({ containerRef: cRef, imageRefs: rRef });
  });

  return {
    get hook() {
      return view.result.current;
    },
    container,
    unmount: () => {
      view.unmount();
      container.parentNode?.removeChild(container);
    },
  } as unknown as Fixture;
}

describe("useRubberBand (stateful)", () => {
  test("startDrag initialises a zero-area rect at the cursor (container-relative)", () => {
    const fx = mountFixture(
      { left: 100, top: 50, width: 500, height: 500 },
      [],
    );
    act(() => {
      fx.hook.startDrag({ clientX: 150, clientY: 80 });
    });
    expect(fx.hook.isDragging).toBe(true);
    // (150 - 100, 80 - 50) = (50, 30).
    expect(fx.hook.rect).toEqual({ x: 50, y: 30, w: 0, h: 0 });
    fx.unmount();
  });

  test("moveDrag computes pending ids via bounding-box intersection (partial overlap counts)", () => {
    const fx = mountFixture(
      { left: 0, top: 0, width: 500, height: 500 },
      [
        { id: 1, left: 10, top: 10, width: 80, height: 80 }, // inside
        { id: 2, left: 200, top: 10, width: 80, height: 80 }, // outside
        { id: 3, left: 95, top: 50, width: 50, height: 50 }, // partial
      ],
    );

    act(() => fx.hook.startDrag({ clientX: 0, clientY: 0 }));
    act(() => fx.hook.moveDrag({ clientX: 100, clientY: 100 }));

    // Band rect: (0,0)→(100,100).
    expect(fx.hook.pendingIds.has(1)).toBe(true);
    expect(fx.hook.pendingIds.has(3)).toBe(true);
    expect(fx.hook.pendingIds.has(2)).toBe(false);
    fx.unmount();
  });

  test("moveDrag normalises when dragging backwards (right-to-left)", () => {
    const fx = mountFixture(
      { left: 0, top: 0, width: 500, height: 500 },
      [
        { id: 1, left: 10, top: 10, width: 40, height: 40 }, // inside
        { id: 2, left: 300, top: 300, width: 40, height: 40 }, // outside
      ],
    );

    act(() => fx.hook.startDrag({ clientX: 100, clientY: 100 }));
    act(() => fx.hook.moveDrag({ clientX: 5, clientY: 5 }));

    // Rect should span (5,5) → (100,100), not the inverse.
    expect(fx.hook.rect).toEqual({ x: 5, y: 5, w: 95, h: 95 });
    expect(fx.hook.pendingIds.has(1)).toBe(true);
    expect(fx.hook.pendingIds.has(2)).toBe(false);
    fx.unmount();
  });

  test("endDrag clears dragging state and rect but retains pending for commit", () => {
    const fx = mountFixture(
      { left: 0, top: 0, width: 500, height: 500 },
      [{ id: 1, left: 10, top: 10, width: 80, height: 80 }],
    );
    act(() => fx.hook.startDrag({ clientX: 0, clientY: 0 }));
    act(() => fx.hook.moveDrag({ clientX: 100, clientY: 100 }));
    act(() => fx.hook.endDrag());

    expect(fx.hook.isDragging).toBe(false);
    expect(fx.hook.rect).toBeNull();
    // pendingIds intentionally retained for caller commit.
    fx.unmount();
  });

  test("cancel clears everything including pendingIds", () => {
    const fx = mountFixture(
      { left: 0, top: 0, width: 500, height: 500 },
      [{ id: 1, left: 10, top: 10, width: 80, height: 80 }],
    );
    act(() => fx.hook.startDrag({ clientX: 0, clientY: 0 }));
    act(() => fx.hook.moveDrag({ clientX: 100, clientY: 100 }));
    expect(fx.hook.pendingIds.size).toBe(1);

    act(() => fx.hook.cancel());
    expect(fx.hook.isDragging).toBe(false);
    expect(fx.hook.rect).toBeNull();
    expect(fx.hook.pendingIds.size).toBe(0);
    fx.unmount();
  });

  test("startDrag is a no-op when containerRef has no current element", () => {
    const view = renderHookWithClient<UseRubberBandReturn>(() => {
      const cRef = useRef<HTMLElement>(null);
      const rRef = useRef<Map<number, HTMLElement>>(new Map());
      return useRubberBand({ containerRef: cRef, imageRefs: rRef });
    });
    act(() => {
      view.result.current.startDrag({ clientX: 10, clientY: 10 });
    });
    expect(view.result.current.isDragging).toBe(false);
    expect(view.result.current.rect).toBeNull();
    view.unmount();
  });
});
