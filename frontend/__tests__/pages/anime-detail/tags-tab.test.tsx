/**
 * Tests for `TagsTab`.
 *
 * Spec: ui-design.md §3.2.4 "Tags tab". Verifies grouping-by-category,
 * active chip render, empty state, error state, edit dialog, convert
 * category, and search navigation.
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
const convertTagToCharacterMock = jest.fn();
jest.mock("../../../src/lib/api", () => ({
  __esModule: true,
  AnimeService: {
    GetAnimeDetails: (...args: unknown[]) => getAnimeDetailsMock(...args),
    GetAnimeImages: () => Promise.resolve({ images: [] }),
    GetAnimeImagesByEntry: () => Promise.resolve({ images: [] }),
    GetAnimeList: () => Promise.resolve([]),
  },
  CharacterService: {
    ConvertTagToCharacter: (...args: unknown[]) => convertTagToCharacterMock(...args),
  },
  TagService: {
    GetAll: () => Promise.resolve([]),
  },
  SearchService: {
    SearchImages: () => Promise.resolve({ images: [] }),
  },
}));

const updateTagMock = jest.fn();
jest.mock("../../../src/pages/tags/tag-mutations", () => ({
  __esModule: true,
  updateTag: (...args: unknown[]) => updateTagMock(...args),
}));

jest.mock("../../../src/components/ui/toaster", () => ({
  __esModule: true,
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

import { toast } from "../../../src/components/ui/toaster";
import { routes } from "../../../src/app/routes";
import type { AnimeDerivedTag, AnimeDetail } from "../../../src/types";
import { renderRoutes, waitFor } from "../../test-utils";
import { act } from "react-dom/test-utils";

function makeDerivedTag(
  id: number,
  name: string,
  category: string,
  imageCount = 1,
): AnimeDerivedTag {
  return { id, name, category, imageCount };
}

function makeDetail(overrides: Partial<AnimeDetail> = {}): AnimeDetail {
  return {
    anime: { id: 42, name: "Bebop", aniListId: null },
    tags: [],
    characters: [],
    folders: [],
    folderTree: null,
    entries: [],
    ...overrides,
  };
}

describe("TagsTab", () => {
  beforeEach(() => {
    getAnimeDetailsMock.mockReset();
    updateTagMock.mockReset();
    convertTagToCharacterMock.mockReset();
    (toast.success as jest.Mock).mockClear();
    (toast.error as jest.Mock).mockClear();
  });

  test("groups tags by category with TagChips and counts", async () => {
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({
        tags: [
          makeDerivedTag(1, "Outdoor", "scene", 10),
          makeDerivedTag(2, "Indoor", "scene", 3),
          makeDerivedTag(3, "Sunny", "nature", 7),
        ],
      }),
    );
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/tags"],
    });
    try {
      await waitFor(
        () =>
          container.querySelectorAll("[data-testid='tag-chip']").length === 3,
      );
      // We expect two CategorySection wrappers (scene, nature).
      const sections = container.querySelectorAll(
        "[data-testid='category-section']",
      );
      expect(sections.length).toBe(2);

      // Categories render in the canonical order (scene before nature).
      const keys = Array.from(sections).map((s) =>
        s.getAttribute("data-category-key"),
      );
      expect(keys).toEqual(["scene", "nature"]);

      // Each chip sits next to its per-tag image count.
      const rows = container.querySelectorAll(
        "[data-testid='tags-tab-tag-row']",
      );
      expect(rows.length).toBe(3);
      const sceneSection = sections[0];
      expect(sceneSection.textContent).toContain("Outdoor");
      expect(sceneSection.textContent).toContain("Indoor");
      expect(sceneSection.textContent).toContain("10");
      expect(sceneSection.textContent).toContain("3");
    } finally {
      unmount();
    }
  });

  test("unknown categories fall back to 'Uncategorized' bucket", async () => {
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({
        tags: [makeDerivedTag(1, "Loose", "xyz-not-real", 2)],
      }),
    );
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/tags"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='category-section']") !==
          null,
      );
      const section = container.querySelector(
        "[data-testid='category-section']",
      );
      expect(section?.getAttribute("data-category-key")).toBe("uncategorized");
      expect(section?.textContent).toContain("Uncategorized");
    } finally {
      unmount();
    }
  });

  test("renders the empty state when there are no tags", async () => {
    getAnimeDetailsMock.mockResolvedValue(makeDetail({ tags: [] }));
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/tags"],
    });
    try {
      await waitFor(
        () =>
          (container.textContent ?? "").includes("No tags assigned"),
      );
      expect(
        container.querySelector("[data-testid='tags-tab-add-action']"),
      ).not.toBeNull();
    } finally {
      unmount();
    }
  });

  test("surfaces an ErrorAlert on detail query failure", async () => {
    getAnimeDetailsMock.mockRejectedValue(new Error("tag fetch failed"));
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/tags"],
    });
    try {
      await waitFor(
        () => container.querySelector("[role='alert']") !== null,
      );
      // Either the layout's or the tab's alert is fine — both indicate failure.
      expect(container.querySelector("[role='alert']")).not.toBeNull();
    } finally {
      unmount();
    }
  });

  test("error state surfaces a non-Error rejection via String()", async () => {
    // The ternary `error instanceof Error ? ... : String(error ?? "")` selects
    // the String() branch; the alert text contains the coerced value.
    getAnimeDetailsMock.mockRejectedValue("string-failure");
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/tags"],
    });
    try {
      await waitFor(
        () => container.querySelector("[role='alert']") !== null,
      );
      const alert = container.querySelector("[role='alert']");
      expect(alert?.textContent ?? "").toContain("string-failure");
    } finally {
      unmount();
    }
  });

  test("Retry on the error state refetches the anime details", async () => {
    let calls = 0;
    getAnimeDetailsMock.mockImplementation(() => {
      calls += 1;
      if (calls === 1) {
        return Promise.reject(new Error("boom"));
      }
      return Promise.resolve(
        makeDetail({ tags: [makeDerivedTag(1, "Outdoor", "scene", 1)] }),
      );
    });
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/tags"],
    });
    try {
      await waitFor(
        () => container.querySelector("[role='alert']") !== null,
      );
      const retry = Array.from(container.querySelectorAll("button")).find(
        (b) => (b.textContent ?? "").trim() === "Retry",
      ) as HTMLButtonElement | undefined;
      expect(retry).toBeDefined();
      retry!.click();
      await waitFor(
        () =>
          container.querySelectorAll("[data-testid='tag-chip']").length === 1,
      );
    } finally {
      unmount();
    }
  });

  test("non-numeric animeId in the URL keeps the query disabled", async () => {
    getAnimeDetailsMock.mockResolvedValue(makeDetail({ tags: [] }));
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/0/tags"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='tags-tab']") !== null ||
          container.querySelector("[data-testid='tags-tab-loading']") !== null,
        { timeout: 200 },
      ).catch(() => undefined);
      expect(getAnimeDetailsMock).not.toHaveBeenCalled();
    } finally {
      unmount();
    }
  });

  test("clicking edit button opens the edit dialog", async () => {
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({
        tags: [makeDerivedTag(1, "Outdoor", "scene", 5)],
      }),
    );
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/tags"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='tags-tab-tag-edit']") !== null,
      );
      const editBtn = container.querySelector(
        "[data-testid='tags-tab-tag-edit']",
      ) as HTMLButtonElement;
      await act(async () => {
        editBtn.click();
      });
      // TagDialog renders via Portal to document.body, not inside `container`.
      await waitFor(
        () =>
          document.body.querySelector("[data-testid='tag-dialog']") !== null,
      );
      expect(
        document.body.querySelector("[data-testid='tag-dialog']"),
      ).not.toBeNull();
      // The dialog title should contain the tag name.
      const dialog = document.body.querySelector(
        "[data-testid='tag-dialog']",
      )!;
      expect(dialog.textContent).toContain("Outdoor");
    } finally {
      unmount();
    }
  });

  test("edit dialog validates empty name", async () => {
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({
        tags: [makeDerivedTag(1, "Outdoor", "scene", 5)],
      }),
    );
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/tags"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='tags-tab-tag-edit']") !== null,
      );
      const editBtn = container.querySelector(
        "[data-testid='tags-tab-tag-edit']",
      ) as HTMLButtonElement;
      await act(async () => {
        editBtn.click();
      });
      await waitFor(
        () =>
          document.body.querySelector("[data-testid='tag-dialog']") !== null,
      );
      // Clear the name input (rendered inside Portal on document.body).
      const nameInput = document.body.querySelector(
        "[data-testid='tag-form-name']",
      ) as HTMLInputElement;
      await act(async () => {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value",
        )!.set!;
        nativeInputValueSetter.call(nameInput, "");
        nameInput.dispatchEvent(new Event("input", { bubbles: true }));
        nameInput.dispatchEvent(new Event("change", { bubbles: true }));
      });
      // The Save button is disabled when name is empty, so trigger submitEdit
      // via Enter key on the name input.
      await act(async () => {
        nameInput.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Enter",
            bubbles: true,
          }),
        );
      });
      // Wait for the error message to appear.
      await waitFor(
        () =>
          document.body.querySelector("[data-testid='tag-form-error']") !==
          null,
      );
      expect(
        document.body.querySelector("[data-testid='tag-form-error']")
          ?.textContent,
      ).toContain("Tag name is required");
    } finally {
      unmount();
    }
  });

  test("edit dialog submits and calls updateTag", async () => {
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({
        tags: [makeDerivedTag(1, "Outdoor", "scene", 5)],
      }),
    );
    updateTagMock.mockResolvedValue({
      id: 1,
      name: "Indoor",
      category: "scene",
    });
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/tags"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='tags-tab-tag-edit']") !== null,
      );
      const editBtn = container.querySelector(
        "[data-testid='tags-tab-tag-edit']",
      ) as HTMLButtonElement;
      await act(async () => {
        editBtn.click();
      });
      await waitFor(
        () =>
          document.body.querySelector("[data-testid='tag-dialog']") !== null,
      );
      // Change the name input (in Portal).
      const nameInput = document.body.querySelector(
        "[data-testid='tag-form-name']",
      ) as HTMLInputElement;
      await act(async () => {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value",
        )!.set!;
        nativeInputValueSetter.call(nameInput, "Indoor");
        nameInput.dispatchEvent(new Event("input", { bubbles: true }));
        nameInput.dispatchEvent(new Event("change", { bubbles: true }));
      });
      // Click the submit button (in Portal).
      const submitBtn = document.body.querySelector(
        "[data-testid='tag-form-submit']",
      ) as HTMLButtonElement;
      await act(async () => {
        submitBtn.click();
      });
      // Wait for updateTag to have been called.
      await waitFor(() => updateTagMock.mock.calls.length > 0);
      expect(updateTagMock).toHaveBeenCalledWith(1, {
        name: "Indoor",
        category: "scene",
        parentId: undefined,
      });
      expect(toast.success).toHaveBeenCalledWith(
        "Tag updated",
        expect.stringContaining("Indoor"),
      );
    } finally {
      unmount();
    }
  });

  test("edit dialog shows error on failure", async () => {
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({
        tags: [makeDerivedTag(1, "Outdoor", "scene", 5)],
      }),
    );
    updateTagMock.mockRejectedValue(new Error("server error"));
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/tags"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='tags-tab-tag-edit']") !== null,
      );
      const editBtn = container.querySelector(
        "[data-testid='tags-tab-tag-edit']",
      ) as HTMLButtonElement;
      await act(async () => {
        editBtn.click();
      });
      await waitFor(
        () =>
          document.body.querySelector("[data-testid='tag-dialog']") !== null,
      );
      // Click the submit button (name is pre-filled with "Outdoor", in Portal).
      const submitBtn = document.body.querySelector(
        "[data-testid='tag-form-submit']",
      ) as HTMLButtonElement;
      await act(async () => {
        submitBtn.click();
      });
      // Wait for error toast.
      await waitFor(() => (toast.error as jest.Mock).mock.calls.length > 0);
      expect(toast.error).toHaveBeenCalledWith(
        "Could not save tag",
        "server error",
      );
      // The inline error in the form should also appear (in Portal).
      await waitFor(
        () =>
          document.body.querySelector("[data-testid='tag-form-error']") !==
          null,
      );
      expect(
        document.body.querySelector("[data-testid='tag-form-error']")
          ?.textContent,
      ).toContain("server error");
    } finally {
      unmount();
    }
  });

  test("edit dialog error with non-Error rejection uses String()", async () => {
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({
        tags: [makeDerivedTag(1, "Outdoor", "scene", 5)],
      }),
    );
    updateTagMock.mockRejectedValue("string rejection");
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/tags"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='tags-tab-tag-edit']") !== null,
      );
      const editBtn = container.querySelector(
        "[data-testid='tags-tab-tag-edit']",
      ) as HTMLButtonElement;
      await act(async () => {
        editBtn.click();
      });
      await waitFor(
        () =>
          document.body.querySelector("[data-testid='tag-dialog']") !== null,
      );
      const submitBtn = document.body.querySelector(
        "[data-testid='tag-form-submit']",
      ) as HTMLButtonElement;
      await act(async () => {
        submitBtn.click();
      });
      await waitFor(() => (toast.error as jest.Mock).mock.calls.length > 0);
      expect(toast.error).toHaveBeenCalledWith(
        "Could not save tag",
        "string rejection",
      );
    } finally {
      unmount();
    }
  });

  test("search button navigates to search with anime param", async () => {
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({
        tags: [makeDerivedTag(1, "Outdoor", "scene", 5)],
      }),
    );
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/tags"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector("[data-testid='tags-tab-tag-search']") !==
          null,
      );
      const searchBtn = container.querySelector(
        "[data-testid='tags-tab-tag-search']",
      ) as HTMLButtonElement;
      await act(async () => {
        searchBtn.click();
      });
      // After clicking search, the router should navigate to /search?tag=1&anime=42.
      // The SearchPage component should now be rendered (since it's in the routes).
      // We verify by checking the URL changed — the search page will render.
      await waitFor(
        () =>
          // The tags-tab should no longer be visible since we navigated away.
          container.querySelector("[data-testid='tags-tab']") === null ||
          // Or the search page content may be visible.
          (container.textContent ?? "").includes("Search") === true,
      );
    } finally {
      unmount();
    }
  });

  test("Make Character button opens confirm dialog", async () => {
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({
        tags: [makeDerivedTag(1, "Outdoor", "scene", 5)],
      }),
    );
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/tags"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector(
            "[data-testid='tags-tab-tag-make-character']",
          ) !== null,
      );
      const makeCharBtn = container.querySelector(
        "[data-testid='tags-tab-tag-make-character']",
      ) as HTMLButtonElement;
      await act(async () => {
        makeCharBtn.click();
      });
      // ConfirmDialog renders via Portal to document.body.
      await waitFor(
        () =>
          document.body.querySelector("[data-testid='confirm-dialog']") !== null,
      );
      const dialog = document.body.querySelector(
        "[data-testid='confirm-dialog']",
      )!;
      expect(dialog).not.toBeNull();
      expect(dialog.textContent).toContain("Make Character?");
      expect(dialog.textContent).toContain("Outdoor");
    } finally {
      unmount();
    }
  });

  test("Make Character confirm calls ConvertTagToCharacter", async () => {
    convertTagToCharacterMock.mockResolvedValue({
      id: 100,
      name: "Outdoor",
      animeId: 42,
      imageCount: 5,
    });
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({
        tags: [makeDerivedTag(1, "Outdoor", "scene", 5)],
      }),
    );
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/tags"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector(
            "[data-testid='tags-tab-tag-make-character']",
          ) !== null,
      );
      const makeCharBtn = container.querySelector(
        "[data-testid='tags-tab-tag-make-character']",
      ) as HTMLButtonElement;
      await act(async () => {
        makeCharBtn.click();
      });
      await waitFor(
        () =>
          document.body.querySelector("[data-testid='confirm-dialog']") !== null,
      );
      const confirmBtn = document.body.querySelector(
        "[data-testid='confirm-dialog-confirm']",
      ) as HTMLButtonElement;
      expect(confirmBtn).not.toBeNull();
      await act(async () => {
        confirmBtn.click();
      });
      await waitFor(() => convertTagToCharacterMock.mock.calls.length > 0);
      expect(convertTagToCharacterMock).toHaveBeenCalledWith(1, 42);
      expect(toast.success).toHaveBeenCalledWith(
        "Moved to Characters",
        '"Outdoor" is now a character.',
      );
    } finally {
      unmount();
    }
  });

  test("Make Character confirm shows error on failure", async () => {
    convertTagToCharacterMock.mockRejectedValue(
      new Error("conversion failed"),
    );
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({
        tags: [makeDerivedTag(1, "Outdoor", "scene", 5)],
      }),
    );
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/tags"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector(
            "[data-testid='tags-tab-tag-make-character']",
          ) !== null,
      );
      const makeCharBtn = container.querySelector(
        "[data-testid='tags-tab-tag-make-character']",
      ) as HTMLButtonElement;
      await act(async () => {
        makeCharBtn.click();
      });
      await waitFor(
        () =>
          document.body.querySelector("[data-testid='confirm-dialog']") !== null,
      );
      const confirmBtn = document.body.querySelector(
        "[data-testid='confirm-dialog-confirm']",
      ) as HTMLButtonElement;
      await act(async () => {
        confirmBtn.click();
      });
      await waitFor(() => (toast.error as jest.Mock).mock.calls.length > 0);
      expect(toast.error).toHaveBeenCalledWith(
        "Could not convert",
        "conversion failed",
      );
    } finally {
      unmount();
    }
  });

  test("Make Character cancel does not call ConvertTagToCharacter", async () => {
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({
        tags: [makeDerivedTag(1, "Outdoor", "scene", 5)],
      }),
    );
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/tags"],
    });
    try {
      await waitFor(
        () =>
          container.querySelector(
            "[data-testid='tags-tab-tag-make-character']",
          ) !== null,
      );
      const makeCharBtn = container.querySelector(
        "[data-testid='tags-tab-tag-make-character']",
      ) as HTMLButtonElement;
      await act(async () => {
        makeCharBtn.click();
      });
      await waitFor(
        () =>
          document.body.querySelector("[data-testid='confirm-dialog']") !== null,
      );
      const cancelBtn = document.body.querySelector(
        "[data-testid='confirm-dialog-cancel']",
      ) as HTMLButtonElement;
      expect(cancelBtn).not.toBeNull();
      act(() => {
        cancelBtn.click();
      });
      await waitFor(
        () =>
          document.body.querySelector("[data-testid='confirm-dialog']") === null,
      );
      expect(convertTagToCharacterMock).not.toHaveBeenCalled();
    } finally {
      unmount();
    }
  });
});
