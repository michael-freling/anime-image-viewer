/**
 * Tests for `EntriesTab`.
 *
 * Spec: ux-design.md section 3.2.2. We mount the tab via the real route tree so
 * `useParams` + `useNavigate` work, and stub AnimeService.
 */

jest.mock("react-photo-album/masonry.css", () => ({}), { virtual: true });
jest.mock("react-photo-album/columns.css", () => ({}), { virtual: true });
jest.mock("react-photo-album/rows.css", () => ({}), { virtual: true });
jest.mock("react-photo-album", () => {
  const ReactModule = jest.requireActual<typeof import("react")>("react");
  const renderPhotos = () =>
    ReactModule.createElement("div", { "data-testid": "photo-album-stub" });
  return {
    __esModule: true,
    MasonryPhotoAlbum: renderPhotos,
    ColumnsPhotoAlbum: renderPhotos,
    RowsPhotoAlbum: renderPhotos,
  };
});

const getAnimeDetailsMock = jest.fn();
const createAnimeEntryMock = jest.fn();
const renameEntryMock = jest.fn();
const updateEntryTypeMock = jest.fn();
const updateEntryAiringInfoMock = jest.fn();
const deleteEntryMock = jest.fn();
jest.mock("../../../src/lib/api", () => ({
  __esModule: true,
  AnimeService: {
    GetAnimeDetails: (...args: unknown[]) => getAnimeDetailsMock(...args),
    GetAnimeImages: () => Promise.resolve({ images: [] }),
    GetAnimeImagesByEntry: () => Promise.resolve({ images: [] }),
    GetAnimeList: () => Promise.resolve([]),
    CreateAnimeEntry: (...args: unknown[]) => createAnimeEntryMock(...args),
    RenameEntry: (...args: unknown[]) => renameEntryMock(...args),
    UpdateEntryType: (...args: unknown[]) => updateEntryTypeMock(...args),
    UpdateEntryAiringInfo: (...args: unknown[]) =>
      updateEntryAiringInfoMock(...args),
    DeleteEntry: (...args: unknown[]) => deleteEntryMock(...args),
  },
  TagService: {
    GetAll: () => Promise.resolve([]),
  },
  SearchService: {
    SearchImages: () => Promise.resolve({ images: [] }),
  },
}));

// Suppress toast portal / animation warnings in test output.
jest.mock("../../../src/components/ui/toaster", () => ({
  __esModule: true,
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
    dismiss: jest.fn(),
  },
}));

import { act } from "react-dom/test-utils";

import { routes } from "../../../src/app/routes";
import type { AnimeDetail, Entry } from "../../../src/types";
import { renderRoutes, waitFor } from "../../test-utils";

function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: 0,
    name: "Entry",
    type: "season",
    entryNumber: 1,
    airingSeason: "",
    airingYear: null,
    imageCount: 0,
    children: [],
    ...overrides,
  };
}

function makeDetail(overrides: Partial<AnimeDetail> = {}): AnimeDetail {
  return {
    anime: { id: 42, name: "Bebop", aniListId: null },
    tags: [],
    folders: [],
    folderTree: null,
    entries: [],
    ...overrides,
  };
}

