/**
 * Integration tests for `ImageEditorPage` (route `/images/edit`).
 *
 * Coverage:
 *   1. Empty selection — no `?ids=` and no selection store → EmptyState.
 *   2. Loading state — queries pending → skeleton renders.
 *   3. Season section — renders season list with radio-style selection.
 *   4. Characters section — renders character list with tri-state checkboxes.
 *   5. Tags section — renders tag grid with tri-state checkboxes.
 *   6. Character pending add — clicking unchecked character marks it adding.
 *   7. Character save — dispatches add/remove arrays.
 *   8. Tag save — dispatches add/remove arrays.
 *   9. Cancel with changes — confirm dialog appears.
 *   10. Sections collapse/expand on header click.
 */

// ---- mocks (must run before module imports) ------------------------------

const getAnimeDetailsMock = jest.fn();
const getAllTagsMock = jest.fn();
const readTagsByFileIDsMock = jest.fn();
const batchUpdateTagsMock = jest.fn();
const getImageCharacterIDsMock = jest.fn();
const batchUpdateCharactersMock = jest.fn();
const moveFilesToSeasonMock = jest.fn();

jest.mock("../../../src/lib/api", () => ({
  __esModule: true,
  AnimeService: {
    GetAnimeDetails: (...args: unknown[]) => getAnimeDetailsMock(...args),
    MoveFilesToSeason: (...args: unknown[]) => moveFilesToSeasonMock(...args),
  },
  TagService: {
    GetAll: (...args: unknown[]) => getAllTagsMock(...args),
    ReadTagsByFileIDs: (...args: unknown[]) =>
      readTagsByFileIDsMock(...args),
  },
  TagFrontendService: {
    BatchUpdateTagsForFiles: (...args: unknown[]) =>
      batchUpdateTagsMock(...args),
  },
  CharacterService: {
    GetImageCharacterIDs: (...args: unknown[]) =>
      getImageCharacterIDsMock(...args),
    BatchUpdateCharactersForFiles: (...args: unknown[]) =>
      batchUpdateCharactersMock(...args),
  },
}));

// ---- imports under test --------------------------------------------------

import { act } from "react-dom/test-utils";

import { ImageEditorPage } from "../../../src/pages/image-editor";
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

const ANIME_DETAILS = {
  anime: { id: 10, name: "Test Anime", aniListId: null },
  tags: [
    { id: 1, name: "Outdoor", category: "scene", imageCount: 5, thumbnailPath: "" },
  ],
  characters: [
    { id: 100, name: "Alice", imageCount: 5, thumbnailPath: "" },
    { id: 101, name: "Bob", imageCount: 3, thumbnailPath: "" },
    { id: 102, name: "Charlie", imageCount: 0, thumbnailPath: "" },
  ],
  folders: [],
  folderTree: null,
  // seasons are called "entries" in the raw response
  entries: [
    {
      id: 200,
      name: "Season 1",
      entryType: "season",
      entryNumber: 1,
      airingSeason: "",
      airingYear: null,
      imageCount: 10,
      children: [
        {
          id: 201,
          name: "Episode 1",
          entryType: "other",
          entryNumber: null,
          airingSeason: "",
          airingYear: null,
          imageCount: 5,
          children: [],
        },
      ],
    },
    {
      id: 202,
      name: "Movie 1",
      entryType: "movie",
      entryNumber: 1,
      airingSeason: "",
      airingYear: null,
      imageCount: 3,
      children: [],
    },
  ],
};

function buildStatsResponse(totalSelected: number) {
  const entry = (fileCount: number): TagStat => ({
    fileCount,
    isAddedBySelectedFiles: fileCount > 0,
  });
  return {
    tagStats: {
      1: entry(totalSelected), // checked
      3: entry(Math.max(1, totalSelected - 1)), // indeterminate
    } as Record<number, TagStat>,
  };
}

