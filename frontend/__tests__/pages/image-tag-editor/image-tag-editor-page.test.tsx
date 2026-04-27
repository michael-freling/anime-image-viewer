/**
 * Integration tests for `ImageTagEditorPage` (route `/images/edit/tags`).
 *
 * Spec coverage (ui-design.md §3.6, §4.4, §5 and the Phase D5 brief):
 *   1. Loading state — tags + stats queries pending → skeletons render.
 *   2. Empty selection — no `?ids=` and no selection store → EmptyState.
 *   3. Tri-state derivation — mix of fully/partially/not-applied tags renders
 *      `checked` / `indeterminate` / `unchecked` checkboxes respectively.
 *   4. Pending add — click an unchecked tag → row `pending=adding`,
 *      pending bar shows "+1 to add".
 *   5. Pending remove — click a checked tag → row `pending=removing`,
 *      pending bar shows "-1 to remove".
 *   6. Cancel with changes — ConfirmDialog appears; confirming discards.
 *   7. Save success — dispatch fires with add/remove arrays, success toast,
 *      queries are invalidated.
 *   8. Search filter — typing hides non-matching categories/tags.
 *
 * We mock the Wails binding module (`src/lib/api`) so `TagService.GetAll`,
 * `TagService.ReadTagsByFileIDs`, and the mutation dispatch probe resolve
 * to deterministic fixtures under our control.
 */

// ---- mocks (must run before module imports) ------------------------------

const getAllTagsMock = jest.fn();
const readTagsByFileIDsMock = jest.fn();
const batchUpdateTagsMock = jest.fn();

jest.mock("../../../src/lib/api", () => ({
  __esModule: true,
  TagService: {
    GetAll: (...args: unknown[]) => getAllTagsMock(...args),
    ReadTagsByFileIDs: (...args: unknown[]) =>
      readTagsByFileIDsMock(...args),
  },
  TagFrontendService: {
    BatchUpdateTagsForFiles: (...args: unknown[]) =>
      batchUpdateTagsMock(...args),
  },
}));

// ---- imports under test --------------------------------------------------

import { act } from "react-dom/test-utils";

import { ImageTagEditorPage } from "../../../src/pages/image-tag-editor";
import { useSelectionStore } from "../../../src/stores/selection-store";
import type { Tag, TagStat } from "../../../src/types";
import { renderWithClient, waitFor, flushPromises } from "../../test-utils";

// ---- helpers / fixtures --------------------------------------------------

function makeTag(id: number, name: string, category: string): Tag {
  return { id, name, category };
}

const TAGS: Tag[] = [
  makeTag(1, "Outdoor", "scene"),
  makeTag(2, "Indoor", "scene"),
  makeTag(3, "Sunny", "nature"),
  makeTag(4, "Bedroom", "location"),
  makeTag(5, "Happy", "mood"),
];

/**
 * Helper: build the `TagService.ReadTagsByFileIDs` response shape.
 *
 *   - tagId 1 (Outdoor) applied to all 3 images → checked
 *   - tagId 3 (Sunny) applied to 2/3 images → indeterminate
 *   - tagId 2 (Indoor) applied to 0 images (not in the map) → unchecked
 */
function buildStatsResponse(totalSelected: number) {
  const entry = (fileCount: number): TagStat => ({
    fileCount,
    isAddedBySelectedFiles: fileCount > 0,
  });
  return {
    tagStats: {
      1: entry(totalSelected), // checked
      3: entry(Math.max(1, totalSelected - 1)), // indeterminate
      // 2 omitted → unchecked
    } as Record<number, TagStat>,
  };
}

function resetSelectionStore() {
  act(() => {
    useSelectionStore.setState({
      selectMode: false,
      selectedIds: new Set<number>(),
      lastSelectedId: null,
    });
  });
}

// Set a native input value so React's change tracker fires on input events.
function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

// ---- tests --------------------------------------------------------------

