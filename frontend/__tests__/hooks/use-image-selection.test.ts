/**
 * Tests for `use-image-selection`.
 *
 * Spec: ui-design.md §5.1 Selection Methods.
 *
 * We drive the hook through the shared `renderHookWithClient` harness.
 * Because the hook only talks to Zustand + `@mantine/hooks`, no query
 * client / router provider is strictly required, but the shared harness
 * gives us Chakra's system + act wiring for free.
 */
import { act } from "react-dom/test-utils";

import {
  useImageSelection,
  type UseImageSelectionReturn,
  type ImageClickEvent,
} from "../../src/hooks/use-image-selection";
import { useSelectionStore } from "../../src/stores/selection-store";
import { renderHookWithClient } from "../test-utils";

function resetStore() {
  act(() => {
    useSelectionStore.setState({
      selectMode: false,
      selectedIds: new Set<number>(),
      lastSelectedId: null,
    });
  });
}

function click(overrides: Partial<ImageClickEvent> = {}): ImageClickEvent {
  return { shiftKey: false, ctrlKey: false, metaKey: false, ...overrides };
}

describe("useImageSelection", () => {
  const allIds = [1, 2, 3, 4, 5];

  beforeEach(() => {
    resetStore();
  });

  test("handleClick is a no-op when not in select mode", () => {
    const view = renderHookWithClient<UseImageSelectionReturn>(() =>
      useImageSelection(allIds),
    );
    act(() => view.result.current.handleClick(click(), 3));
    expect(useSelectionStore.getState().selectedIds.size).toBe(0);
    view.unmount();
  });

  test("plain click in select mode toggles a single id (add)", () => {
    act(() => useSelectionStore.getState().toggleSelectMode());
    const view = renderHookWithClient<UseImageSelectionReturn>(() =>
      useImageSelection(allIds),
    );
    act(() => view.result.current.handleClick(click(), 3));
    expect(useSelectionStore.getState().selectedIds).toEqual(new Set([3]));
    view.unmount();
  });

  test("plain click on an already-selected id toggles it off without clearing others", () => {
    act(() => {
      useSelectionStore.getState().toggleSelectMode();
      useSelectionStore.getState().setSelected([1, 2, 3]);
    });
    const view = renderHookWithClient<UseImageSelectionReturn>(() =>
      useImageSelection(allIds),
    );
    act(() => view.result.current.handleClick(click(), 2));
    // Only `2` is removed; `1` and `3` remain.
    expect(useSelectionStore.getState().selectedIds).toEqual(new Set([1, 3]));
    view.unmount();
  });

  test("ctrl+click toggles without clearing existing selection", () => {
    act(() => {
      useSelectionStore.getState().toggleSelectMode();
      useSelectionStore.getState().setSelected([1, 2]);
    });
    const view = renderHookWithClient<UseImageSelectionReturn>(() =>
      useImageSelection(allIds),
    );
    act(() => view.result.current.handleClick(click({ ctrlKey: true }), 4));
    expect(useSelectionStore.getState().selectedIds).toEqual(
      new Set([1, 2, 4]),
    );

    // Ctrl+clicking the same id removes it.
    act(() => view.result.current.handleClick(click({ ctrlKey: true }), 2));
    expect(useSelectionStore.getState().selectedIds).toEqual(new Set([1, 4]));
    view.unmount();
  });

  test("metaKey (Cmd on macOS) behaves like ctrlKey", () => {
    act(() => useSelectionStore.getState().toggleSelectMode());
    const view = renderHookWithClient<UseImageSelectionReturn>(() =>
      useImageSelection(allIds),
    );
    act(() => view.result.current.handleClick(click({ metaKey: true }), 3));
    expect(useSelectionStore.getState().selectedIds).toEqual(new Set([3]));
    view.unmount();
  });

  test("shift+click selects the inclusive range from lastSelectedId to target", () => {
    act(() => {
      useSelectionStore.getState().toggleSelectMode();
      // Anchor at id 2.
      useSelectionStore.getState().toggleOne(2);
    });
    const view = renderHookWithClient<UseImageSelectionReturn>(() =>
      useImageSelection(allIds),
    );
    act(() => view.result.current.handleClick(click({ shiftKey: true }), 5));
    expect(useSelectionStore.getState().selectedIds).toEqual(
      new Set([2, 3, 4, 5]),
    );
    view.unmount();
  });

  test("handleRangeClick always performs a range regardless of modifiers", () => {
    act(() => {
      useSelectionStore.getState().toggleSelectMode();
      useSelectionStore.getState().toggleOne(1);
    });
    const view = renderHookWithClient<UseImageSelectionReturn>(() =>
      useImageSelection(allIds),
    );
    // No modifiers set — handleRangeClick ignores them.
    act(() => view.result.current.handleRangeClick(click(), 3));
    expect(useSelectionStore.getState().selectedIds).toEqual(
      new Set([1, 2, 3]),
    );
    view.unmount();
  });

  test("isSelected reflects the current Set", () => {
    act(() => {
      useSelectionStore.getState().toggleSelectMode();
      useSelectionStore.getState().setSelected([2, 4]);
    });
    const view = renderHookWithClient<UseImageSelectionReturn>(() =>
      useImageSelection(allIds),
    );
    expect(view.result.current.isSelected(2)).toBe(true);
    expect(view.result.current.isSelected(3)).toBe(false);
    expect(view.result.current.isSelected(4)).toBe(true);
    view.unmount();
  });

  test("Ctrl+A selects all visible ids while in select mode", () => {
    act(() => useSelectionStore.getState().toggleSelectMode());
    const view = renderHookWithClient<UseImageSelectionReturn>(() =>
      useImageSelection(allIds),
    );

    // Simulate a Ctrl+A key event at the document level. @mantine/hooks
    // attaches a keydown listener to document during mount.
    act(() => {
      const event = new KeyboardEvent("keydown", {
        key: "a",
        code: "KeyA",
        ctrlKey: true,
        bubbles: true,
      });
      document.documentElement.dispatchEvent(event);
    });

    expect(useSelectionStore.getState().selectedIds).toEqual(new Set(allIds));
    view.unmount();
  });

  test("Ctrl+A does not fire outside select mode", () => {
    // selectMode stays false.
    const view = renderHookWithClient<UseImageSelectionReturn>(() =>
      useImageSelection(allIds),
    );
    act(() => {
      const event = new KeyboardEvent("keydown", {
        key: "a",
        code: "KeyA",
        ctrlKey: true,
        bubbles: true,
      });
      document.documentElement.dispatchEvent(event);
    });
    expect(useSelectionStore.getState().selectedIds.size).toBe(0);
    view.unmount();
  });
});
