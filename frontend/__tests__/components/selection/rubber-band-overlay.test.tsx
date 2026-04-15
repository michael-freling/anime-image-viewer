/**
 * Tests for `RubberBandOverlay`.
 *
 * Spec: ui-design.md §5.2 Rubber Band Details + §7 Accessibility.
 *
 * The overlay is a plain React component (no Chakra dependency), so any
 * render wrapper works. We use the shared `renderWithClient` harness for
 * consistency with other Phase C tests.
 *
 * We stub `getBoundingClientRect` on the container and each image tile so
 * hit-testing produces deterministic results under jsdom.
 */
import { useRef, useEffect } from "react";
import { act } from "react-dom/test-utils";

import { RubberBandOverlay } from "../../../src/components/selection/rubber-band-overlay";
import { renderWithClient } from "../../test-utils";

interface HarnessProps {
  onSelectionChange?: (ids: Set<number>) => void;
  onSelectionCommit?: (ids: Set<number>, additive: boolean) => void;
  getIdAtPoint?: (x: number, y: number) => number | null;
  ctrlOverride?: boolean;
  expose?: (container: HTMLElement) => void;
}

/**
 * Render the overlay inside a container that hosts three image tiles with
 * stable bounding rectangles:
 *
 *   container: (0, 0, 500, 500)
 *   tile 1:    (10, 10, 80, 80)     — upper-left
 *   tile 2:    (200, 10, 80, 80)    — upper-right
 *   tile 3:    (95, 50, 50, 50)     — straddles tile 1 / the centre
 */
function Harness(props: HarnessProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current!;
    container.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 500,
        height: 500,
        right: 500,
        bottom: 500,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    const rects: Array<[string, number, number, number, number]> = [
      ["1", 10, 10, 80, 80],
      ["2", 200, 10, 80, 80],
      ["3", 95, 50, 50, 50],
    ];
    for (const [id, left, top, w, h] of rects) {
      const node = container.querySelector(
        `[data-image-id="${id}"]`,
      ) as HTMLElement;
      node.getBoundingClientRect = () =>
        ({
          left,
          top,
          width: w,
          height: h,
          right: left + w,
          bottom: top + h,
          x: left,
          y: top,
          toJSON: () => ({}),
        }) as DOMRect;
    }
    props.expose?.(container);
  });

  return (
    <div ref={containerRef} data-testid="grid">
      <div data-image-id="1">img1</div>
      <div data-image-id="2">img2</div>
      <div data-image-id="3">img3</div>
      <RubberBandOverlay
        containerRef={containerRef}
        onSelectionChange={props.onSelectionChange ?? (() => undefined)}
        onSelectionCommit={props.onSelectionCommit ?? (() => undefined)}
        getIdAtPoint={props.getIdAtPoint}
        ctrlOverride={props.ctrlOverride}
      />
    </div>
  );
}

function mount(props: HarnessProps = {}) {
  let exposedGrid: HTMLElement | null = null;
  const { container, unmount } = renderWithClient(
    <Harness
      {...props}
      expose={(el) => {
        exposedGrid = el;
        props.expose?.(el);
      }}
    />,
  );
  return {
    container,
    grid: () => exposedGrid!,
    unmount,
  };
}

function fireMouse(
  target: EventTarget,
  type: "mousedown" | "mousemove" | "mouseup",
  init: {
    clientX: number;
    clientY: number;
    ctrlKey?: boolean;
    metaKey?: boolean;
    button?: number;
  },
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: init.clientX,
    clientY: init.clientY,
    ctrlKey: init.ctrlKey ?? false,
    metaKey: init.metaKey ?? false,
    button: init.button ?? 0,
  });
  target.dispatchEvent(event);
  return event;
}

function fireKey(target: EventTarget, key: string): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true });
  target.dispatchEvent(event);
  return event;
}

function rectEl(container: HTMLElement): HTMLElement | null {
  return container.querySelector('[data-testid="rubber-band-rect"]');
}

