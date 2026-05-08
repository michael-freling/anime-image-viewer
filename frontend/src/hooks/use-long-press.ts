/**
 * Long-press gesture detection hook for mouse and touch.
 *
 * Uses PointerEvents for unified input handling across mouse, touch, and pen.
 * Works in Wails desktop WebView environments.
 *
 * Usage:
 *   const handlers = useLongPress({ onLongPress: () => doSomething() });
 *   return <div {...handlers}>Hold me</div>;
 */
import { useCallback, useEffect, useRef } from "react";

interface UseLongPressOptions {
  /** Duration in milliseconds before the long-press fires. Default 500. */
  threshold?: number;
  /** Callback invoked when the long-press threshold is reached. */
  onLongPress: () => void;
  /** Pixels of pointer movement allowed before cancelling. Default 10. */
  moveThreshold?: number;
}

interface UseLongPressReturn {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
  onContextMenu: (e: React.SyntheticEvent) => void;
  /** True if the most recent gesture was consumed by a long-press. */
  firedRef: React.MutableRefObject<boolean>;
}

const DEFAULT_THRESHOLD = 500;
const DEFAULT_MOVE_THRESHOLD = 10;

export function useLongPress(options: UseLongPressOptions): UseLongPressReturn {
  const { threshold = DEFAULT_THRESHOLD, onLongPress, moveThreshold = DEFAULT_MOVE_THRESHOLD } =
    options;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const firedRef = useRef(false);
  const activeRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    activeRef.current = false;
  }, []);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      firedRef.current = false;
      activeRef.current = true;
      startPosRef.current = { x: e.clientX, y: e.clientY };

      timerRef.current = setTimeout(() => {
        firedRef.current = true;
        activeRef.current = false;
        timerRef.current = null;
        onLongPress();
      }, threshold);
    },
    [onLongPress, threshold]
  );

  const onPointerUp = useCallback(
    () => {
      clearTimer();
    },
    [clearTimer]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!startPosRef.current || !activeRef.current) return;

      const dx = e.clientX - startPosRef.current.x;
      const dy = e.clientY - startPosRef.current.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > moveThreshold) {
        clearTimer();
      }
    },
    [moveThreshold, clearTimer]
  );

  const onPointerCancel = useCallback(
    () => {
      clearTimer();
    },
    [clearTimer]
  );

  const onContextMenu = useCallback(
    (e: React.SyntheticEvent) => {
      if (activeRef.current || firedRef.current) {
        e.preventDefault();
      }
    },
    []
  );

  return {
    onPointerDown,
    onPointerUp,
    onPointerMove,
    onPointerCancel,
    onContextMenu,
    firedRef,
  };
}