describe("EntriesTab", () => {
  beforeEach(() => {
    getAnimeDetailsMock.mockReset();
    createAnimeEntryMock.mockReset();
    renameEntryMock.mockReset();
    updateEntryTypeMock.mockReset();
    updateEntryAiringInfoMock.mockReset();
    deleteEntryMock.mockReset();
  });

  // -----------------------------------------------------------------------
  // Existing read-only tests
  // -----------------------------------------------------------------------

  test("renders one row per top-level entry", async () => {
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({
        entries: [
          makeEntry({ id: 1, name: "Season 1", imageCount: 5 }),
          makeEntry({ id: 2, name: "Season 2", imageCount: 3 }),
          makeEntry({ id: 3, name: "The Movie", type: "movie", imageCount: 1 }),
        ],
      }),
    );
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/entries"],
    });
    try {
      await waitFor(
        () =>
          container.querySelectorAll("[data-testid='entry-row']").length === 3,
      );
      // Badges reflect the entry type (S / M).
      const badges = Array.from(
        container.querySelectorAll("[data-testid='entry-row-badge']"),
      ).map((b) => b.textContent);
      expect(badges).toEqual(["S", "S", "M"]);
    } finally {
      unmount();
    }
  });

  test("renders child entries indented under their parent", async () => {
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({
        entries: [
          makeEntry({
            id: 1,
            name: "Season 1",
            imageCount: 5,
            children: [
              makeEntry({
                id: 2,
                name: "S1 Part 2",
                type: "season",
                imageCount: 2,
              }),
            ],
          }),
        ],
      }),
    );
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/entries"],
    });
    try {
      await waitFor(
        () =>
          container.querySelectorAll("[data-testid='entry-row']").length === 2,
      );
      // The child row is listed after the parent.
      const rows = Array.from(
        container.querySelectorAll("[data-testid='entry-row']"),
      );
      expect(rows[0].getAttribute("data-entry-id")).toBe("1");
      expect(rows[1].getAttribute("data-entry-id")).toBe("2");
    } finally {
      unmount();
    }
  });

  test("empty entries renders the empty state with Add entry action", async () => {
    getAnimeDetailsMock.mockResolvedValue(makeDetail({ entries: [] }));
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/entries"],
    });
    try {
      await waitFor(
        () => (container.textContent ?? "").includes("No entries yet"),
      );
      expect(container.textContent).toContain("Add entry");
    } finally {
      unmount();
    }
  });

  test("clicking an entry row navigates to /anime/:id/images?entry=<id>", async () => {
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({
        entries: [makeEntry({ id: 9, name: "Season 1", imageCount: 5 })],
      }),
    );
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/entries"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='entry-row']") !== null,
      );
      const clickable = container.querySelector(
        "[data-testid='entry-row'] [role='button']",
      ) as HTMLElement;
      expect(clickable).not.toBeNull();
      act(() => {
        clickable.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      // After navigation, the images tab mounts.
      await waitFor(
        () =>
          container.querySelector("[data-testid='images-tab']") !== null,
      );
    } finally {
      unmount();
    }
  });

  test("surfaces an error alert when the detail query fails", async () => {
    getAnimeDetailsMock.mockRejectedValue(new Error("network"));
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/entries"],
    });
    try {
      await waitFor(
        () => container.querySelector("[role='alert']") !== null,
      );
      const alert = container.querySelector("[role='alert']");
      // Either the layout's outer alert OR the tab's inner alert may render
      // -- both signal the failure to the user.
      expect(alert?.textContent ?? "").toMatch(/Could not load/);
    } finally {
      unmount();
    }
  });

  test("pressing Enter on an entry row navigates to the entry-filtered images", async () => {
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({
        entries: [makeEntry({ id: 9, name: "Season 1", imageCount: 5 })],
      }),
    );
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/entries"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='entry-row']") !== null,
      );
      const clickable = container.querySelector(
        "[data-testid='entry-row'] [role='button']",
      ) as HTMLElement;
      act(() => {
        clickable.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Enter",
            bubbles: true,
            cancelable: true,
          }),
        );
      });
      await waitFor(
        () =>
          container.querySelector("[data-testid='images-tab']") !== null,
      );
    } finally {
      unmount();
    }
  });

  test("pressing Space on an entry row also navigates (and prevents scroll)", async () => {
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({
        entries: [makeEntry({ id: 9, name: "Season 1", imageCount: 5 })],
      }),
    );
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/entries"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='entry-row']") !== null,
      );
      const clickable = container.querySelector(
        "[data-testid='entry-row'] [role='button']",
      ) as HTMLElement;
      const evt = new KeyboardEvent("keydown", {
        key: " ",
        bubbles: true,
        cancelable: true,
      });
      act(() => {
        clickable.dispatchEvent(evt);
      });
      expect(evt.defaultPrevented).toBe(true);
      await waitFor(
        () =>
          container.querySelector("[data-testid='images-tab']") !== null,
      );
    } finally {
      unmount();
    }
  });

  test("pressing an unrelated key does not navigate away", async () => {
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({
        entries: [makeEntry({ id: 9, name: "Season 1", imageCount: 5 })],
      }),
    );
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/entries"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='entry-row']") !== null,
      );
      const clickable = container.querySelector(
        "[data-testid='entry-row'] [role='button']",
      ) as HTMLElement;
      act(() => {
        clickable.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "a",
            bubbles: true,
            cancelable: true,
          }),
        );
      });
      // Still on entries tab.
      expect(
        container.querySelector("[data-testid='entry-row']"),
      ).not.toBeNull();
      expect(
        container.querySelector("[data-testid='images-tab']"),
      ).toBeNull();
    } finally {
      unmount();
    }
  });

  test("entry without an airing season hides the airing line", async () => {
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({
        entries: [
          makeEntry({
            id: 1,
            name: "Season 1",
            airingSeason: "",
            airingYear: null,
            imageCount: 5,
          }),
        ],
      }),
    );
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/entries"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='entry-row']") !== null,
      );
      // The airing line is omitted (no "Spring 2024" text), only the image
      // count is shown beneath the title.
      const row = container.querySelector(
        "[data-testid='entry-row']",
      ) as HTMLElement;
      expect(row.textContent).toContain("5 images");
    } finally {
      unmount();
    }
  });

  test("entry with empty name falls back to '{label} {entryNumber}' format", async () => {
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({
        entries: [
          makeEntry({
            id: 1,
            name: "",
            type: "season",
            entryNumber: 3,
            imageCount: 0,
          }),
        ],
      }),
    );
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/entries"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='entry-row']") !== null,
      );
      const row = container.querySelector(
        "[data-testid='entry-row']",
      ) as HTMLElement;
      // Falls back to "Season 3" via the ENTRY_TYPE_CONFIGS label + number.
      expect(row.textContent).toMatch(/Season\s*3/);
    } finally {
      unmount();
    }
  });

  test("entry whose type isn't in ENTRY_TYPE_CONFIGS uses the 'other' fallback", async () => {
    // An "other"-typed entry exercises the `?? ENTRY_TYPE_CONFIGS.other`
    // fallback inside EntryRow.
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({
        entries: [
          makeEntry({
            id: 1,
            name: "Special",
            type: "other",
            imageCount: 0,
          }),
        ],
      }),
    );
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/entries"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='entry-row']") !== null,
      );
      const badge = container.querySelector(
        "[data-testid='entry-row-badge']",
      );
      expect(badge?.textContent).toBe("O");
    } finally {
      unmount();
    }
  });

  test("error state surfaces a non-Error rejection via String(...)", async () => {
    // Reject with something that isn't an Error instance -- the
    // `error instanceof Error ? ... : String(error ?? "")` branch picks the
    // String() coercion, which we observe in the rendered alert text.
    getAnimeDetailsMock.mockRejectedValue("string-only-error");
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/entries"],
    });
    try {
      await waitFor(
        () => container.querySelector("[role='alert']") !== null,
      );
      const alert = container.querySelector("[role='alert']");
      expect(alert?.textContent ?? "").toContain("string-only-error");
    } finally {
      unmount();
    }
  });

  test("non-numeric animeId in the URL still keeps the query disabled", async () => {
    // /anime/0/entries -> parseAnimeId returns 0 -> the detail query is
    // disabled, so getAnimeDetailsMock is never invoked. The tab still
    // mounts (animeId 0 is technically a valid path) -- we just don't fire
    // the network call.
    getAnimeDetailsMock.mockResolvedValue(makeDetail({ entries: [] }));
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/0/entries"],
    });
    try {
      // Wait for ANY of the tab's branches to render (the test only cares
      // that the disabled-query branch fired, not which fallback the page
      // chose).
      await waitFor(
        () =>
          container.querySelector("[data-testid='entries-tab']") !== null ||
          container.querySelector(
            "[data-testid='entries-tab-loading']",
          ) !== null,
        { timeout: 200 },
      ).catch(() => undefined);
      // The disabled query should never have been executed.
      expect(getAnimeDetailsMock).not.toHaveBeenCalled();
    } finally {
      unmount();
    }
  });

  test("Retry button on error state kicks off a refetch", async () => {
    let calls = 0;
    getAnimeDetailsMock.mockImplementation(() => {
      calls += 1;
      if (calls === 1) {
        return Promise.reject(new Error("boom"));
      }
      return Promise.resolve(
        makeDetail({
          entries: [makeEntry({ id: 1, name: "Season 1", imageCount: 0 })],
        }),
      );
    });
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/entries"],
    });
    try {
      await waitFor(
        () => container.querySelector("[role='alert']") !== null,
      );
      const retry = Array.from(container.querySelectorAll("button")).find(
        (b) => (b.textContent ?? "").trim() === "Retry",
      ) as HTMLButtonElement | undefined;
      expect(retry).toBeDefined();
      act(() => {
        retry!.click();
      });
      await waitFor(
        () =>
          container.querySelector("[data-testid='entry-row']") !== null,
      );
    } finally {
      unmount();
    }
  });

  // -----------------------------------------------------------------------
  // New editing tests
  // -----------------------------------------------------------------------

  test("renders Add entry button when entries exist", async () => {
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({
        entries: [makeEntry({ id: 1, name: "Season 1", imageCount: 0 })],
      }),
    );
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/entries"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='entry-row']") !== null,
      );
      const addBtn = container.querySelector(
        "[data-testid='add-entry-btn']",
      );
      expect(addBtn).not.toBeNull();
      expect(addBtn?.textContent).toContain("Add entry");
    } finally {
      unmount();
    }
  });

  test("renders edit and delete buttons on each entry row", async () => {
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({
        entries: [
          makeEntry({ id: 1, name: "Season 1", imageCount: 0 }),
          makeEntry({ id: 2, name: "Season 2", imageCount: 0 }),
        ],
      }),
    );
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/entries"],
    });
    try {
      await waitFor(
        () =>
          container.querySelectorAll("[data-testid='entry-row']").length === 2,
      );
      const editBtns = container.querySelectorAll(
        "[data-testid='entry-edit-btn']",
      );
      const deleteBtns = container.querySelectorAll(
        "[data-testid='entry-delete-btn']",
      );
      expect(editBtns.length).toBe(2);
      expect(deleteBtns.length).toBe(2);
    } finally {
      unmount();
    }
  });

  test("clicking Add entry opens the form dialog", async () => {
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({
        entries: [makeEntry({ id: 1, name: "Season 1", imageCount: 0 })],
      }),
    );
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/entries"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='add-entry-btn']") !== null,
      );
      act(() => {
        (
          container.querySelector(
            "[data-testid='add-entry-btn']",
          ) as HTMLElement
        ).click();
      });
      // Dialog renders via Portal into document.body, not inside container.
      await waitFor(
        () =>
          document.body.querySelector("[data-testid='entry-form-dialog']") !==
          null,
      );
      const submitBtn = document.body.querySelector(
        "[data-testid='entry-form-submit']",
      );
      expect(submitBtn?.textContent).toContain("Add entry");
    } finally {
      unmount();
    }
  });

  test("clicking edit button opens form dialog pre-filled with entry data", async () => {
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({
        entries: [
          makeEntry({
            id: 1,
            name: "Season 1",
            type: "season",
            entryNumber: 1,
            airingSeason: "Spring",
            airingYear: 2024,
            imageCount: 5,
          }),
        ],
      }),
    );
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/entries"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='entry-edit-btn']") !== null,
      );
      act(() => {
        (
          container.querySelector(
            "[data-testid='entry-edit-btn']",
          ) as HTMLElement
        ).click();
      });
      await waitFor(
        () =>
          document.body.querySelector("[data-testid='entry-form-dialog']") !==
          null,
      );
      // The submit button should say "Save" for editing.
      const submitBtn = document.body.querySelector(
        "[data-testid='entry-form-submit']",
      );
      expect(submitBtn?.textContent).toContain("Save");

      // Verify the name input is pre-filled.
      const nameInput = document.body.querySelector(
        "[data-testid='entry-form-name']",
      ) as HTMLInputElement;
      expect(nameInput.value).toBe("Season 1");

      // Verify the type select is pre-filled.
      const typeSelect = document.body.querySelector(
        "[data-testid='entry-form-type']",
      ) as HTMLSelectElement;
      expect(typeSelect.value).toBe("season");
    } finally {
      unmount();
    }
  });

  test("submitting the create form calls CreateAnimeEntry", async () => {
    createAnimeEntryMock.mockResolvedValue({
      id: 99,
      name: "New Season",
      entryType: "season",
      entryNumber: 1,
      airingSeason: "",
      airingYear: null,
      imageCount: 0,
      children: [],
    });
    // After creation, the query re-fetches and shows the new entry.
    let callCount = 0;
    getAnimeDetailsMock.mockImplementation(() => {
      callCount += 1;
      if (callCount <= 1) {
        return Promise.resolve(makeDetail({ entries: [] }));
      }
      return Promise.resolve(
        makeDetail({
          entries: [
            makeEntry({ id: 99, name: "New Season", imageCount: 0 }),
          ],
        }),
      );
    });
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/entries"],
    });
    try {
      // Wait for empty state.
      await waitFor(
        () => (container.textContent ?? "").includes("No entries yet"),
      );
      // Open the form from the empty state button.
      act(() => {
        (
          container.querySelector(
            "[data-testid='add-entry-empty-btn']",
          ) as HTMLElement
        ).click();
      });
      await waitFor(
        () =>
          document.body.querySelector("[data-testid='entry-form-dialog']") !==
          null,
      );
      // Fill in a name.
      const nameInput = document.body.querySelector(
        "[data-testid='entry-form-name']",
      ) as HTMLInputElement;
      act(() => {
        // Simulate typing by setting native value + dispatching input event.
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value",
        )!.set!;
        nativeInputValueSetter.call(nameInput, "New Season");
        nameInput.dispatchEvent(new Event("input", { bubbles: true }));
        nameInput.dispatchEvent(new Event("change", { bubbles: true }));
      });
      // Submit.
      act(() => {
        (
          document.body.querySelector(
            "[data-testid='entry-form-submit']",
          ) as HTMLElement
        ).click();
      });
      await waitFor(() => createAnimeEntryMock.mock.calls.length > 0);
      expect(createAnimeEntryMock).toHaveBeenCalledWith(
        42,
        "season",
        null,
        "New Season",
      );
    } finally {
      unmount();
    }
  });

  test("clicking delete button opens the confirm dialog and deleting calls DeleteEntry", async () => {
    deleteEntryMock.mockResolvedValue(undefined);
    let callCount = 0;
    getAnimeDetailsMock.mockImplementation(() => {
      callCount += 1;
      if (callCount <= 1) {
        return Promise.resolve(
          makeDetail({
            entries: [
              makeEntry({ id: 5, name: "Season 1", imageCount: 2 }),
            ],
          }),
        );
      }
      return Promise.resolve(makeDetail({ entries: [] }));
    });
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/entries"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='entry-row']") !== null,
      );
      // Click the delete button.
      act(() => {
        (
          container.querySelector(
            "[data-testid='entry-delete-btn']",
          ) as HTMLElement
        ).click();
      });
      // The confirm dialog should appear (rendered via Portal).
      await waitFor(
        () =>
          document.body.querySelector("[data-testid='confirm-dialog']") !==
          null,
      );
      expect(document.body.textContent).toContain("Delete entry");
      expect(document.body.textContent).toContain("Season 1");
      // Click the confirm button.
      act(() => {
        (
          document.body.querySelector(
            "[data-testid='confirm-dialog-confirm']",
          ) as HTMLElement
        ).click();
      });
      await waitFor(() => deleteEntryMock.mock.calls.length > 0);
      expect(deleteEntryMock).toHaveBeenCalledWith(5);
    } finally {
      unmount();
    }
  });

  test("cancel button in the form dialog closes without calling the API", async () => {
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({
        entries: [makeEntry({ id: 1, name: "Season 1", imageCount: 0 })],
      }),
    );
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/entries"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='add-entry-btn']") !== null,
      );
      // Open the create dialog.
      act(() => {
        (
          container.querySelector(
            "[data-testid='add-entry-btn']",
          ) as HTMLElement
        ).click();
      });
      await waitFor(
        () =>
          document.body.querySelector("[data-testid='entry-form-dialog']") !==
          null,
      );
      // Click Cancel.
      act(() => {
        (
          document.body.querySelector(
            "[data-testid='entry-form-cancel']",
          ) as HTMLElement
        ).click();
      });
      // The dialog should close -- wait a tick then check.
      await waitFor(
        () =>
          document.body.querySelector("[data-testid='entry-form-dialog']") ===
          null,
      );
      expect(createAnimeEntryMock).not.toHaveBeenCalled();
    } finally {
      unmount();
    }
  });

  test("cancel button in the delete confirm dialog closes without calling DeleteEntry", async () => {
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({
        entries: [makeEntry({ id: 5, name: "Season 1", imageCount: 0 })],
      }),
    );
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/entries"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='entry-delete-btn']") !==
          null,
      );
      // Click delete to open confirm dialog.
      act(() => {
        (
          container.querySelector(
            "[data-testid='entry-delete-btn']",
          ) as HTMLElement
        ).click();
      });
      await waitFor(
        () =>
          document.body.querySelector("[data-testid='confirm-dialog']") !==
          null,
      );
      // Click Cancel.
      act(() => {
        (
          document.body.querySelector(
            "[data-testid='confirm-dialog-cancel']",
          ) as HTMLElement
        ).click();
      });
      await waitFor(
        () =>
          document.body.querySelector("[data-testid='confirm-dialog']") ===
          null,
      );
      expect(deleteEntryMock).not.toHaveBeenCalled();
    } finally {
      unmount();
    }
  });

  // -----------------------------------------------------------------------
  // Edit form — rename / update type / update airing
  // -----------------------------------------------------------------------

  test("submitting the edit form with a changed name calls RenameEntry", async () => {
    renameEntryMock.mockResolvedValue(undefined);
    let callCount = 0;
    getAnimeDetailsMock.mockImplementation(() => {
      callCount += 1;
      return Promise.resolve(
        makeDetail({
          entries: [
            makeEntry({
              id: 1,
              name: "Season 1",
              type: "season",
              entryNumber: 1,
              airingSeason: "",
              airingYear: null,
              imageCount: 5,
            }),
          ],
        }),
      );
    });
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/entries"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='entry-edit-btn']") !== null,
      );
      // Open the edit dialog.
      act(() => {
        (
          container.querySelector(
            "[data-testid='entry-edit-btn']",
          ) as HTMLElement
        ).click();
      });
      await waitFor(
        () =>
          document.body.querySelector("[data-testid='entry-form-dialog']") !==
          null,
      );
      // Change the name.
      const nameInput = document.body.querySelector(
        "[data-testid='entry-form-name']",
      ) as HTMLInputElement;
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )!.set!;
      act(() => {
        nativeInputValueSetter.call(nameInput, "Season 1 Remastered");
        nameInput.dispatchEvent(new Event("input", { bubbles: true }));
        nameInput.dispatchEvent(new Event("change", { bubbles: true }));
      });
      // Submit.
      act(() => {
        (
          document.body.querySelector(
            "[data-testid='entry-form-submit']",
          ) as HTMLElement
        ).click();
      });
      await waitFor(() => renameEntryMock.mock.calls.length > 0);
      expect(renameEntryMock).toHaveBeenCalledWith(1, "Season 1 Remastered");
      // Type and airing should NOT have been called since they didn't change.
      expect(updateEntryTypeMock).not.toHaveBeenCalled();
      expect(updateEntryAiringInfoMock).not.toHaveBeenCalled();
    } finally {
      unmount();
    }
  });

  test("submitting the edit form with a changed type calls UpdateEntryType", async () => {
    updateEntryTypeMock.mockResolvedValue(undefined);
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({
        entries: [
          makeEntry({
            id: 1,
            name: "Season 1",
            type: "season",
            entryNumber: 1,
            airingSeason: "",
            airingYear: null,
            imageCount: 5,
          }),
        ],
      }),
    );
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/entries"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='entry-edit-btn']") !== null,
      );
      act(() => {
        (
          container.querySelector(
            "[data-testid='entry-edit-btn']",
          ) as HTMLElement
        ).click();
      });
      await waitFor(
        () =>
          document.body.querySelector("[data-testid='entry-form-dialog']") !==
          null,
      );
      // Change the type to "movie".
      const typeSelect = document.body.querySelector(
        "[data-testid='entry-form-type']",
      ) as HTMLSelectElement;
      act(() => {
        const nativeSelectSetter = Object.getOwnPropertyDescriptor(
          window.HTMLSelectElement.prototype,
          "value",
        )!.set!;
        nativeSelectSetter.call(typeSelect, "movie");
        typeSelect.dispatchEvent(new Event("change", { bubbles: true }));
      });
      // Submit.
      act(() => {
        (
          document.body.querySelector(
            "[data-testid='entry-form-submit']",
          ) as HTMLElement
        ).click();
      });
      await waitFor(() => updateEntryTypeMock.mock.calls.length > 0);
      expect(updateEntryTypeMock).toHaveBeenCalledWith(1, "movie", 1);
      expect(renameEntryMock).not.toHaveBeenCalled();
    } finally {
      unmount();
    }
  });

  test("submitting the edit form with changed airing info calls UpdateEntryAiringInfo", async () => {
    updateEntryAiringInfoMock.mockResolvedValue(undefined);
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({
        entries: [
          makeEntry({
            id: 1,
            name: "Season 1",
            type: "season",
            entryNumber: 1,
            airingSeason: "",
            airingYear: null,
            imageCount: 5,
          }),
        ],
      }),
    );
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/entries"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='entry-edit-btn']") !== null,
      );
      act(() => {
        (
          container.querySelector(
            "[data-testid='entry-edit-btn']",
          ) as HTMLElement
        ).click();
      });
      await waitFor(
        () =>
          document.body.querySelector("[data-testid='entry-form-dialog']") !==
          null,
      );
      // Change the airing season.
      const airingSeasonSelect = document.body.querySelector(
        "[data-testid='entry-form-airing-season']",
      ) as HTMLSelectElement;
      act(() => {
        const nativeSelectSetter = Object.getOwnPropertyDescriptor(
          window.HTMLSelectElement.prototype,
          "value",
        )!.set!;
        nativeSelectSetter.call(airingSeasonSelect, "Spring");
        airingSeasonSelect.dispatchEvent(
          new Event("change", { bubbles: true }),
        );
      });
      // Change the airing year.
      const airingYearInput = document.body.querySelector(
        "[data-testid='entry-form-airing-year']",
      ) as HTMLInputElement;
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )!.set!;
      act(() => {
        nativeInputValueSetter.call(airingYearInput, "2025");
        airingYearInput.dispatchEvent(new Event("input", { bubbles: true }));
        airingYearInput.dispatchEvent(new Event("change", { bubbles: true }));
      });
      // Submit.
      act(() => {
        (
          document.body.querySelector(
            "[data-testid='entry-form-submit']",
          ) as HTMLElement
        ).click();
      });
      await waitFor(() => updateEntryAiringInfoMock.mock.calls.length > 0);
      expect(updateEntryAiringInfoMock).toHaveBeenCalledWith(
        1,
        "Spring",
        2025,
      );
      expect(renameEntryMock).not.toHaveBeenCalled();
      expect(updateEntryTypeMock).not.toHaveBeenCalled();
    } finally {
      unmount();
    }
  });

  test("edit form submitting with changed entry number calls UpdateEntryType", async () => {
    updateEntryTypeMock.mockResolvedValue(undefined);
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({
        entries: [
          makeEntry({
            id: 1,
            name: "Season 1",
            type: "season",
            entryNumber: 1,
            airingSeason: "",
            airingYear: null,
            imageCount: 5,
          }),
        ],
      }),
    );
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/entries"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='entry-edit-btn']") !== null,
      );
      act(() => {
        (
          container.querySelector(
            "[data-testid='entry-edit-btn']",
          ) as HTMLElement
        ).click();
      });
      await waitFor(
        () =>
          document.body.querySelector("[data-testid='entry-form-dialog']") !==
          null,
      );
      // Change the entry number.
      const numberInput = document.body.querySelector(
        "[data-testid='entry-form-number']",
      ) as HTMLInputElement;
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )!.set!;
      act(() => {
        nativeInputValueSetter.call(numberInput, "5");
        numberInput.dispatchEvent(new Event("input", { bubbles: true }));
        numberInput.dispatchEvent(new Event("change", { bubbles: true }));
      });
      // Submit.
      act(() => {
        (
          document.body.querySelector(
            "[data-testid='entry-form-submit']",
          ) as HTMLElement
        ).click();
      });
      await waitFor(() => updateEntryTypeMock.mock.calls.length > 0);
      expect(updateEntryTypeMock).toHaveBeenCalledWith(1, "season", 5);
    } finally {
      unmount();
    }
  });

  // -----------------------------------------------------------------------
  // Error toasts
  // -----------------------------------------------------------------------

  test("edit form shows error toast when an update mutation rejects", async () => {
    const { toast } = require("../../../src/components/ui/toaster");
    toast.error.mockClear();
    renameEntryMock.mockRejectedValue(new Error("rename boom"));
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({
        entries: [
          makeEntry({
            id: 1,
            name: "Season 1",
            type: "season",
            entryNumber: 1,
            airingSeason: "",
            airingYear: null,
            imageCount: 0,
          }),
        ],
      }),
    );
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/entries"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='entry-edit-btn']") !== null,
      );
      act(() => {
        (
          container.querySelector(
            "[data-testid='entry-edit-btn']",
          ) as HTMLElement
        ).click();
      });
      await waitFor(
        () =>
          document.body.querySelector("[data-testid='entry-form-dialog']") !==
          null,
      );
      // Change the name so renameEntry is triggered.
      const nameInput = document.body.querySelector(
        "[data-testid='entry-form-name']",
      ) as HTMLInputElement;
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )!.set!;
      act(() => {
        nativeInputValueSetter.call(nameInput, "New Name");
        nameInput.dispatchEvent(new Event("input", { bubbles: true }));
        nameInput.dispatchEvent(new Event("change", { bubbles: true }));
      });
      // Submit.
      act(() => {
        (
          document.body.querySelector(
            "[data-testid='entry-form-submit']",
          ) as HTMLElement
        ).click();
      });
      await waitFor(() => toast.error.mock.calls.length > 0);
      expect(toast.error).toHaveBeenCalledWith(
        "Failed to update entry",
        "rename boom",
      );
    } finally {
      unmount();
    }
  });

  test("create form shows error toast when CreateAnimeEntry rejects with non-Error", async () => {
    const { toast } = require("../../../src/components/ui/toaster");
    toast.error.mockClear();
    createAnimeEntryMock.mockRejectedValue("string-error");
    getAnimeDetailsMock.mockResolvedValue(makeDetail({ entries: [] }));
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/entries"],
    });
    try {
      await waitFor(
        () => (container.textContent ?? "").includes("No entries yet"),
      );
      act(() => {
        (
          container.querySelector(
            "[data-testid='add-entry-empty-btn']",
          ) as HTMLElement
        ).click();
      });
      await waitFor(
        () =>
          document.body.querySelector("[data-testid='entry-form-dialog']") !==
          null,
      );
      // Submit immediately with the empty name.
      act(() => {
        (
          document.body.querySelector(
            "[data-testid='entry-form-submit']",
          ) as HTMLElement
        ).click();
      });
      await waitFor(() => toast.error.mock.calls.length > 0);
      expect(toast.error).toHaveBeenCalledWith(
        "Failed to create entry",
        "string-error",
      );
    } finally {
      unmount();
    }
  });

  test("delete error toast when DeleteEntry rejects", async () => {
    const { toast } = require("../../../src/components/ui/toaster");
    toast.error.mockClear();
    deleteEntryMock.mockRejectedValue(new Error("delete boom"));
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({
        entries: [
          makeEntry({ id: 5, name: "Season 1", imageCount: 0 }),
        ],
      }),
    );
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/entries"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='entry-delete-btn']") !== null,
      );
      act(() => {
        (
          container.querySelector(
            "[data-testid='entry-delete-btn']",
          ) as HTMLElement
        ).click();
      });
      await waitFor(
        () =>
          document.body.querySelector("[data-testid='confirm-dialog']") !==
          null,
      );
      act(() => {
        (
          document.body.querySelector(
            "[data-testid='confirm-dialog-confirm']",
          ) as HTMLElement
        ).click();
      });
      await waitFor(() => toast.error.mock.calls.length > 0);
      expect(toast.error).toHaveBeenCalledWith(
        "Failed to delete entry",
        "delete boom",
      );
    } finally {
      unmount();
    }
  });

  test("delete error toast coerces non-Error rejection to string", async () => {
    const { toast } = require("../../../src/components/ui/toaster");
    toast.error.mockClear();
    deleteEntryMock.mockRejectedValue("flat-string");
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({
        entries: [
          makeEntry({ id: 5, name: "Season 1", imageCount: 0 }),
        ],
      }),
    );
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/entries"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='entry-delete-btn']") !== null,
      );
      act(() => {
        (
          container.querySelector(
            "[data-testid='entry-delete-btn']",
          ) as HTMLElement
        ).click();
      });
      await waitFor(
        () =>
          document.body.querySelector("[data-testid='confirm-dialog']") !==
          null,
      );
      act(() => {
        (
          document.body.querySelector(
            "[data-testid='confirm-dialog-confirm']",
          ) as HTMLElement
        ).click();
      });
      await waitFor(() => toast.error.mock.calls.length > 0);
      expect(toast.error).toHaveBeenCalledWith(
        "Failed to delete entry",
        "flat-string",
      );
    } finally {
      unmount();
    }
  });
});