describe("RubberBandOverlay", () => {
  test("starts a rubber band on empty-space mousedown", () => {
    const r = mount({ getIdAtPoint: () => null });
    act(() => {
      fireMouse(r.grid(), "mousedown", { clientX: 0, clientY: 0 });
    });
    act(() => {
      fireMouse(window, "mousemove", { clientX: 60, clientY: 60 });
    });
    expect(rectEl(r.container)).not.toBeNull();
    r.unmount();
  });

  test("does NOT start a rubber band when mousedown lands on an image (via getIdAtPoint)", () => {
    const r = mount({
      // Anything in tile 1's bbox returns its id.
      getIdAtPoint: (x, y) =>
        x >= 10 && x < 90 && y >= 10 && y < 90 ? 1 : null,
    });
    act(() => {
      fireMouse(r.grid(), "mousedown", { clientX: 20, clientY: 20 });
    });
    act(() => {
      fireMouse(window, "mousemove", { clientX: 60, clientY: 60 });
    });
    expect(rectEl(r.container)).toBeNull();
    r.unmount();
  });

  test("rect grows as the pointer moves", () => {
    const r = mount({ getIdAtPoint: () => null });
    act(() => {
      fireMouse(r.grid(), "mousedown", { clientX: 0, clientY: 0 });
    });
    act(() => {
      fireMouse(window, "mousemove", { clientX: 40, clientY: 40 });
    });
    const first = rectEl(r.container)!;
    expect(first.style.width).toBe("40px");
    expect(first.style.height).toBe("40px");

    act(() => {
      fireMouse(window, "mousemove", { clientX: 100, clientY: 80 });
    });
    const second = rectEl(r.container)!;
    expect(second.style.width).toBe("100px");
    expect(second.style.height).toBe("80px");
    r.unmount();
  });

  test("calls onSelectionChange with pending ids that overlap the rect", () => {
    const changes: Set<number>[] = [];
    const r = mount({
      getIdAtPoint: () => null,
      onSelectionChange: (ids) => changes.push(new Set(ids)),
    });
    act(() => {
      fireMouse(r.grid(), "mousedown", { clientX: 0, clientY: 0 });
    });
    act(() => {
      fireMouse(window, "mousemove", { clientX: 100, clientY: 100 });
    });
    // Rect (0,0)→(100,100) hits tile 1 (fully inside) and tile 3 (partial).
    const last = changes[changes.length - 1];
    expect(last.has(1)).toBe(true);
    expect(last.has(3)).toBe(true);
    expect(last.has(2)).toBe(false);
    r.unmount();
  });

  test("commits the final pending set on mouseup (non-additive)", () => {
    const commits: Array<[Set<number>, boolean]> = [];
    const r = mount({
      getIdAtPoint: () => null,
      onSelectionCommit: (ids, additive) =>
        commits.push([new Set(ids), additive]),
    });
    act(() => {
      fireMouse(r.grid(), "mousedown", { clientX: 0, clientY: 0 });
    });
    act(() => {
      fireMouse(window, "mousemove", { clientX: 100, clientY: 100 });
    });
    act(() => {
      fireMouse(window, "mouseup", { clientX: 100, clientY: 100 });
    });

    expect(commits).toHaveLength(1);
    expect(commits[0][0].has(1)).toBe(true);
    expect(commits[0][0].has(3)).toBe(true);
    expect(commits[0][1]).toBe(false); // non-additive
    expect(rectEl(r.container)).toBeNull(); // rect cleared after commit
    r.unmount();
  });

  test("ctrl+drag commits with additive=true", () => {
    const commits: Array<[Set<number>, boolean]> = [];
    const r = mount({
      getIdAtPoint: () => null,
      onSelectionCommit: (ids, additive) =>
        commits.push([new Set(ids), additive]),
    });
    act(() => {
      fireMouse(r.grid(), "mousedown", {
        clientX: 0,
        clientY: 0,
        ctrlKey: true,
      });
    });
    act(() => {
      fireMouse(window, "mousemove", { clientX: 100, clientY: 100 });
    });
    act(() => {
      fireMouse(window, "mouseup", { clientX: 100, clientY: 100 });
    });

    expect(commits[0][1]).toBe(true);
    r.unmount();
  });

  test("ctrlOverride prop forces additive commits even without ctrlKey", () => {
    const commits: Array<[Set<number>, boolean]> = [];
    const r = mount({
      getIdAtPoint: () => null,
      ctrlOverride: true,
      onSelectionCommit: (ids, additive) =>
        commits.push([new Set(ids), additive]),
    });
    act(() => {
      fireMouse(r.grid(), "mousedown", { clientX: 0, clientY: 0 });
    });
    act(() => {
      fireMouse(window, "mousemove", { clientX: 100, clientY: 100 });
    });
    act(() => {
      fireMouse(window, "mouseup", { clientX: 100, clientY: 100 });
    });

    expect(commits[0][1]).toBe(true);
    r.unmount();
  });

  test("Esc cancels the drag and does NOT commit", () => {
    const commits: Array<[Set<number>, boolean]> = [];
    const r = mount({
      getIdAtPoint: () => null,
      onSelectionCommit: (ids, additive) =>
        commits.push([new Set(ids), additive]),
    });
    act(() => {
      fireMouse(r.grid(), "mousedown", { clientX: 0, clientY: 0 });
    });
    act(() => {
      fireMouse(window, "mousemove", { clientX: 100, clientY: 100 });
    });
    act(() => {
      fireKey(window, "Escape");
    });
    expect(commits).toHaveLength(0);
    expect(rectEl(r.container)).toBeNull();

    // Subsequent mouseup should also not commit (drag no longer active).
    act(() => {
      fireMouse(window, "mouseup", { clientX: 100, clientY: 100 });
    });
    expect(commits).toHaveLength(0);
    r.unmount();
  });

  test("renders a polite live region for screen readers", () => {
    const r = mount({ getIdAtPoint: () => null });
    const live = r.container.querySelector(
      '[data-testid="rubber-band-live-region"]',
    );
    expect(live).not.toBeNull();
    expect(live!.getAttribute("aria-live")).toBe("polite");
    expect(live!.getAttribute("role")).toBe("status");
    r.unmount();
  });

  test("right-click (button=2) does not start a drag", () => {
    const r = mount({ getIdAtPoint: () => null });
    act(() => {
      fireMouse(r.grid(), "mousedown", {
        clientX: 0,
        clientY: 0,
        button: 2,
      });
    });
    act(() => {
      fireMouse(window, "mousemove", { clientX: 50, clientY: 50 });
    });
    expect(rectEl(r.container)).toBeNull();
    r.unmount();
  });

  test("fallback hit-test (no getIdAtPoint): clicking on a [data-image-id] tile bails", () => {
    // Without `getIdAtPoint`, the overlay falls back to the DOM-walk path:
    // `event.target !== container && targetEl.closest('[data-image-id]')`.
    const r = mount();
    const tile = r.grid().querySelector(
      "[data-image-id='1']",
    ) as HTMLElement;
    act(() => {
      // Dispatch on the tile so event.target is the tile, not the container.
      const evt = new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        clientX: 20,
        clientY: 20,
        button: 0,
      });
      tile.dispatchEvent(evt);
    });
    act(() => {
      fireMouse(window, "mousemove", { clientX: 60, clientY: 60 });
    });
    // The fallback bail kept the rect from rendering.
    expect(rectEl(r.container)).toBeNull();
    r.unmount();
  });

  test("fallback hit-test: clicking on the container itself starts a drag", () => {
    // event.target === container short-circuits the fallback bail; the
    // overlay starts a drag because the click landed on bare container.
    const r = mount();
    act(() => {
      fireMouse(r.grid(), "mousedown", { clientX: 0, clientY: 0 });
    });
    act(() => {
      fireMouse(window, "mousemove", { clientX: 60, clientY: 60 });
    });
    expect(rectEl(r.container)).not.toBeNull();
    r.unmount();
  });

  test("debounced live region announces the pending count after the delay", async () => {
    jest.useFakeTimers();
    try {
      const r = mount({ getIdAtPoint: () => null });
      act(() => {
        fireMouse(r.grid(), "mousedown", { clientX: 0, clientY: 0 });
      });
      act(() => {
        fireMouse(window, "mousemove", { clientX: 100, clientY: 100 });
      });
      // Advance fake timers past the debounce window.
      act(() => {
        jest.advanceTimersByTime(200);
      });
      const live = r.container.querySelector(
        '[data-testid="rubber-band-live-region"]',
      );
      expect((live?.textContent ?? "").length).toBeGreaterThan(0);
      // Ends with " pending" suffix per the announcer template.
      expect(live?.textContent ?? "").toMatch(/pending$/);
      r.unmount();
    } finally {
      jest.useRealTimers();
    }
  });

  test("live region announces '1 image pending' (singular form) for one match", async () => {
    jest.useFakeTimers();
    try {
      const r = mount({ getIdAtPoint: () => null });
      act(() => {
        fireMouse(r.grid(), "mousedown", { clientX: 0, clientY: 0 });
      });
      // Drag covers only tile 1 → 1 pending id.
      act(() => {
        fireMouse(window, "mousemove", { clientX: 90, clientY: 90 });
      });
      act(() => {
        jest.advanceTimersByTime(200);
      });
      const live = r.container.querySelector(
        '[data-testid="rubber-band-live-region"]',
      );
      expect(live?.textContent).toBe("1 image pending");
      r.unmount();
    } finally {
      jest.useRealTimers();
    }
  });
});
