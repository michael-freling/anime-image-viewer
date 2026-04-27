/**
 * Integration tests for the Tag Management page (ui-design §3.5 / wireframe
 * `05-tag-management-desktop.svg`).
 *
 * We mock the TagService binding so the page's `useTags` + mutation wrappers
 * can run deterministically in jsdom. The full Chakra runtime is retained so
 * we exercise the real theme + dialog components; this mirrors the approach
 * used by the Search page tests.
 */

// ---- Mocks (hoisted) -----------------------------------------------------

const getAllTagsMock = jest.fn();
const createTagMock = jest.fn();
const updateTagMock = jest.fn();
const deleteTagMock = jest.fn();
const getTagFileCountMock = jest.fn();

jest.mock("../../../src/lib/api", () => ({
  __esModule: true,
  TagService: {
    GetAll: (...args: unknown[]) => getAllTagsMock(...args),
    CreateTag: (...args: unknown[]) => createTagMock(...args),
    UpdateTag: (...args: unknown[]) => updateTagMock(...args),
    DeleteTag: (...args: unknown[]) => deleteTagMock(...args),
    GetTagFileCount: (...args: unknown[]) => getTagFileCountMock(...args),
  },
}));

// Toaster: we don't care about rendered toasts in these tests, but we assert
// that success/error callbacks fire as side-effects.
const toastSuccessMock = jest.fn();
const toastErrorMock = jest.fn();
jest.mock("../../../src/components/ui/toaster", () => ({
  __esModule: true,
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
    info: jest.fn(),
    warning: jest.fn(),
  },
  Toaster: () => null,
}));

// ---- Imports --------------------------------------------------------------

import { act } from "react-dom/test-utils";

import { TagManagementPage } from "../../../src/pages/tags";
import type { Tag } from "../../../src/types";
import { flushPromises, renderWithClient, waitFor } from "../../test-utils";

// ---- Fixtures -------------------------------------------------------------

const TAGS: Tag[] = [
  { id: 1, name: "Outdoor", category: "scene" },
  { id: 2, name: "Rain", category: "nature" },
  { id: 3, name: "Melancholic", category: "mood" },
  { id: 4, name: "Unsorted", category: "" },
];

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

