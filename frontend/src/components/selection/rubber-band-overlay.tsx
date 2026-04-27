/**
 * Rubber band (lasso) selection overlay.
 *
 * Spec: ui-design.md §5.2 Rubber Band Details, §7 Accessibility
 *       (rubber band announces count via live region).
 * Wireframe: 09-select-mode-desktop.svg — dashed indigo rectangle with 8%
 *            fill on dark surface.
 *
 * Event flow:
 *   1. `mousedown` on `containerRef.current` checks whether the target is
 *      the container itself (or a declared hit-area, like the grid
 *      background). Empty space → start rubber band. On-image clicks go
 *      through the image's own handler and never reach here.
 *   2. `mousemove` updates the rectangle and the set of pending ids (images
 *      whose bounding box overlaps the rect — partial overlap counts, per
 *      wireframe 09).
 *   3. `mouseup` commits the pending ids. If Ctrl/Meta was held at drag
 *      start or during move, pending ids are ADDED to the existing
 *      selection. Otherwise they REPLACE it.
 *   4. `Esc` cancels the drag without committing.
 *
 * Live region: we render a `role="status" aria-live="polite"` span that
 * announces "N images pending" whenever the pending count changes. Updates
 * are debounced to ~150 ms so screen readers aren't spammed with every
 * pointer-move frame.
 *
 * The overlay is a purely presentational layer managed by `useRubberBand`.
 * All hit-testing and coordinate math lives in the hook.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { useRubberBand } from "../../hooks/use-rubber-band";

export interface RubberBandOverlayProps {
  containerRef: React.RefObject<HTMLElement>;
  /**
   * Fired on every pointer-move while dragging with the current pending
   * selection. Consumers can render dashed-border "pending" styling on
   * their tiles without waiting for commit.
   */
  onSelectionChange: (pendingIds: Set<number>) => void;
  /**
   * Fired once on mouseup with the final pending set. The consumer decides
   * whether to replace the existing selection or add to it based on
   * `isAdditive` — which is true when Ctrl/Meta was held at release time
   * or via `ctrlOverride`.
   */
  onSelectionCommit: (finalIds: Set<number>, isAdditive: boolean) => void;
  /**
   * Hit-testing callback. If a mousedown lands on a draggable image, the
   * caller returns its id so the overlay can bail out and let the tile
   * handle its own click. Returns `null` for empty space.
   *
   * The overlay falls back to a DOM check (`event.target === container`)
   * when this prop is not supplied, so a minimal consumer needn't wire
   * ref bookkeeping.
   */
  getIdAtPoint?: (x: number, y: number) => number | null;
  /**
   * Force additive mode regardless of modifier keys. Wired by pages that
   * expose a "shift+drag to add" affordance distinct from Ctrl+drag.
   */
  ctrlOverride?: boolean;
}

const LIVE_REGION_DEBOUNCE_MS = 150;

/** Dashed indigo border + 8 % primary fill, per ui-design §5.2 / §5.3. */
const rectStyle: React.CSSProperties = {
  position: "absolute",
  // `primary` token value in dark mode. We inline the hex so the overlay
  // can ship without a Chakra provider.
  backgroundColor: "rgba(129, 140, 248, 0.08)",
  border: "1.5px dashed #818cf8",
  borderRadius: 3,
  pointerEvents: "none",
  boxSizing: "border-box",
};

const overlayWrapperStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
};

const liveRegionStyle: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};

