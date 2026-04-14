/**
 * Tests for `SelectionActionBar`.
 *
 * Spec: ui-design.md §5.3 "Action bar".
 *
 * Uses the shared `renderWithClient` harness which wraps children in
 * ChakraProvider + QueryClientProvider + MemoryRouter. We assert on
 * behaviour via store side-effects and DOM data-testid lookups, not on
 * computed styles.
 */
import { act } from "react-dom/test-utils";

import { SelectionActionBar } from "../../../src/components/selection/selection-action-bar";
import { useSelectionStore } from "../../../src/stores/selection-store";
import { renderWithClient } from "../../test-utils";

function resetStore() {
  act(() => {
    useSelectionStore.setState({
      selectMode: false,
      selectedIds: new Set<number>(),
      lastSelectedId: null,
    });
  });
}

function byTestId(
  container: HTMLElement,
  id: string,
): HTMLElement | null {
  return container.querySelector(`[data-testid="${id}"]`);
}

describe("SelectionActionBar", () => {
  beforeEach(() => {
    resetStore();
  });

  test("renders nothing when selectMode is false", () => {
    const { container, unmount } = renderWithClient(
      <SelectionActionBar />,
    );
    expect(byTestId(container, "selection-action-bar")).toBeNull();
    unmount();
  });

  test("renders when selectMode is true", () => {
    act(() => useSelectionStore.getState().toggleSelectMode());
    const { container, unmount } = renderWithClient(
      <SelectionActionBar />,
    );
    expect(byTestId(container, "selection-action-bar")).not.toBeNull();
    unmount();
  });

  test("count updates reflect selection size", () => {
    act(() => {
      useSelectionStore.getState().toggleSelectMode();
      useSelectionStore.getState().setSelected([1, 2, 3]);
    });
    const { container, unmount } = renderWithClient(
      <SelectionActionBar />,
    );
    expect(byTestId(container, "selection-count")?.textContent).toContain(
      "3 selected",
    );

    act(() => useSelectionStore.getState().toggleOne(4));
    expect(byTestId(container, "selection-count")?.textContent).toContain(
      "4 selected",
    );
    unmount();
  });

  test("renders a totalVisible count next to the selection count", () => {
    act(() => {
      useSelectionStore.getState().toggleSelectMode();
      useSelectionStore.getState().setSelected([1, 2]);
    });
    const { container, unmount } = renderWithClient(
      <SelectionActionBar totalVisible={10} />,
    );
    expect(byTestId(container, "selection-count")?.textContent).toContain(
      "2 selected / 10",
    );
    unmount();
  });

  test("Select All action sets selection to the passed visibleIds", () => {
    act(() => useSelectionStore.getState().toggleSelectMode());
    const visibleIds = [10, 11, 12, 13];
    const { container, unmount } = renderWithClient(
      <SelectionActionBar visibleIds={visibleIds} />,
    );
    const selectAll = byTestId(container, "selection-select-all");
    expect(selectAll).not.toBeNull();
    act(() => {
      selectAll!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(useSelectionStore.getState().selectedIds).toEqual(
      new Set(visibleIds),
    );
    unmount();
  });

  test("Select All button is hidden when visibleIds is not supplied", () => {
    act(() => useSelectionStore.getState().toggleSelectMode());
    const { container, unmount } = renderWithClient(
      <SelectionActionBar />,
    );
    expect(byTestId(container, "selection-select-all")).toBeNull();
    unmount();
  });

  test("Clear action empties the selection", () => {
    act(() => {
      useSelectionStore.getState().toggleSelectMode();
      useSelectionStore.getState().setSelected([1, 2]);
    });
    const { container, unmount } = renderWithClient(
      <SelectionActionBar />,
    );
    const clear = byTestId(container, "selection-clear");
    act(() => {
      clear!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(useSelectionStore.getState().selectedIds.size).toBe(0);
    // Remains in select mode — clearing is not "done".
    expect(useSelectionStore.getState().selectMode).toBe(true);
    unmount();
  });

  test("Clear button is disabled when nothing is selected", () => {
    act(() => useSelectionStore.getState().toggleSelectMode());
    const { container, unmount } = renderWithClient(
      <SelectionActionBar />,
    );
    const clear = byTestId(container, "selection-clear") as
      | HTMLButtonElement
      | null;
    expect(clear).not.toBeNull();
    expect(clear!.disabled).toBe(true);
    unmount();
  });

  test("Done action exits select mode (store also clears selection as side-effect)", () => {
    act(() => {
      useSelectionStore.getState().toggleSelectMode();
      useSelectionStore.getState().setSelected([1, 2]);
    });
    const { container, unmount } = renderWithClient(
      <SelectionActionBar />,
    );
    const done = byTestId(container, "selection-done");
    act(() => {
      done!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(useSelectionStore.getState().selectMode).toBe(false);
    expect(useSelectionStore.getState().selectedIds.size).toBe(0);
    unmount();
  });

  test("Edit Tags fires onEditTags callback", () => {
    act(() => {
      useSelectionStore.getState().toggleSelectMode();
      useSelectionStore.getState().setSelected([1]);
    });
    const onEditTags = jest.fn();
    const { container, unmount } = renderWithClient(
      <SelectionActionBar onEditTags={onEditTags} />,
    );
    const editTags = byTestId(container, "selection-edit-tags");
    act(() => {
      editTags!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onEditTags).toHaveBeenCalledTimes(1);
    unmount();
  });

  test("Edit Tags button is disabled when selection is empty", () => {
    act(() => useSelectionStore.getState().toggleSelectMode());
    const onEditTags = jest.fn();
    const { container, unmount } = renderWithClient(
      <SelectionActionBar onEditTags={onEditTags} />,
    );
    const editTags = byTestId(container, "selection-edit-tags") as
      | HTMLButtonElement
      | null;
    expect(editTags).not.toBeNull();
    expect(editTags!.disabled).toBe(true);
    unmount();
  });

  test("Edit Tags button is not rendered when onEditTags is omitted", () => {
    act(() => useSelectionStore.getState().toggleSelectMode());
    const { container, unmount } = renderWithClient(
      <SelectionActionBar />,
    );
    expect(byTestId(container, "selection-edit-tags")).toBeNull();
    unmount();
  });
});
