/**
 * Tests for `useLongPress` hook.
 *
 * Covers:
 *   - Long press fires after threshold
 *   - Short press does not fire
 *   - Moving beyond threshold cancels
 *   - Pointer cancel aborts
 *   - Context menu is prevented during/after long press
 *   - Context menu not prevented when not active
 *   - Unmount cleans up timer
 */

import { act } from "react-dom/test-utils";
import { useLongPress } from "../../src/hooks/use-long-press";
import { renderHookWithClient } from "../test-utils";

function makePointerEvent(overrides: Partial<React.PointerEvent> = {}): React.PointerEvent {
  return {
    clientX: 100,
    clientY: 100,
    preventDefault: jest.fn(),
    stopPropagation: jest.fn(),
    ...overrides,
  } as unknown as React.PointerEvent;
}

function makeSyntheticEvent(): React.SyntheticEvent {
  return {
    preventDefault: jest.fn(),
    stopPropagation: jest.fn(),
  } as unknown as React.SyntheticEvent;
}

describe("useLongPress", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("fires onLongPress after threshold", () => {
    const onLongPress = jest.fn();
    const { result, unmount } = renderHookWithClient(() =>
      useLongPress({ onLongPress, threshold: 500 }),
    );
    try {
      act(() => {
        result.current.onPointerDown(makePointerEvent());
      });
      expect(onLongPress).not.toHaveBeenCalled();
      act(() => {
        jest.advanceTimersByTime(500);
      });
      expect(onLongPress).toHaveBeenCalledTimes(1);
    } finally {
      unmount();
    }
  });

  test("does not fire if pointer is released before threshold", () => {
    const onLongPress = jest.fn();
    const { result, unmount } = renderHookWithClient(() =>
      useLongPress({ onLongPress, threshold: 500 }),
    );
    try {
      act(() => {
        result.current.onPointerDown(makePointerEvent());
      });
      act(() => {
        jest.advanceTimersByTime(300);
      });
      act(() => {
        result.current.onPointerUp(makePointerEvent());
      });
      act(() => {
        jest.advanceTimersByTime(300);
      });
      expect(onLongPress).not.toHaveBeenCalled();
    } finally {
      unmount();
    }
  });

  test("cancels if pointer moves beyond moveThreshold", () => {
    const onLongPress = jest.fn();
    const { result, unmount } = renderHookWithClient(() =>
      useLongPress({ onLongPress, threshold: 500, moveThreshold: 10 }),
    );
    try {
      act(() => {
        result.current.onPointerDown(makePointerEvent({ clientX: 100, clientY: 100 }));
      });
      // Move 20px away - beyond threshold
      act(() => {
        result.current.onPointerMove(
          makePointerEvent({ clientX: 120, clientY: 100 }),
        );
      });
      act(() => {
        jest.advanceTimersByTime(600);
      });
      expect(onLongPress).not.toHaveBeenCalled();
    } finally {
      unmount();
    }
  });

  test("does not cancel if movement is within threshold", () => {
    const onLongPress = jest.fn();
    const { result, unmount } = renderHookWithClient(() =>
      useLongPress({ onLongPress, threshold: 500, moveThreshold: 10 }),
    );
    try {
      act(() => {
        result.current.onPointerDown(makePointerEvent({ clientX: 100, clientY: 100 }));
      });
      // Move only 5px - within threshold
      act(() => {
        result.current.onPointerMove(
          makePointerEvent({ clientX: 103, clientY: 104 }),
        );
      });
      act(() => {
        jest.advanceTimersByTime(500);
      });
      expect(onLongPress).toHaveBeenCalledTimes(1);
    } finally {
      unmount();
    }
  });

  test("pointer cancel aborts the timer", () => {
    const onLongPress = jest.fn();
    const { result, unmount } = renderHookWithClient(() =>
      useLongPress({ onLongPress, threshold: 500 }),
    );
    try {
      act(() => {
        result.current.onPointerDown(makePointerEvent());
      });
      act(() => {
        result.current.onPointerCancel(makePointerEvent());
      });
      act(() => {
        jest.advanceTimersByTime(600);
      });
      expect(onLongPress).not.toHaveBeenCalled();
    } finally {
      unmount();
    }
  });

  test("context menu is prevented during active long press", () => {
    const onLongPress = jest.fn();
    const { result, unmount } = renderHookWithClient(() =>
      useLongPress({ onLongPress, threshold: 500 }),
    );
    try {
      act(() => {
        result.current.onPointerDown(makePointerEvent());
      });
      // During active press
      const event = makeSyntheticEvent();
      act(() => {
        result.current.onContextMenu(event);
      });
      expect(event.preventDefault).toHaveBeenCalled();
    } finally {
      unmount();
    }
  });

  test("context menu is prevented after long press fires", () => {
    const onLongPress = jest.fn();
    const { result, unmount } = renderHookWithClient(() =>
      useLongPress({ onLongPress, threshold: 500 }),
    );
    try {
      act(() => {
        result.current.onPointerDown(makePointerEvent());
      });
      act(() => {
        jest.advanceTimersByTime(500);
      });
      // After fire
      const event = makeSyntheticEvent();
      act(() => {
        result.current.onContextMenu(event);
      });
      expect(event.preventDefault).toHaveBeenCalled();
    } finally {
      unmount();
    }
  });

  test("context menu is NOT prevented when no press is active", () => {
    const onLongPress = jest.fn();
    const { result, unmount } = renderHookWithClient(() =>
      useLongPress({ onLongPress, threshold: 500 }),
    );
    try {
      const event = makeSyntheticEvent();
      act(() => {
        result.current.onContextMenu(event);
      });
      expect(event.preventDefault).not.toHaveBeenCalled();
    } finally {
      unmount();
    }
  });

  test("onPointerMove is no-op when no start position", () => {
    const onLongPress = jest.fn();
    const { result, unmount } = renderHookWithClient(() =>
      useLongPress({ onLongPress, threshold: 500 }),
    );
    try {
      // Move without pressing
      act(() => {
        result.current.onPointerMove(makePointerEvent({ clientX: 200, clientY: 200 }));
      });
      // Should not throw or cause issues
      expect(onLongPress).not.toHaveBeenCalled();
    } finally {
      unmount();
    }
  });

  test("unmount cleans up timer", () => {
    const onLongPress = jest.fn();
    const { result, unmount } = renderHookWithClient(() =>
      useLongPress({ onLongPress, threshold: 500 }),
    );
    act(() => {
      result.current.onPointerDown(makePointerEvent());
    });
    unmount();
    act(() => {
      jest.advanceTimersByTime(600);
    });
    expect(onLongPress).not.toHaveBeenCalled();
  });

  test("uses default threshold when not specified", () => {
    const onLongPress = jest.fn();
    const { result, unmount } = renderHookWithClient(() =>
      useLongPress({ onLongPress }),
    );
    try {
      act(() => {
        result.current.onPointerDown(makePointerEvent());
      });
      act(() => {
        jest.advanceTimersByTime(499);
      });
      expect(onLongPress).not.toHaveBeenCalled();
      act(() => {
        jest.advanceTimersByTime(1);
      });
      expect(onLongPress).toHaveBeenCalledTimes(1);
    } finally {
      unmount();
    }
  });
});
