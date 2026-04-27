/**
 * Rubber band drag-select geometry hook.
 *
 * Spec: ui-design.md §5.2 "Rubber Band Details".
 *
 * Encapsulates the low-level pointer math so consumers (the overlay component)
 * can stay presentational. Exposes:
 *   - `isDragging`: whether a drag is currently in progress.
 *   - `rect`: the current rubber band rectangle in container-relative
 *     coordinates, normalised so width/height are always non-negative
 *     (rightward vs leftward drags both produce the same shape).
 *   - `pendingIds`: image ids whose bounding boxes intersect the rect.
 *   - `startDrag / moveDrag / endDrag / cancel`: pointer lifecycle.
 *
 * Hit-testing reads `imageRefs.get(id).getBoundingClientRect()` on every
 * pointer move. Partial overlap counts as a hit — this matches wireframe 09
 * where "Image 6 (lasso)" is only partially inside the selection rectangle
 * yet still marked as pending.
 *
 * Coordinates: all stored rects are **container-relative** (0, 0 is the
 * top-left of `containerRef.current`). `getBoundingClientRect()` is
 * viewport-relative, so we subtract the container's origin when converting.
 */
import { useCallback, useMemo, useRef, useState } from "react";

export interface RubberBandRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface UseRubberBandParams {
  containerRef: React.RefObject<HTMLElement>;
  /**
   * Live registry of every selectable image element. The hook reads each
   * element's bounding rect on every move to decide which ids the rectangle
   * is hovering. Using a ref + a Map lets consumers register/unregister
   * without stale closures.
   */
  imageRefs: React.RefObject<Map<number, HTMLElement>>;
}

export interface UseRubberBandReturn {
  isDragging: boolean;
  rect: RubberBandRect | null;
  pendingIds: Set<number>;
  startDrag: (event: {
    clientX: number;
    clientY: number;
  }) => void;
  moveDrag: (event: {
    clientX: number;
    clientY: number;
  }) => void;
  endDrag: () => void;
  cancel: () => void;
}

/**
 * Normalise an anchor+cursor pair into a rectangle with non-negative
 * dimensions. Handles the "drag up and to the left" case.
 */
function normaliseRect(
  anchor: { x: number; y: number },
  cursor: { x: number; y: number },
): RubberBandRect {
  const x = Math.min(anchor.x, cursor.x);
  const y = Math.min(anchor.y, cursor.y);
  const w = Math.abs(cursor.x - anchor.x);
  const h = Math.abs(cursor.y - anchor.y);
  return { x, y, w, h };
}

/**
 * Standard AABB (axis-aligned bounding box) overlap test. Returns true for
 * any intersection including zero-area touching edges — partial overlap
 * counts per wireframe 09.
 */
function rectsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

export function useRubberBand({
  containerRef,
  imageRefs,
}: UseRubberBandParams): UseRubberBandReturn {
  const [isDragging, setIsDragging] = useState(false);
  const [rect, setRect] = useState<RubberBandRect | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<number>>(() => new Set());

  // The anchor point (in container coords) where the drag started. Stored
  // in a ref rather than state so pointer-move handlers can read it without
  // re-triggering renders.
  const anchorRef = useRef<{ x: number; y: number } | null>(null);

  const toContainerCoords = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const container = containerRef.current;
      if (!container) return null;
      const bounds = container.getBoundingClientRect();
      return { x: clientX - bounds.left, y: clientY - bounds.top };
    },
    [containerRef],
  );

  const computePending = useCallback(
    (bandRect: RubberBandRect): Set<number> => {
      const container = containerRef.current;
      const refs = imageRefs.current;
      if (!container || !refs) return new Set();
      const containerBounds = container.getBoundingClientRect();
      const hits = new Set<number>();
      for (const [id, element] of refs) {
        if (!element) continue;
        const elRect = element.getBoundingClientRect();
        // Convert to container coords so we can test against bandRect.
        const local = {
          x: elRect.left - containerBounds.left,
          y: elRect.top - containerBounds.top,
          w: elRect.width,
          h: elRect.height,
        };
        if (rectsOverlap(bandRect, local)) {
          hits.add(id);
        }
      }
      return hits;
    },
    [containerRef, imageRefs],
  );

  const startDrag = useCallback(
    (event: { clientX: number; clientY: number }) => {
      const point = toContainerCoords(event.clientX, event.clientY);
      if (!point) return;
      anchorRef.current = point;
      setIsDragging(true);
      setRect({ x: point.x, y: point.y, w: 0, h: 0 });
      setPendingIds(new Set());
    },
    [toContainerCoords],
  );

  const moveDrag = useCallback(
    (event: { clientX: number; clientY: number }) => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const cursor = toContainerCoords(event.clientX, event.clientY);
      if (!cursor) return;
      const next = normaliseRect(anchor, cursor);
      setRect(next);
      setPendingIds(computePending(next));
    },
    [computePending, toContainerCoords],
  );

  const endDrag = useCallback(() => {
    anchorRef.current = null;
    setIsDragging(false);
    setRect(null);
    // pendingIds is intentionally retained so the caller can read the final
    // set inside its mouseup handler before we clear. The caller is
    // responsible for committing and then calling `cancel` if desired.
  }, []);

  const cancel = useCallback(() => {
    anchorRef.current = null;
    setIsDragging(false);
    setRect(null);
    setPendingIds(new Set());
  }, []);

  return useMemo(
    () => ({
      isDragging,
      rect,
      pendingIds,
      startDrag,
      moveDrag,
      endDrag,
      cancel,
    }),
    [isDragging, rect, pendingIds, startDrag, moveDrag, endDrag, cancel],
  );
}

// Exported for tests — keeping the helpers addressable without making them
// part of the public hook API.
export const __test = {
  normaliseRect,
  rectsOverlap,
};