export function RubberBandOverlay({
  containerRef,
  onSelectionChange,
  onSelectionCommit,
  getIdAtPoint,
  ctrlOverride,
}: RubberBandOverlayProps): ReactElement {
  // imageRefs is required by useRubberBand but managed externally in
  // production. In practice the consuming page passes getIdAtPoint and the
  // hook's imageRefs stays empty — hit-testing happens via getIdAtPoint
  // on mousedown, and the overlay uses the image grid's own DOM query.
  // For overlay-driven pending computation we keep a simple ref map that
  // mirrors the live DOM via data-image-id attributes.
  const imageRefs = useRef<Map<number, HTMLElement>>(new Map());

  const {
    isDragging,
    rect,
    pendingIds,
    startDrag,
    moveDrag,
    endDrag,
    cancel,
  } = useRubberBand({ containerRef, imageRefs });

  // Track whether Ctrl/Meta was held at drag start so the commit behaviour
  // is stable even if the user releases the modifier before mouseup.
  const additiveRef = useRef(false);

  const [announcement, setAnnouncement] = useState("");
  const announceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Populate imageRefs by scanning the container for [data-image-id]
  // elements. Consumers opt in by rendering tiles with that attribute.
  const refreshImageRefs = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const next = new Map<number, HTMLElement>();
    const nodes = container.querySelectorAll<HTMLElement>("[data-file-id]");
    nodes.forEach((node) => {
      const raw = node.getAttribute("data-file-id");
      if (!raw) return;
      const id = Number(raw);
      if (Number.isFinite(id)) next.set(id, node);
    });
    imageRefs.current = next;
  }, [containerRef]);

  const handleMouseDown = useCallback(
    (event: MouseEvent) => {
      if (event.button !== 0) return; // left-click only
      const container = containerRef.current;
      if (!container) return;

      // Bail if the mousedown landed on an image tile — the image's own
      // click handler owns the event.
      if (getIdAtPoint) {
        const id = getIdAtPoint(event.clientX, event.clientY);
        if (id != null) return;
      } else {
        // Fallback: treat anything except the container itself as a tile.
        if (event.target !== container) {
          const targetEl = event.target as HTMLElement | null;
          if (targetEl && targetEl.closest("[data-file-id]")) return;
        }
      }

      additiveRef.current =
        Boolean(ctrlOverride) || event.ctrlKey || event.metaKey;
      refreshImageRefs();
      startDrag({ clientX: event.clientX, clientY: event.clientY });
      // Prevent default so the browser doesn't start a text selection drag.
      event.preventDefault();
    },
    [containerRef, ctrlOverride, getIdAtPoint, refreshImageRefs, startDrag],
  );

  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      if (!isDragging) return;
      moveDrag({ clientX: event.clientX, clientY: event.clientY });
    },
    [isDragging, moveDrag],
  );

  const handleMouseUp = useCallback(
    (event: MouseEvent) => {
      if (!isDragging) return;
      const isAdditive =
        additiveRef.current || event.ctrlKey || event.metaKey;
      const finalIds = new Set(pendingIds);
      onSelectionCommit(finalIds, isAdditive);
      endDrag();
      additiveRef.current = false;
    },
    [endDrag, isDragging, onSelectionCommit, pendingIds],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape" && isDragging) {
        cancel();
        additiveRef.current = false;
      }
    },
    [cancel, isDragging],
  );

  // Wire mousedown to the container (scoped listener) and move/up/keydown
  // to the window (so the drag continues even if the pointer leaves the
  // grid).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener("mousedown", handleMouseDown);
    return () => {
      container.removeEventListener("mousedown", handleMouseDown);
    };
  }, [containerRef, handleMouseDown]);

  useEffect(() => {
    if (!isDragging) return;
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown, handleMouseMove, handleMouseUp, isDragging]);

  // Forward pending changes to the consumer on every move.
  useEffect(() => {
    if (isDragging) {
      onSelectionChange(pendingIds);
    }
  }, [isDragging, onSelectionChange, pendingIds]);

  // Debounced aria-live announcement. Cancel the previous timer every time
  // the count changes so fast drags only announce after a short pause.
  useEffect(() => {
    if (!isDragging) {
      if (announceTimerRef.current) {
        clearTimeout(announceTimerRef.current);
        announceTimerRef.current = null;
      }
      return;
    }
    if (announceTimerRef.current) clearTimeout(announceTimerRef.current);
    const count = pendingIds.size;
    announceTimerRef.current = setTimeout(() => {
      setAnnouncement(
        count === 1 ? "1 image pending" : `${count} images pending`,
      );
    }, LIVE_REGION_DEBOUNCE_MS);
    return () => {
      if (announceTimerRef.current) clearTimeout(announceTimerRef.current);
    };
  }, [isDragging, pendingIds]);

  return (
    <div aria-hidden={!isDragging} style={overlayWrapperStyle}>
      {rect && rect.w > 0 && rect.h > 0 ? (
        <div
          data-testid="rubber-band-rect"
          role="presentation"
          style={{
            ...rectStyle,
            left: rect.x,
            top: rect.y,
            width: rect.w,
            height: rect.h,
          }}
        />
      ) : null}
      <span
        data-testid="rubber-band-live-region"
        role="status"
        aria-live="polite"
        style={liveRegionStyle}
      >
        {announcement}
      </span>
    </div>
  );
}

export default RubberBandOverlay;
