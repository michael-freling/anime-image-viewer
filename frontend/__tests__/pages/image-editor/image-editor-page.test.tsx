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

jest.mock("../../../src/lib/api", () => ({
  __esModule: true,
  AnimeService: {
    GetAnimeDetails: (...args: unknown[]) => getAnimeDetailsMock(...args),
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

    getAnimeDetailsMock.mockResolvedValue(ANIME_DETAILS);
    getAllTagsMock.mockResolvedValue(TAGS);
    readTagsByFileIDsMock.mockResolvedValue(buildStatsResponse(3));
    getImageCharacterIDsMock.mockResolvedValue(buildCharacterStats());
    batchUpdateTagsMock.mockResolvedValue(undefined);
    batchUpdateCharactersMock.mockResolvedValue(undefined);
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
});