describe("ImageTagEditorPage", () => {
  beforeEach(() => {
    getAllTagsMock.mockReset();
    readTagsByFileIDsMock.mockReset();
    batchUpdateTagsMock.mockReset();
    getAllTagsMock.mockResolvedValue(TAGS);
    readTagsByFileIDsMock.mockResolvedValue(buildStatsResponse(3));
    batchUpdateTagsMock.mockResolvedValue(undefined);
    resetSelectionStore();
  });

  test("1. loading state: pending queries render the skeleton grid", async () => {
    // Keep the promises unresolved so the queries stay in pending state.
    let resolveTags: (tags: Tag[]) => void = () => undefined;
    let resolveStats: (resp: ReturnType<typeof buildStatsResponse>) => void =
      () => undefined;
    getAllTagsMock.mockImplementation(
      () => new Promise<Tag[]>((resolve) => { resolveTags = resolve; }),
    );
    readTagsByFileIDsMock.mockImplementation(
      () =>
        new Promise<ReturnType<typeof buildStatsResponse>>((resolve) => {
          resolveStats = resolve;
        }),
    );

    const { container, unmount } = renderWithClient(<ImageTagEditorPage />, {
      routerInitialEntries: ["/images/edit/tags?ids=10,11,12"],
    });
    try {
      // Selection strip is rendered once ids are parsed from URL.
      await waitFor(
        () =>
          container.querySelector("[data-testid='image-tag-editor-strip']") !==
          null,
      );
      // The skeleton grid is visible while the queries are still pending.
      const loading = container.querySelector(
        "[data-testid='image-tag-editor-loading']",
      );
      expect(loading).not.toBeNull();
      expect(
        container.querySelector("[data-testid='image-tag-editor-grid']"),
      ).toBeNull();
    } finally {
      // Resolve the pending promises so React Query can settle before the
      // component unmounts (avoids "Warning: act" noise).
      resolveTags(TAGS);
      resolveStats(buildStatsResponse(3));
      await flushPromises();
      unmount();
    }
  });

  test("2. empty selection: no ids in URL or store → EmptyState is shown", async () => {
    const { container, unmount } = renderWithClient(<ImageTagEditorPage />, {
      routerInitialEntries: ["/images/edit/tags"],
    });
    try {
      // The empty-state "Go back" button is the canonical empty marker.
      await waitFor(
        () =>
          container.querySelector(
            "[data-testid='image-tag-editor-empty-back']",
          ) !== null,
      );
      expect(container.textContent).toContain("Nothing to edit");
      // With no selection the stats query is disabled (`enabled: fileIds.length > 0`).
      expect(readTagsByFileIDsMock).not.toHaveBeenCalled();
      // No selection strip or tag grid is rendered in the empty state.
      expect(
        container.querySelector("[data-testid='image-tag-editor-strip']"),
      ).toBeNull();
      expect(
        container.querySelector("[data-testid='image-tag-editor-grid']"),
      ).toBeNull();
    } finally {
      unmount();
    }
  });

  test("3. tri-state derivation renders checked / indeterminate / unchecked", async () => {
    const { container, unmount } = renderWithClient(<ImageTagEditorPage />, {
      routerInitialEntries: ["/images/edit/tags?ids=1,2,3"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='image-tag-editor-grid']") !==
          null,
      );
      const rows = container.querySelectorAll(
        "[data-testid='image-tag-editor-row']",
      );
      expect(rows.length).toBeGreaterThanOrEqual(3);
      // Outdoor (id=1) is applied to all → state=checked.
      const outdoorRow = container.querySelector(
        "[data-testid='image-tag-editor-row'][data-tag-id='1']",
      ) as HTMLElement;
      const outdoorCheckbox = outdoorRow?.querySelector(
        "[role='checkbox']",
      ) as HTMLElement;
      expect(outdoorCheckbox?.getAttribute("data-state")).toBe("checked");
      // Sunny (id=3) is applied to 2 of 3 → state=indeterminate.
      const sunnyRow = container.querySelector(
        "[data-testid='image-tag-editor-row'][data-tag-id='3']",
      ) as HTMLElement;
      const sunnyCheckbox = sunnyRow?.querySelector(
        "[role='checkbox']",
      ) as HTMLElement;
      expect(sunnyCheckbox?.getAttribute("data-state")).toBe("indeterminate");
      // The partial marker line renders the N of M count.
      const partial = sunnyRow?.querySelector(
        "[data-testid='image-tag-editor-partial']",
      );
      expect(partial?.textContent).toContain("2 of 3");
      // Indoor (id=2) is applied to none → state=unchecked.
      const indoorRow = container.querySelector(
        "[data-testid='image-tag-editor-row'][data-tag-id='2']",
      ) as HTMLElement;
      const indoorCheckbox = indoorRow?.querySelector(
        "[role='checkbox']",
      ) as HTMLElement;
      expect(indoorCheckbox?.getAttribute("data-state")).toBe("unchecked");
    } finally {
      unmount();
    }
  });

  test("4. pending add: clicking an unchecked tag marks it adding and updates the pending bar", async () => {
    const { container, unmount } = renderWithClient(<ImageTagEditorPage />, {
      routerInitialEntries: ["/images/edit/tags?ids=1,2,3"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='image-tag-editor-grid']") !==
          null,
      );
      const indoorRow = container.querySelector(
        "[data-testid='image-tag-editor-row'][data-tag-id='2']",
      ) as HTMLElement;
      const indoorCheckbox = indoorRow.querySelector(
        "[role='checkbox']",
      ) as HTMLElement;
      expect(indoorCheckbox.getAttribute("data-pending")).toBeNull();

      act(() => {
        indoorCheckbox.dispatchEvent(
          new MouseEvent("click", { bubbles: true }),
        );
      });

      // The checkbox is now pending=adding.
      const afterClick = container.querySelector(
        "[data-testid='image-tag-editor-row'][data-tag-id='2'] [role='checkbox']",
      ) as HTMLElement;
      expect(afterClick.getAttribute("data-pending")).toBe("adding");

      // The pending bar reports "+1 to add" and a total of 1 change.
      const addingCount = container.querySelector(
        "[data-testid='pending-adding-count']",
      );
      expect(addingCount?.textContent).toContain("+1");
      const total = container.querySelector(
        "[data-testid='pending-total']",
      );
      expect(total?.textContent).toContain("1 change");

      // Save becomes enabled once there's a pending change.
      const save = container.querySelector(
        "[data-testid='image-tag-editor-save']",
      ) as HTMLButtonElement;
      expect(save.disabled).toBe(false);
    } finally {
      unmount();
    }
  });

  test("5. pending remove: clicking a checked tag marks it removing and updates the pending bar", async () => {
    const { container, unmount } = renderWithClient(<ImageTagEditorPage />, {
      routerInitialEntries: ["/images/edit/tags?ids=1,2,3"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='image-tag-editor-grid']") !==
          null,
      );
      // Outdoor (id=1) is applied to all → baseline=checked; click → removing.
      const outdoorCheckbox = container.querySelector(
        "[data-testid='image-tag-editor-row'][data-tag-id='1'] [role='checkbox']",
      ) as HTMLElement;
      act(() => {
        outdoorCheckbox.dispatchEvent(
          new MouseEvent("click", { bubbles: true }),
        );
      });
      const after = container.querySelector(
        "[data-testid='image-tag-editor-row'][data-tag-id='1'] [role='checkbox']",
      ) as HTMLElement;
      expect(after.getAttribute("data-pending")).toBe("removing");
      // Pending bar shows the removing count; no adding count rendered.
      const removing = container.querySelector(
        "[data-testid='pending-removing-count']",
      );
      expect(removing?.textContent).toContain("-1");
      expect(
        container.querySelector("[data-testid='pending-adding-count']"),
      ).toBeNull();
    } finally {
      unmount();
    }
  });

  test("6. cancel with pending changes opens ConfirmDialog; confirming discards", async () => {
    const { container, unmount } = renderWithClient(<ImageTagEditorPage />, {
      routerInitialEntries: ["/images/edit/tags?ids=1,2,3"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='image-tag-editor-grid']") !==
          null,
      );
      // Create a pending change.
      const indoorCheckbox = container.querySelector(
        "[data-testid='image-tag-editor-row'][data-tag-id='2'] [role='checkbox']",
      ) as HTMLElement;
      act(() => {
        indoorCheckbox.dispatchEvent(
          new MouseEvent("click", { bubbles: true }),
        );
      });
      // Click Cancel — ConfirmDialog should appear.
      const cancel = container.querySelector(
        "[data-testid='image-tag-editor-cancel']",
      ) as HTMLButtonElement;
      act(() => {
        cancel.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await waitFor(() => {
        // Confirm dialog is rendered via Portal, so it ends up in document.body.
        return document.body.textContent?.includes("Discard changes?") === true;
      });

      // Click the danger Confirm button inside the dialog.
      const confirmBtn = document.body.querySelector(
        "[data-testid='confirm-dialog-confirm']",
      ) as HTMLButtonElement | null;
      expect(confirmBtn).not.toBeNull();
      act(() => {
        confirmBtn!.dispatchEvent(
          new MouseEvent("click", { bubbles: true }),
        );
      });
      // After discard, pending state clears and mutation is not called.
      await flushPromises();
      expect(batchUpdateTagsMock).not.toHaveBeenCalled();
    } finally {
      unmount();
    }
  });

  test("7. save success: mutation fires with add/remove arrays and invalidates queries", async () => {
    const { container, client, unmount } = renderWithClient(
      <ImageTagEditorPage />,
      { routerInitialEntries: ["/images/edit/tags?ids=1,2,3"] },
    );
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='image-tag-editor-grid']") !==
          null,
      );
      // Toggle one "add" (id=2 baseline=unchecked) and one "remove"
      // (id=1 baseline=checked).
      const indoor = container.querySelector(
        "[data-testid='image-tag-editor-row'][data-tag-id='2'] [role='checkbox']",
      ) as HTMLElement;
      act(() => {
        indoor.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      const outdoor = container.querySelector(
        "[data-testid='image-tag-editor-row'][data-tag-id='1'] [role='checkbox']",
      ) as HTMLElement;
      act(() => {
        outdoor.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });

      // Spy on invalidateQueries so we can verify both the stats and list
      // keys are refreshed after a successful save.
      const invalidateSpy = jest.spyOn(client, "invalidateQueries");

      const save = container.querySelector(
        "[data-testid='image-tag-editor-save']",
      ) as HTMLButtonElement;
      expect(save.disabled).toBe(false);
      await act(async () => {
        save.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await waitFor(() => batchUpdateTagsMock.mock.calls.length > 0);

      // Dispatch shape: (fileIds, addIds, removeIds).
      const [fileIds, addIds, removeIds] = batchUpdateTagsMock.mock.calls[0];
      expect(fileIds).toEqual([1, 2, 3]);
      expect(addIds).toEqual([2]);
      expect(removeIds).toEqual([1]);

      // Both stats+list keys get invalidated after the mutation resolves.
      await waitFor(() =>
        invalidateSpy.mock.calls.some((call) => {
          const key = (call[0] as { queryKey: readonly unknown[] })
            .queryKey as readonly unknown[];
          return Array.isArray(key) && key[0] === "tags" && key[1] === "stats";
        }),
      );
      await waitFor(() =>
        invalidateSpy.mock.calls.some((call) => {
          const key = (call[0] as { queryKey: readonly unknown[] })
            .queryKey as readonly unknown[];
          return Array.isArray(key) && key[0] === "tags" && key[1] === "list";
        }),
      );
    } finally {
      unmount();
    }
  });

  test("8. search filter hides non-matching categories/tags", async () => {
    const { container, unmount } = renderWithClient(<ImageTagEditorPage />, {
      routerInitialEntries: ["/images/edit/tags?ids=1,2,3"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='image-tag-editor-grid']") !==
          null,
      );
      // Baseline: at least the "Scenes" and "Nature / Weather" categories.
      expect(container.textContent).toContain("Scenes");
      expect(container.textContent).toContain("Nature / Weather");

      const searchInput = container.querySelector(
        "input[role='searchbox']",
      ) as HTMLInputElement;
      expect(searchInput).not.toBeNull();

      setInputValue(searchInput, "sunny");
      await waitFor(() => searchInput.value === "sunny");

      // "Sunny" (nature) matches; "Outdoor" (scene) is hidden.
      await waitFor(() => {
        const text = container.textContent ?? "";
        return text.includes("Sunny") && !text.includes("Outdoor");
      });
      // The Scenes category is not rendered at all because none of its tags
      // survived the filter.
      expect(container.textContent).not.toContain("Scenes");
      expect(container.textContent).toContain("Nature / Weather");
    } finally {
      unmount();
    }
  });
});