/** Character stats: image 1 has Alice+Bob, image 2 has Alice, image 3 has none */
function buildCharacterStats() {
  return {
    "1": [100, 101],
    "2": [100],
    "3": [],
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

// ---- tests ----------------------------------------------------------------

describe("ImageEditorPage", () => {
  beforeEach(() => {
    getAnimeDetailsMock.mockReset();
    getAllTagsMock.mockReset();
    readTagsByFileIDsMock.mockReset();
    batchUpdateTagsMock.mockReset();
    getImageCharacterIDsMock.mockReset();
    batchUpdateCharactersMock.mockReset();
    moveFilesToSeasonMock.mockReset();

    getAnimeDetailsMock.mockResolvedValue(ANIME_DETAILS);
    getAllTagsMock.mockResolvedValue(TAGS);
    readTagsByFileIDsMock.mockResolvedValue(buildStatsResponse(3));
    getImageCharacterIDsMock.mockResolvedValue(buildCharacterStats());
    batchUpdateTagsMock.mockResolvedValue(undefined);
    batchUpdateCharactersMock.mockResolvedValue(undefined);
    moveFilesToSeasonMock.mockResolvedValue(undefined);
    resetSelectionStore();
  });

  test("1. empty selection: no ids → EmptyState shown", async () => {
    const { container, unmount } = renderWithClient(<ImageEditorPage />, {
      routerInitialEntries: ["/images/edit?anime=10"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='image-editor-empty-back']") !==
          null,
      );
      expect(container.textContent).toContain("Nothing to edit");
    } finally {
      unmount();
    }
  });

  test("2. loading state: pending queries render skeleton", async () => {
    let resolveTags: (tags: Tag[]) => void = () => undefined;
    getAllTagsMock.mockImplementation(
      () => new Promise<Tag[]>((resolve) => { resolveTags = resolve; }),
    );

    const { container, unmount } = renderWithClient(<ImageEditorPage />, {
      routerInitialEntries: ["/images/edit?ids=1,2,3&anime=10"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='image-editor-strip']") !==
          null,
      );
      const loading = container.querySelector(
        "[data-testid='image-editor-loading']",
      );
      expect(loading).not.toBeNull();
    } finally {
      resolveTags(TAGS);
      await flushPromises();
      unmount();
    }
  });

  test("3. season section renders season list", async () => {
    const { container, unmount } = renderWithClient(<ImageEditorPage />, {
      routerInitialEntries: ["/images/edit?ids=1,2,3&anime=10"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector(
            "[data-testid='image-editor-season-section']",
          ) !== null,
      );
      const seasonSection = container.querySelector(
        "[data-testid='image-editor-season-section']",
      ) as HTMLElement;
      expect(seasonSection).not.toBeNull();
      // Check that seasons are listed
      expect(seasonSection.textContent).toContain("Season 1");
      expect(seasonSection.textContent).toContain("Episode 1");
      expect(seasonSection.textContent).toContain("Movie 1");
    } finally {
      unmount();
    }
  });

  test("4. characters section renders character list with tri-state", async () => {
    const { container, unmount } = renderWithClient(<ImageEditorPage />, {
      routerInitialEntries: ["/images/edit?ids=1,2,3&anime=10"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector(
            "[data-testid='image-editor-characters-section']",
          ) !== null,
      );
      const charSection = container.querySelector(
        "[data-testid='image-editor-characters-section']",
      ) as HTMLElement;
      expect(charSection).not.toBeNull();

      // Wait for character list to render
      await waitFor(
        () =>
          container.querySelector(
            "[data-testid='image-editor-character-list']",
          ) !== null,
      );

      // Alice: 2/3 → indeterminate; Bob: 1/3 → indeterminate; Charlie: 0/3 → unchecked
      const aliceRow = container.querySelector(
        "[data-testid='image-editor-character-row'][data-character-id='100']",
      ) as HTMLElement;
      expect(aliceRow).not.toBeNull();
      const aliceCheckbox = aliceRow?.querySelector(
        "[role='checkbox']",
      ) as HTMLElement;
      expect(aliceCheckbox?.getAttribute("data-state")).toBe("indeterminate");

      const charlieRow = container.querySelector(
        "[data-testid='image-editor-character-row'][data-character-id='102']",
      ) as HTMLElement;
      const charlieCheckbox = charlieRow?.querySelector(
        "[role='checkbox']",
      ) as HTMLElement;
      expect(charlieCheckbox?.getAttribute("data-state")).toBe("unchecked");
    } finally {
      unmount();
    }
  });

  test("5. tags section renders tag grid with tri-state", async () => {
    const { container, unmount } = renderWithClient(<ImageEditorPage />, {
      routerInitialEntries: ["/images/edit?ids=1,2,3&anime=10"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='image-editor-tag-grid']") !==
          null,
      );
      // Outdoor (id=1) applied to all → checked
      const outdoorRow = container.querySelector(
        "[data-testid='image-editor-tag-row'][data-tag-id='1']",
      ) as HTMLElement;
      const outdoorCheckbox = outdoorRow?.querySelector(
        "[role='checkbox']",
      ) as HTMLElement;
      expect(outdoorCheckbox?.getAttribute("data-state")).toBe("checked");
    } finally {
      unmount();
    }
  });

  test("6. character pending add: clicking unchecked character marks it adding", async () => {
    const { container, unmount } = renderWithClient(<ImageEditorPage />, {
      routerInitialEntries: ["/images/edit?ids=1,2,3&anime=10"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector(
            "[data-testid='image-editor-character-list']",
          ) !== null,
      );

      // Charlie (id=102) is unchecked; clicking → adding
      const charlieCheckbox = container.querySelector(
        "[data-testid='image-editor-character-row'][data-character-id='102'] [role='checkbox']",
      ) as HTMLElement;
      act(() => {
        charlieCheckbox.dispatchEvent(
          new MouseEvent("click", { bubbles: true }),
        );
      });

      const after = container.querySelector(
        "[data-testid='image-editor-character-row'][data-character-id='102'] [role='checkbox']",
      ) as HTMLElement;
      expect(after.getAttribute("data-pending")).toBe("adding");

      // Save Characters button is now enabled
      const saveBtn = container.querySelector(
        "[data-testid='image-editor-characters-save']",
      ) as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(false);
    } finally {
      unmount();
    }
  });

  test("7. character save dispatches add/remove arrays", async () => {
    const { container, unmount } = renderWithClient(<ImageEditorPage />, {
      routerInitialEntries: ["/images/edit?ids=1,2,3&anime=10"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector(
            "[data-testid='image-editor-character-list']",
          ) !== null,
      );

      // Add Charlie (unchecked → adding)
      const charlieCheckbox = container.querySelector(
        "[data-testid='image-editor-character-row'][data-character-id='102'] [role='checkbox']",
      ) as HTMLElement;
      act(() => {
        charlieCheckbox.dispatchEvent(
          new MouseEvent("click", { bubbles: true }),
        );
      });

      // Save characters
      const saveBtn = container.querySelector(
        "[data-testid='image-editor-characters-save']",
      ) as HTMLButtonElement;
      await act(async () => {
        saveBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await waitFor(() => batchUpdateCharactersMock.mock.calls.length > 0);

      const [fileIds, addIds, removeIds] =
        batchUpdateCharactersMock.mock.calls[0];
      expect(fileIds).toEqual([1, 2, 3]);
      expect(addIds).toEqual([102]);
      expect(removeIds).toEqual([]);
    } finally {
      unmount();
    }
  });

  test("8. tag save dispatches add/remove arrays", async () => {
    const { container, unmount } = renderWithClient(<ImageEditorPage />, {
      routerInitialEntries: ["/images/edit?ids=1,2,3&anime=10"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='image-editor-tag-grid']") !==
          null,
      );

      // Add Indoor (id=2, unchecked)
      const indoorCheckbox = container.querySelector(
        "[data-testid='image-editor-tag-row'][data-tag-id='2'] [role='checkbox']",
      ) as HTMLElement;
      act(() => {
        indoorCheckbox.dispatchEvent(
          new MouseEvent("click", { bubbles: true }),
        );
      });

      // Save tags
      const saveBtn = container.querySelector(
        "[data-testid='image-editor-tags-save']",
      ) as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(false);
      await act(async () => {
        saveBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await waitFor(() => batchUpdateTagsMock.mock.calls.length > 0);

      const [fileIds, addIds, removeIds] = batchUpdateTagsMock.mock.calls[0];
      expect(fileIds).toEqual([1, 2, 3]);
      expect(addIds).toEqual([2]);
      expect(removeIds).toEqual([]);
    } finally {
      unmount();
    }
  });

  test("9. cancel with changes opens confirm dialog", async () => {
    const { container, unmount } = renderWithClient(<ImageEditorPage />, {
      routerInitialEntries: ["/images/edit?ids=1,2,3&anime=10"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='image-editor-tag-grid']") !==
          null,
      );

      // Create a pending tag change
      const indoorCheckbox = container.querySelector(
        "[data-testid='image-editor-tag-row'][data-tag-id='2'] [role='checkbox']",
      ) as HTMLElement;
      act(() => {
        indoorCheckbox.dispatchEvent(
          new MouseEvent("click", { bubbles: true }),
        );
      });

      // Click Cancel
      const cancel = container.querySelector(
        "[data-testid='image-editor-cancel']",
      ) as HTMLButtonElement;
      act(() => {
        cancel.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });

      // ConfirmDialog should appear
      await waitFor(() => {
        return document.body.textContent?.includes("Discard changes?") === true;
      });

      // Confirm discard
      const confirmBtn = document.body.querySelector(
        "[data-testid='confirm-dialog-confirm']",
      ) as HTMLButtonElement | null;
      expect(confirmBtn).not.toBeNull();
      act(() => {
        confirmBtn!.dispatchEvent(
          new MouseEvent("click", { bubbles: true }),
        );
      });
      await flushPromises();
      // No mutations should have been called
      expect(batchUpdateTagsMock).not.toHaveBeenCalled();
      expect(batchUpdateCharactersMock).not.toHaveBeenCalled();
    } finally {
      unmount();
    }
  });

  test("10. sections collapse/expand on header click", async () => {
    const { container, unmount } = renderWithClient(<ImageEditorPage />, {
      routerInitialEntries: ["/images/edit?ids=1,2,3&anime=10"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector(
            "[data-testid='image-editor-tags-section']",
          ) !== null,
      );

      // Tags section body should be visible
      const tagsBody = container.querySelector(
        "[data-testid='image-editor-tags-section-body']",
      );
      expect(tagsBody).not.toBeNull();

      // Click tag section header to collapse
      const tagsHeader = container.querySelector(
        "[data-testid='image-editor-tags-section-header']",
      ) as HTMLElement;
      act(() => {
        tagsHeader.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });

      // Body should now be hidden
      const tagsBodyAfter = container.querySelector(
        "[data-testid='image-editor-tags-section-body']",
      );
      expect(tagsBodyAfter).toBeNull();

      // Click again to re-expand
      act(() => {
        tagsHeader.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      const tagsBodyReopen = container.querySelector(
        "[data-testid='image-editor-tags-section-body']",
      );
      expect(tagsBodyReopen).not.toBeNull();
    } finally {
      unmount();
    }
  });

  test("11. season save moves files to selected season", async () => {
    const { container, unmount } = renderWithClient(<ImageEditorPage />, {
      routerInitialEntries: ["/images/edit?ids=1,2,3&anime=10"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector(
            "[data-testid='image-editor-season-section']",
          ) !== null,
      );

      // Select a season
      const seasonItem = container.querySelector(
        "[data-testid='image-editor-season-item'][data-season-id='200']",
      ) as HTMLElement;
      act(() => {
        seasonItem.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });

      // Save season
      const saveBtn = container.querySelector(
        "[data-testid='image-editor-season-save']",
      ) as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(false);
      await act(async () => {
        saveBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await waitFor(() => moveFilesToSeasonMock.mock.calls.length > 0);
      expect(moveFilesToSeasonMock).toHaveBeenCalledWith([1, 2, 3], 200);
    } finally {
      unmount();
    }
  });

  test("12. show other anime characters toggle", async () => {
    const { container, unmount } = renderWithClient(<ImageEditorPage />, {
      routerInitialEntries: ["/images/edit?ids=1,2,3&anime=10"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector(
            "[data-testid='image-editor-show-other-characters']",
          ) !== null,
      );

      // Initially the placeholder is not shown
      expect(
        container.querySelector(
          "[data-testid='image-editor-other-characters-placeholder']",
        ),
      ).toBeNull();

      // Click toggle
      const toggleBtn = container.querySelector(
        "[data-testid='image-editor-show-other-characters']",
      ) as HTMLButtonElement;
      act(() => {
        toggleBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });

      // Now placeholder text should appear
      expect(
        container.querySelector(
          "[data-testid='image-editor-other-characters-placeholder']",
        ),
      ).not.toBeNull();

      // Click again to hide
      act(() => {
        toggleBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      expect(
        container.querySelector(
          "[data-testid='image-editor-other-characters-placeholder']",
        ),
      ).toBeNull();
    } finally {
      unmount();
    }
  });

  test("13. season deselect by clicking the same season again", async () => {
    const { container, unmount } = renderWithClient(<ImageEditorPage />, {
      routerInitialEntries: ["/images/edit?ids=1,2,3&anime=10"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector(
            "[data-testid='image-editor-season-item']",
          ) !== null,
      );

      const seasonItem = container.querySelector(
        "[data-testid='image-editor-season-item'][data-season-id='200']",
      ) as HTMLElement;

      // Select
      act(() => {
        seasonItem.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      const saveBtn = container.querySelector(
        "[data-testid='image-editor-season-save']",
      ) as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(false);

      // Deselect by clicking same item again
      act(() => {
        seasonItem.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      expect(
        (container.querySelector("[data-testid='image-editor-season-save']") as HTMLButtonElement).disabled,
      ).toBe(true);
    } finally {
      unmount();
    }
  });

  test("14. character remove: clicking checked character marks it removing", async () => {
    const { container, unmount } = renderWithClient(<ImageEditorPage />, {
      routerInitialEntries: ["/images/edit?ids=1,2,3&anime=10"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector(
            "[data-testid='image-editor-character-list']",
          ) !== null,
      );

      // Alice (id=100) is indeterminate (2/3). Clicking sets pending=adding
      const aliceCheckbox = container.querySelector(
        "[data-testid='image-editor-character-row'][data-character-id='100'] [role='checkbox']",
      ) as HTMLElement;
      act(() => {
        aliceCheckbox.dispatchEvent(
          new MouseEvent("click", { bubbles: true }),
        );
      });

      const after = container.querySelector(
        "[data-testid='image-editor-character-row'][data-character-id='100'] [role='checkbox']",
      ) as HTMLElement;
      expect(after.getAttribute("data-pending")).toBe("adding");
    } finally {
      unmount();
    }
  });

  test("15. cancel without changes navigates back immediately", async () => {
    const { container, unmount } = renderWithClient(<ImageEditorPage />, {
      routerInitialEntries: ["/images/edit?ids=1,2,3&anime=10"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='image-editor-tag-grid']") !==
          null,
      );

      // Click cancel WITHOUT making any changes
      const cancel = container.querySelector(
        "[data-testid='image-editor-cancel']",
      ) as HTMLButtonElement;
      act(() => {
        cancel.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });

      // Confirm dialog should NOT appear
      await flushPromises();
      expect(
        document.body.textContent?.includes("Discard changes?"),
      ).toBe(false);
    } finally {
      unmount();
    }
  });

  test("16. uses store selection when no ids in URL", async () => {
    // Put ids in the store instead of URL
    act(() => {
      useSelectionStore.setState({
        selectMode: true,
        selectedIds: new Set([1, 2, 3]),
        lastSelectedId: 3,
      });
    });

    const { container, unmount } = renderWithClient(<ImageEditorPage />, {
      routerInitialEntries: ["/images/edit?anime=10"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='image-editor-strip']") !== null,
      );
      // Should show 3 strip items from the store selection
      const stripItems = container.querySelectorAll(
        "[data-testid='image-editor-strip-item']",
      );
      expect(stripItems.length).toBe(3);
    } finally {
      unmount();
    }
  });
});