describe("TagManagementPage", () => {
  beforeEach(() => {
    getAllTagsMock.mockReset();
    createTagMock.mockReset();
    updateTagMock.mockReset();
    deleteTagMock.mockReset();
    getTagFileCountMock.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
  });

  test("renders a sticky page header with 'Tags' title and a '+ New tag' action", async () => {
    getAllTagsMock.mockResolvedValue(TAGS);
    const { container, unmount } = renderWithClient(<TagManagementPage />);
    try {
      const heading = container.querySelector("h1");
      expect(heading?.textContent).toBe("Tags");
      expect(
        container.querySelector("[data-testid='tag-management-new']"),
      ).not.toBeNull();
    } finally {
      unmount();
    }
  });

  test("loading state renders skeletons while useTags is pending", async () => {
    // A promise that never resolves keeps the query in the loading state.
    getAllTagsMock.mockImplementation(
      () => new Promise<Tag[]>(() => undefined),
    );
    const { container, unmount } = renderWithClient(<TagManagementPage />);
    try {
      await flushPromises();
      expect(
        container.querySelector("[data-testid='tag-management-loading']"),
      ).not.toBeNull();
    } finally {
      unmount();
    }
  });

  test("error state renders an alert with retry when useTags rejects", async () => {
    getAllTagsMock.mockRejectedValue(new Error("nope"));
    const { container, unmount } = renderWithClient(<TagManagementPage />);
    try {
      await waitFor(() =>
        (container.textContent ?? "").includes("Couldn't load tags"),
      );
      expect(container.textContent).toContain("nope");
    } finally {
      unmount();
    }
  });

  test("empty state renders a prompt with a '+ New tag' CTA when there are no tags", async () => {
    getAllTagsMock.mockResolvedValue([]);
    const { container, unmount } = renderWithClient(<TagManagementPage />);
    try {
      await waitFor(() =>
        container.querySelector(
          "[data-testid='tag-management-empty-create']",
        ) !== null,
      );
      expect(container.textContent).toContain("No tags yet");
    } finally {
      unmount();
    }
  });

  test("success state groups tags by category and shows every category heading", async () => {
    getAllTagsMock.mockResolvedValue(TAGS);
    const { container, unmount } = renderWithClient(<TagManagementPage />);
    try {
      await waitFor(() =>
        container.querySelector("[data-testid='tag-management-categories']") !==
          null,
      );
      // Each of the 5 tag-only category sections renders a CategorySection
      // header (character is excluded from tag management).
      const headers = container.querySelectorAll(
        "[data-testid='category-section-header']",
      );
      expect(headers.length).toBe(5);
      // At least one row renders for every seeded tag.
      expect(container.textContent).toContain("Outdoor");
      expect(container.textContent).toContain("Rain");
      expect(container.textContent).toContain("Melancholic");
      expect(container.textContent).toContain("Unsorted");
    } finally {
      unmount();
    }
  });

  test("searching filters visible tags client-side (case-insensitive)", async () => {
    getAllTagsMock.mockResolvedValue(TAGS);
    const { container, unmount } = renderWithClient(<TagManagementPage />);
    try {
      await waitFor(() =>
        container.querySelector("[data-testid='tag-management-categories']") !==
          null,
      );
      const searchInput = container.querySelector<HTMLInputElement>(
        "input[role='searchbox']",
      )!;
      setInputValue(searchInput, "RAIN");
      await flushPromises();
      // Rain is visible; Outdoor/Melancholic should drop out.
      expect(container.textContent).toContain("Rain");
      expect(container.textContent).not.toContain("Outdoor");
      expect(container.textContent).not.toContain("Melancholic");
    } finally {
      unmount();
    }
  });

  test("search with no matches renders the 'No matches' empty state", async () => {
    getAllTagsMock.mockResolvedValue(TAGS);
    const { container, unmount } = renderWithClient(<TagManagementPage />);
    try {
      await waitFor(() =>
        container.querySelector("[data-testid='tag-management-categories']") !==
          null,
      );
      const searchInput = container.querySelector<HTMLInputElement>(
        "input[role='searchbox']",
      )!;
      setInputValue(searchInput, "zzz-no-match");
      await flushPromises();
      expect(container.textContent).toContain("No matches");
    } finally {
      unmount();
    }
  });

  test("'+ New tag' button opens the create dialog", async () => {
    getAllTagsMock.mockResolvedValue(TAGS);
    const { container, unmount } = renderWithClient(<TagManagementPage />);
    try {
      await waitFor(() =>
        container.querySelector("[data-testid='tag-management-new']") !== null,
      );
      const btn = container.querySelector<HTMLButtonElement>(
        "[data-testid='tag-management-new']",
      )!;
      act(() => {
        btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await waitFor(
        () => document.querySelector("[data-testid='tag-dialog']") !== null,
      );
      // Page-level dialog uses Chakra's Portal so the content mounts under body.
      const dialog = document.querySelector("[data-testid='tag-dialog']");
      expect(dialog?.textContent).toContain("New tag");
    } finally {
      unmount();
    }
  });

  test("submitting the create dialog calls TagService.CreateTag and refreshes the list", async () => {
    // First call: initial list. Second call: after invalidation we want an
    // updated shape to prove the refetch actually fired.
    getAllTagsMock
      .mockResolvedValueOnce(TAGS)
      .mockResolvedValueOnce([
        ...TAGS,
        { id: 99, name: "Sunset", category: "scene" },
      ]);
    createTagMock.mockResolvedValue({ id: 99, name: "Sunset", category: "scene" });

    const { container, unmount } = renderWithClient(<TagManagementPage />);
    try {
      await waitFor(() =>
        container.querySelector("[data-testid='tag-management-new']") !== null,
      );
      const btn = container.querySelector<HTMLButtonElement>(
        "[data-testid='tag-management-new']",
      )!;
      act(() => {
        btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await waitFor(
        () => document.querySelector("[data-testid='tag-dialog']") !== null,
      );
      const nameInput = document.querySelector<HTMLInputElement>(
        "[data-testid='tag-form-name']",
      )!;
      setInputValue(nameInput, "Sunset");
      const submit = document.querySelector<HTMLButtonElement>(
        "[data-testid='tag-form-submit']",
      )!;
      await act(async () => {
        submit.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });

      expect(createTagMock).toHaveBeenCalledTimes(1);
      expect(createTagMock).toHaveBeenCalledWith({
        name: "Sunset",
        category: "uncategorized",
        parentId: undefined,
      });
      expect(toastSuccessMock).toHaveBeenCalled();

      // The invalidation should have triggered a second GetAll.
      await waitFor(() => getAllTagsMock.mock.calls.length >= 2);
    } finally {
      unmount();
    }
  });

  test("a create error surfaces an inline error + toast and leaves the dialog open", async () => {
    getAllTagsMock.mockResolvedValue(TAGS);
    createTagMock.mockRejectedValue(new Error("name taken"));

    const { container, unmount } = renderWithClient(<TagManagementPage />);
    try {
      await waitFor(() =>
        container.querySelector("[data-testid='tag-management-new']") !== null,
      );
      const btn = container.querySelector<HTMLButtonElement>(
        "[data-testid='tag-management-new']",
      )!;
      act(() => {
        btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await waitFor(
        () => document.querySelector("[data-testid='tag-dialog']") !== null,
      );
      const nameInput = document.querySelector<HTMLInputElement>(
        "[data-testid='tag-form-name']",
      )!;
      setInputValue(nameInput, "Outdoor");
      const submit = document.querySelector<HTMLButtonElement>(
        "[data-testid='tag-form-submit']",
      )!;
      await act(async () => {
        submit.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });

      await waitFor(() =>
        document.querySelector("[data-testid='tag-form-error']") !== null,
      );
      expect(
        document.querySelector("[data-testid='tag-form-error']")?.textContent,
      ).toContain("name taken");
      expect(toastErrorMock).toHaveBeenCalled();
      expect(document.querySelector("[data-testid='tag-dialog']")).not.toBeNull();
    } finally {
      unmount();
    }
  });

  test("clicking the edit pencil on a tag opens the edit dialog pre-filled", async () => {
    getAllTagsMock.mockResolvedValue(TAGS);
    const { container, unmount } = renderWithClient(<TagManagementPage />);
    try {
      await waitFor(() =>
        container.querySelector("[data-testid='tag-management-categories']") !==
          null,
      );
      // Find the edit button for 'Outdoor' (scene bucket).
      const outdoor = Array.from(
        container.querySelectorAll<HTMLElement>("[data-testid='tag-row']"),
      ).find((row) => row.textContent?.includes("Outdoor"))!;
      const edit = outdoor.querySelector<HTMLButtonElement>(
        "[data-testid='tag-row-edit']",
      )!;
      act(() => {
        edit.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await waitFor(
        () => document.querySelector("[data-testid='tag-dialog']") !== null,
      );
      const nameInput = document.querySelector<HTMLInputElement>(
        "[data-testid='tag-form-name']",
      )!;
      expect(nameInput.value).toBe("Outdoor");
      const category = document.querySelector<HTMLSelectElement>(
        "[data-testid='tag-form-category']",
      )!;
      expect(category.value).toBe("scene");
      expect(
        document.querySelector("[data-testid='tag-dialog']")?.textContent,
      ).toContain("Edit tag");
    } finally {
      unmount();
    }
  });

  test("clicking the delete X on a tag opens the confirm dialog with usage count", async () => {
    getAllTagsMock.mockResolvedValue(TAGS);
    getTagFileCountMock.mockResolvedValue(3);

    const { container, unmount } = renderWithClient(<TagManagementPage />);
    try {
      await waitFor(() =>
        container.querySelector("[data-testid='tag-management-categories']") !==
          null,
      );
      const rain = Array.from(
        container.querySelectorAll<HTMLElement>("[data-testid='tag-row']"),
      ).find((row) => row.textContent?.includes("Rain"))!;
      const del = rain.querySelector<HTMLButtonElement>(
        "[data-testid='tag-row-delete']",
      )!;
      act(() => {
        del.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await waitFor(
        () => document.querySelector("[data-testid='confirm-dialog']") !== null,
      );
      // Wait for the usage-count lookup to finish and the label to update.
      await waitFor(
        () =>
          (document.querySelector("[data-testid='confirm-dialog']")?.textContent ?? "")
            .includes("3 images"),
      );
      expect(
        document.querySelector("[data-testid='confirm-dialog']")?.textContent,
      ).toContain("Rain");
    } finally {
      unmount();
    }
  });

  test("confirming delete calls TagService.DeleteTag and refreshes the list", async () => {
    // Prime the query + the second fetch after invalidation.
    getAllTagsMock
      .mockResolvedValueOnce(TAGS)
      .mockResolvedValueOnce(TAGS.filter((t) => t.id !== 2));
    getTagFileCountMock.mockResolvedValue(0);
    deleteTagMock.mockResolvedValue(undefined);

    const { container, unmount } = renderWithClient(<TagManagementPage />);
    try {
      await waitFor(() =>
        container.querySelector("[data-testid='tag-management-categories']") !==
          null,
      );
      const rain = Array.from(
        container.querySelectorAll<HTMLElement>("[data-testid='tag-row']"),
      ).find((row) => row.textContent?.includes("Rain"))!;
      const del = rain.querySelector<HTMLButtonElement>(
        "[data-testid='tag-row-delete']",
      )!;
      act(() => {
        del.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await waitFor(
        () => document.querySelector("[data-testid='confirm-dialog']") !== null,
      );
      const confirmBtn = document.querySelector<HTMLButtonElement>(
        "[data-testid='confirm-dialog-confirm']",
      )!;
      await act(async () => {
        confirmBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });

      expect(deleteTagMock).toHaveBeenCalledWith(2);
      expect(toastSuccessMock).toHaveBeenCalled();
      await waitFor(() => getAllTagsMock.mock.calls.length >= 2);
    } finally {
      unmount();
    }
  });

  test("subtitle reports the tag + category count once data loads", async () => {
    getAllTagsMock.mockResolvedValue(TAGS);
    const { container, unmount } = renderWithClient(<TagManagementPage />);
    try {
      await waitFor(() =>
        (container.textContent ?? "").includes("across 5 categories"),
      );
      expect(container.textContent).toContain("4 tags");
    } finally {
      unmount();
    }
  });

  test("submitting the dialog with an empty name surfaces a validation error", async () => {
    getAllTagsMock.mockResolvedValue(TAGS);
    const { container, unmount } = renderWithClient(<TagManagementPage />);
    try {
      await waitFor(() =>
        container.querySelector("[data-testid='tag-management-new']") !== null,
      );
      const btn = container.querySelector<HTMLButtonElement>(
        "[data-testid='tag-management-new']",
      )!;
      act(() => {
        btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await waitFor(
        () => document.querySelector("[data-testid='tag-dialog']") !== null,
      );
      // The submit button is disabled while the name is empty (UI guard).
      // The Enter-key handler bypasses the disabled button and routes
      // straight to `onSubmit`, which exercises the validation gate inside
      // `submitDialog` (sets the inline error and bails before the
      // mutation fires).
      const nameInput = document.querySelector<HTMLInputElement>(
        "[data-testid='tag-form-name']",
      )!;
      act(() => {
        nameInput.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Enter",
            bubbles: true,
            cancelable: true,
          }),
        );
      });
      await waitFor(
        () =>
          (document.querySelector("[data-testid='tag-form-error']")
            ?.textContent ?? "").includes("required"),
      );
      // The mutation never fires.
      expect(createTagMock).not.toHaveBeenCalled();
    } finally {
      unmount();
    }
  });

  test("editing a tag and submitting calls TagService.UpdateTag and refreshes", async () => {
    getAllTagsMock
      .mockResolvedValueOnce(TAGS)
      .mockResolvedValueOnce([
        { id: 1, name: "Outdoor renamed", category: "scene" },
        ...TAGS.filter((t) => t.id !== 1),
      ]);
    updateTagMock.mockResolvedValue({
      id: 1,
      name: "Outdoor renamed",
      category: "scene",
    });
    const { container, unmount } = renderWithClient(<TagManagementPage />);
    try {
      await waitFor(() =>
        container.querySelector("[data-testid='tag-management-categories']") !==
          null,
      );
      const outdoor = Array.from(
        container.querySelectorAll<HTMLElement>("[data-testid='tag-row']"),
      ).find((row) => row.textContent?.includes("Outdoor"))!;
      const edit = outdoor.querySelector<HTMLButtonElement>(
        "[data-testid='tag-row-edit']",
      )!;
      act(() => {
        edit.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await waitFor(
        () => document.querySelector("[data-testid='tag-dialog']") !== null,
      );
      const nameInput = document.querySelector<HTMLInputElement>(
        "[data-testid='tag-form-name']",
      )!;
      setInputValue(nameInput, "Outdoor renamed");
      const submit = document.querySelector<HTMLButtonElement>(
        "[data-testid='tag-form-submit']",
      )!;
      await act(async () => {
        submit.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });
      expect(updateTagMock).toHaveBeenCalledWith(1, {
        name: "Outdoor renamed",
        category: "scene",
        parentId: undefined,
      });
      expect(toastSuccessMock).toHaveBeenCalled();
      await waitFor(() => getAllTagsMock.mock.calls.length >= 2);
    } finally {
      unmount();
    }
  });

  test("delete failure surfaces an error toast and keeps the confirm dialog open", async () => {
    getAllTagsMock.mockResolvedValue(TAGS);
    getTagFileCountMock.mockResolvedValue(0);
    deleteTagMock.mockRejectedValue(new Error("delete-failed"));
    const { container, unmount } = renderWithClient(<TagManagementPage />);
    try {
      await waitFor(() =>
        container.querySelector("[data-testid='tag-management-categories']") !==
          null,
      );
      const rain = Array.from(
        container.querySelectorAll<HTMLElement>("[data-testid='tag-row']"),
      ).find((row) => row.textContent?.includes("Rain"))!;
      const del = rain.querySelector<HTMLButtonElement>(
        "[data-testid='tag-row-delete']",
      )!;
      act(() => {
        del.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await waitFor(
        () => document.querySelector("[data-testid='confirm-dialog']") !== null,
      );
      const confirmBtn = document.querySelector<HTMLButtonElement>(
        "[data-testid='confirm-dialog-confirm']",
      )!;
      await act(async () => {
        confirmBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(toastErrorMock).toHaveBeenCalledWith(
        "Could not delete tag",
        "delete-failed",
      );
      // Dialog stays mounted.
      expect(document.querySelector("[data-testid='confirm-dialog']")).not.toBeNull();
    } finally {
      unmount();
    }
  });

  test("Retry on the error state refetches the tag list", async () => {
    let calls = 0;
    getAllTagsMock.mockImplementation(() => {
      calls += 1;
      if (calls === 1) {
        return Promise.reject(new Error("first-fail"));
      }
      return Promise.resolve(TAGS);
    });
    const { container, unmount } = renderWithClient(<TagManagementPage />);
    try {
      await waitFor(() =>
        (container.textContent ?? "").includes("Couldn't load tags"),
      );
      const retry = Array.from(
        container.querySelectorAll("button"),
      ).find((b) => (b.textContent ?? "").trim() === "Retry") as
        | HTMLButtonElement
        | undefined;
      expect(retry).toBeDefined();
      act(() => {
        retry!.click();
      });
      await waitFor(() =>
        container.querySelector("[data-testid='tag-management-categories']") !==
          null,
      );
    } finally {
      unmount();
    }
  });

  test("empty-state '+ New tag' CTA opens the create dialog", async () => {
    getAllTagsMock.mockResolvedValue([]);
    const { container, unmount } = renderWithClient(<TagManagementPage />);
    try {
      await waitFor(
        () =>
          container.querySelector(
            "[data-testid='tag-management-empty-create']",
          ) !== null,
      );
      const cta = container.querySelector<HTMLButtonElement>(
        "[data-testid='tag-management-empty-create']",
      )!;
      act(() => {
        cta.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await waitFor(
        () => document.querySelector("[data-testid='tag-dialog']") !== null,
      );
      // Dialog opens in create mode.
      const dialog = document.querySelector("[data-testid='tag-dialog']");
      expect(dialog?.textContent).toContain("New tag");
    } finally {
      unmount();
    }
  });

  test("delete confirm cancels mid-fetch — fileCount lookup is ignored", async () => {
    getAllTagsMock.mockResolvedValue(TAGS);
    let resolveCount!: (n: number) => void;
    const countPromise = new Promise<number>((resolve) => {
      resolveCount = resolve;
    });
    getTagFileCountMock.mockReturnValue(countPromise);
    const { container, unmount } = renderWithClient(<TagManagementPage />);
    try {
      await waitFor(() =>
        container.querySelector("[data-testid='tag-management-categories']") !==
          null,
      );
      const rain = Array.from(
        container.querySelectorAll<HTMLElement>("[data-testid='tag-row']"),
      ).find((row) => row.textContent?.includes("Rain"))!;
      const del = rain.querySelector<HTMLButtonElement>(
        "[data-testid='tag-row-delete']",
      )!;
      act(() => {
        del.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await waitFor(
        () => document.querySelector("[data-testid='confirm-dialog']") !== null,
      );
      // Cancel the dialog BEFORE the file-count promise resolves.
      const cancel = document.querySelector<HTMLButtonElement>(
        "[data-testid='confirm-dialog-cancel']",
      )!;
      act(() => {
        cancel.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await waitFor(
        () =>
          document.querySelector("[data-testid='confirm-dialog']") === null,
      );
      // Now resolve — the late count must NOT reopen the dialog.
      await act(async () => {
        resolveCount(7);
        await Promise.resolve();
      });
      expect(document.querySelector("[data-testid='confirm-dialog']")).toBeNull();
    } finally {
      unmount();
    }
  });
});
