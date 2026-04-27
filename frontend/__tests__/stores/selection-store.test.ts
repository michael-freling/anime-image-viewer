import { useSelectionStore } from "../../src/stores/selection-store";

/**
 * Reset the store between tests so shared singleton state doesn't leak.
 * The simplest reset is to explicitly zero out every field we set elsewhere.
 */
function resetStore() {
  useSelectionStore.setState({
    selectMode: false,
    selectedIds: new Set<number>(),
    lastSelectedId: null,
  });
}

describe("selection-store", () => {
  beforeEach(() => {
    resetStore();
  });

  test("toggleSelectMode flips the flag", () => {
    expect(useSelectionStore.getState().selectMode).toBe(false);
    useSelectionStore.getState().toggleSelectMode();
    expect(useSelectionStore.getState().selectMode).toBe(true);
  });

  test("exiting select mode clears the selection", () => {
    const s = useSelectionStore.getState();
    s.toggleSelectMode();
    s.setSelected([1, 2, 3]);
    expect(useSelectionStore.getState().selectedIds.size).toBe(3);

    useSelectionStore.getState().toggleSelectMode();
    const final = useSelectionStore.getState();
    expect(final.selectMode).toBe(false);
    expect(final.selectedIds.size).toBe(0);
    expect(final.lastSelectedId).toBeNull();
  });

  test("toggleOne adds then removes ids and returns a new Set each time", () => {
    const before = useSelectionStore.getState().selectedIds;

    useSelectionStore.getState().toggleOne(7);
    const afterAdd = useSelectionStore.getState().selectedIds;
    expect(afterAdd.has(7)).toBe(true);
    expect(afterAdd).not.toBe(before);

    useSelectionStore.getState().toggleOne(7);
    const afterRemove = useSelectionStore.getState().selectedIds;
    expect(afterRemove.has(7)).toBe(false);
    expect(afterRemove).not.toBe(afterAdd);
  });

  test("toggleOne updates the lastSelectedId anchor", () => {
    useSelectionStore.getState().toggleOne(5);
    expect(useSelectionStore.getState().lastSelectedId).toBe(5);
    useSelectionStore.getState().toggleOne(9);
    expect(useSelectionStore.getState().lastSelectedId).toBe(9);
  });

  test("setSelected replaces the selection wholesale", () => {
    useSelectionStore.getState().setSelected([1, 2, 3]);
    expect(useSelectionStore.getState().selectedIds).toEqual(new Set([1, 2, 3]));

    useSelectionStore.getState().setSelected([10]);
    expect(useSelectionStore.getState().selectedIds).toEqual(new Set([10]));
  });

  describe("selectRange (shift-click semantics)", () => {
    const allIds = [10, 11, 12, 13, 14, 15];

    test("fills the inclusive range between anchor and target", () => {
      useSelectionStore.getState().selectRange(11, 14, allIds);
      expect(useSelectionStore.getState().selectedIds).toEqual(
        new Set([11, 12, 13, 14]),
      );
      expect(useSelectionStore.getState().lastSelectedId).toBe(14);
    });

    test("works when the anchor is after the target", () => {
      useSelectionStore.getState().selectRange(14, 11, allIds);
      expect(useSelectionStore.getState().selectedIds).toEqual(
        new Set([11, 12, 13, 14]),
      );
    });

    test("adds to an existing selection instead of replacing it", () => {
      useSelectionStore.getState().setSelected([10]);
      useSelectionStore.getState().selectRange(12, 14, allIds);
      expect(useSelectionStore.getState().selectedIds).toEqual(
        new Set([10, 12, 13, 14]),
      );
    });

    test("degrades to toggleOne(to) when the anchor is missing from allIds", () => {
      useSelectionStore.getState().selectRange(99, 13, allIds);
      expect(useSelectionStore.getState().selectedIds).toEqual(new Set([13]));
      expect(useSelectionStore.getState().lastSelectedId).toBe(13);
    });

    test("is a no-op when allIds is empty", () => {
      useSelectionStore.getState().selectRange(1, 2, []);
      expect(useSelectionStore.getState().selectedIds.size).toBe(0);
    });

    test("is a no-op when the target is not in allIds", () => {
      useSelectionStore.getState().selectRange(10, 99, allIds);
      expect(useSelectionStore.getState().selectedIds.size).toBe(0);
    });
  });

  test("clearSelection empties selectedIds and the anchor", () => {
    useSelectionStore.getState().setSelected([1, 2]);
    useSelectionStore.getState().toggleOne(3);
    expect(useSelectionStore.getState().lastSelectedId).toBe(3);

    useSelectionStore.getState().clearSelection();
    const state = useSelectionStore.getState();
    expect(state.selectedIds.size).toBe(0);
    expect(state.lastSelectedId).toBeNull();
  });
});
