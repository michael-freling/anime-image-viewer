/**
 * Tests for `CharactersTab`.
 *
 * Characters are tags with `category: "character"`, fetched via
 * `useAnimeDetail`. Tests mock `AnimeService.GetAnimeDetails` and render
 * through the real router so `useParams` works.
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

const getAnimeDetailsMock = jest.fn();
jest.mock("../../../src/lib/api", () => ({
  __esModule: true,
  AnimeService: {
    GetAnimeDetails: (...args: unknown[]) => getAnimeDetailsMock(...args),
    GetAnimeImages: () => Promise.resolve({ images: [] }),
    GetAnimeImagesByEntry: () => Promise.resolve({ images: [] }),
    GetAnimeList: () => Promise.resolve([]),
  },
  TagService: {
    GetAll: () => Promise.resolve([]),
  },
  SearchService: {
    SearchImages: () => Promise.resolve({ images: [] }),
  },
}));

import { act } from "react-dom/test-utils";
import { routes } from "../../../src/app/routes";
import { toast } from "../../../src/components/ui/toaster";
import type { AnimeDerivedTag, AnimeDetail } from "../../../src/types";
import { renderRoutes, waitFor } from "../../test-utils";

function makeDerivedTag(
  id: number,
  name: string,
  category: string,
  imageCount = 3,
  thumbnailPath?: string,
): AnimeDerivedTag {
  const tag: AnimeDerivedTag = { id, name, category, imageCount };
  if (thumbnailPath !== undefined) {
    tag.thumbnailPath = thumbnailPath;
  }
  return tag;
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

/** Helper: render the characters tab with three character tags. */
function renderWithCharacters() {
  getAnimeDetailsMock.mockResolvedValue(
    makeDetail({
      tags: [
        makeDerivedTag(1, "Spike Spiegel", "character", 10),
        makeDerivedTag(2, "Jet Black", "character", 5),
        makeDerivedTag(3, "Faye Valentine", "character", 8),
        makeDerivedTag(4, "Outdoor", "scene", 7),
      ],
    }),
  );
  return renderRoutes(routes, {
    initialEntries: ["/anime/42/characters"],
  });
}

/** Wait until character cards are rendered. */
async function waitForCards(container: HTMLElement, count = 3) {
  await waitFor(
    () =>
      container.querySelectorAll("[data-testid='character-card']").length ===
      count,
  );
}

describe("CharactersTab", () => {
  beforeEach(() => {
    getAnimeDetailsMock.mockReset();
    updateTagMock.mockReset();
    (toast.success as jest.Mock).mockClear();
    (toast.error as jest.Mock).mockClear();
  });

  test("renders empty state when no character tags exist", async () => {
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({
        tags: [
          makeDerivedTag(1, "Outdoor", "scene", 10),
          makeDerivedTag(2, "Indoor", "location", 3),
        ],
      }),
    );
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/characters"],
    });
    try {
      await waitFor(
        () => (container.textContent ?? "").includes("No characters yet"),
      );
      expect(
        container.querySelector("[data-testid='characters-tab-go-tags']"),
      ).not.toBeNull();
    } finally {
      unmount();
    }
  });

  test("renders character cards for tags with category 'character'", async () => {
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({
        tags: [
          makeDerivedTag(1, "Spike Spiegel", "character", 10),
          makeDerivedTag(2, "Jet Black", "character", 5),
          makeDerivedTag(3, "Outdoor", "scene", 7),
        ],
      }),
    );
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/characters"],
    });
    try {
      await waitFor(
        () =>
          container.querySelectorAll("[data-testid='character-card']").length ===
          2,
      );
      const cards = container.querySelectorAll(
        "[data-testid='character-card']",
      );
      expect(cards.length).toBe(2);
      const ids = Array.from(cards)
        .map((c) => c.getAttribute("data-character-id"))
        .sort();
      expect(ids).toEqual(["1", "2"]);
    } finally {
      unmount();
    }
  });

  test("shows image count with correct pluralisation", async () => {
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({
        tags: [
          makeDerivedTag(1, "Solo", "character", 1),
          makeDerivedTag(2, "Many", "character", 5),
        ],
      }),
    );
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/characters"],
    });
    try {
      await waitFor(
        () =>
          container.querySelectorAll("[data-testid='character-card']").length ===
          2,
      );
      const cards = container.querySelectorAll(
        "[data-testid='character-card']",
      );
      expect(cards[0].textContent).toContain("1 image");
      expect(cards[0].textContent).not.toContain("1 images");
      expect(cards[1].textContent).toContain("5 images");
    } finally {
      unmount();
    }
  });

  test("surfaces an ErrorAlert on detail query failure", async () => {
    getAnimeDetailsMock.mockRejectedValue(new Error("fetch failed"));
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/characters"],
    });
    try {
      await waitFor(
        () => container.querySelector("[role='alert']") !== null,
      );
      expect(container.querySelector("[role='alert']")).not.toBeNull();
    } finally {
      unmount();
    }
  });

  test("search filter narrows character list", async () => {
    const { container, unmount } = renderWithCharacters();
    try {
      await waitForCards(container, 3);

      const input = container.querySelector(
        "input[role='searchbox']",
      ) as HTMLInputElement;
      expect(input).not.toBeNull();

      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!;
      act(() => {
        setter.call(input, "Spike");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });

      await waitFor(
        () =>
          container.querySelectorAll("[data-testid='character-card']")
            .length === 1,
      );
      const cards = container.querySelectorAll(
        "[data-testid='character-card']",
      );
      expect(cards.length).toBe(1);
      expect(cards[0].textContent).toContain("Spike Spiegel");
    } finally {
      unmount();
    }
  });

  test("clicking edit opens the edit dialog", async () => {
    const { container, unmount } = renderWithCharacters();
    try {
      await waitForCards(container, 3);

      const editBtn = container.querySelector(
        "[data-testid='character-card-edit']",
      ) as HTMLButtonElement;
      expect(editBtn).not.toBeNull();

      act(() => {
        editBtn.click();
      });

      // TagDialog uses Portal, so it renders to document.body
      await waitFor(
        () =>
          document.body.querySelector("[data-testid='tag-dialog']") !== null,
      );
      expect(
        document.body.querySelector("[data-testid='tag-dialog']"),
      ).not.toBeNull();
      // Verify the dialog has a submit button
      expect(
        document.body.querySelector("[data-testid='tag-form-submit']"),
      ).not.toBeNull();
    } finally {
      unmount();
    }
  });

  test("edit dialog validates empty name", async () => {
    const { container, unmount } = renderWithCharacters();
    try {
      await waitForCards(container, 3);

      // Open edit dialog
      const editBtn = container.querySelector(
        "[data-testid='character-card-edit']",
      ) as HTMLButtonElement;
      act(() => {
        editBtn.click();
      });
      await waitFor(
        () =>
          document.body.querySelector("[data-testid='tag-dialog']") !== null,
      );

      // Clear the name field (Portal renders to document.body)
      const nameInput = document.body.querySelector(
        "[data-testid='tag-form-name']",
      ) as HTMLInputElement;
      expect(nameInput).not.toBeNull();

      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!;
      act(() => {
        setter.call(nameInput, "");
        nameInput.dispatchEvent(new Event("input", { bubbles: true }));
      });

      // Trigger submitEdit via Enter key on the name input
      await act(async () => {
        nameInput.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
        );
      });

      // The submitEdit handler sets error "Name is required." for empty name
      await waitFor(
        () =>
          document.body.querySelector("[data-testid='tag-form-error']") !==
          null,
      );
      expect(
        document.body.querySelector("[data-testid='tag-form-error']")!
          .textContent,
      ).toBe("Name is required.");
    } finally {
      unmount();
    }
  });

  test("edit dialog submits successfully", async () => {
    updateTagMock.mockResolvedValue({
      id: 1,
      name: "Spike S.",
      category: "character",
    });
    const { container, unmount } = renderWithCharacters();
    try {
      await waitForCards(container, 3);

      // Open edit dialog for the first character
      const editBtn = container.querySelector(
        "[data-testid='character-card-edit']",
      ) as HTMLButtonElement;
      act(() => {
        editBtn.click();
      });
      await waitFor(
        () =>
          document.body.querySelector("[data-testid='tag-dialog']") !== null,
      );

      // Change the name (Portal renders to document.body)
      const nameInput = document.body.querySelector(
        "[data-testid='tag-form-name']",
      ) as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!;
      act(() => {
        setter.call(nameInput, "Spike S.");
        nameInput.dispatchEvent(new Event("input", { bubbles: true }));
      });

      // Click submit
      const submitBtn = document.body.querySelector(
        "[data-testid='tag-form-submit']",
      ) as HTMLButtonElement;
      await act(async () => {
        submitBtn.click();
      });

      // Wait for the async submit to complete
      await waitFor(() => updateTagMock.mock.calls.length > 0);

      expect(updateTagMock).toHaveBeenCalledWith(1, {
        name: "Spike S.",
        category: "character",
        parentId: undefined,
      });
      expect(toast.success).toHaveBeenCalledWith(
        "Character updated",
        '"Spike S." saved.',
      );
    } finally {
      unmount();
    }
  });

  test("edit dialog shows error on failure", async () => {
    updateTagMock.mockRejectedValue(new Error("server error"));
    const { container, unmount } = renderWithCharacters();
    try {
      await waitForCards(container, 3);

      // Open edit dialog
      const editBtn = container.querySelector(
        "[data-testid='character-card-edit']",
      ) as HTMLButtonElement;
      act(() => {
        editBtn.click();
      });
      await waitFor(
        () =>
          document.body.querySelector("[data-testid='tag-dialog']") !== null,
      );

      // Submit with existing name (non-empty, so validation passes)
      const submitBtn = document.body.querySelector(
        "[data-testid='tag-form-submit']",
      ) as HTMLButtonElement;
      await act(async () => {
        submitBtn.click();
      });

      // Wait for error to appear
      await waitFor(
        () =>
          document.body.querySelector("[data-testid='tag-form-error']") !==
          null,
      );
      expect(
        document.body.querySelector("[data-testid='tag-form-error']")!
          .textContent,
      ).toBe("server error");
      expect(toast.error).toHaveBeenCalledWith(
        "Could not save",
        "server error",
      );
    } finally {
      unmount();
    }
  });

  test("convert to tag calls updateTag with uncategorized", async () => {
    updateTagMock.mockResolvedValue({
      id: 1,
      name: "Spike Spiegel",
      category: "uncategorized",
    });
    const { container, unmount } = renderWithCharacters();
    try {
      await waitForCards(container, 3);

      // Click convert button on the first character card
      const convertBtn = container.querySelector(
        "[data-testid='character-card-convert']",
      ) as HTMLButtonElement;
      expect(convertBtn).not.toBeNull();

      await act(async () => {
        convertBtn.click();
      });

      await waitFor(() => updateTagMock.mock.calls.length > 0);

      expect(updateTagMock).toHaveBeenCalledWith(1, {
        name: "Spike Spiegel",
        category: "uncategorized",
      });
      expect(toast.success).toHaveBeenCalledWith(
        "Converted to tag",
        '"Spike Spiegel" moved to Tags.',
      );
    } finally {
      unmount();
    }
  });

  test("convert to tag shows error on failure", async () => {
    updateTagMock.mockRejectedValue(new Error("convert failed"));
    const { container, unmount } = renderWithCharacters();
    try {
      await waitForCards(container, 3);

      // Click convert button on the first character card
      const convertBtn = container.querySelector(
        "[data-testid='character-card-convert']",
      ) as HTMLButtonElement;
      await act(async () => {
        convertBtn.click();
      });

      await waitFor(() => (toast.error as jest.Mock).mock.calls.length > 0);

      expect(toast.error).toHaveBeenCalledWith(
        "Could not convert",
        "convert failed",
      );
    } finally {
      unmount();
    }
  });

  test("error alert retry button triggers refetch", async () => {
    getAnimeDetailsMock.mockRejectedValue(new Error("fetch failed"));
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/characters"],
    });
    try {
      await waitFor(
        () => container.querySelector("[data-testid='characters-tab'] [role='alert']") !== null,
      );

      // Click the retry button inside the characters-tab's ErrorAlert
      // (not the layout's error alert)
      const retryBtn = container.querySelector(
        "[data-testid='characters-tab'] [role='alert'] button",
      ) as HTMLButtonElement;
      expect(retryBtn).not.toBeNull();

      // Set up a successful response for the retry
      getAnimeDetailsMock.mockResolvedValue(
        makeDetail({
          tags: [makeDerivedTag(1, "Spike Spiegel", "character", 10)],
        }),
      );

      await act(async () => {
        retryBtn.click();
      });

      // After retry, the component should render successfully
      await waitFor(
        () =>
          container.querySelectorAll("[data-testid='character-card']")
            .length === 1,
      );
      expect(
        container.querySelector("[data-testid='character-card']"),
      ).not.toBeNull();
    } finally {
      unmount();
    }
  });

  test("empty state Go to Tags button navigates to tags tab", async () => {
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({
        tags: [makeDerivedTag(1, "Outdoor", "scene", 10)],
      }),
    );
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/characters"],
    });
    try {
      await waitFor(
        () => (container.textContent ?? "").includes("No characters yet"),
      );

      const goTagsBtn = container.querySelector(
        "[data-testid='characters-tab-go-tags']",
      ) as HTMLButtonElement;
      expect(goTagsBtn).not.toBeNull();

      act(() => {
        goTagsBtn.click();
      });

      // Should navigate to the tags tab. Wait for the characters tab to disappear.
      await waitFor(
        () =>
          container.querySelector("[data-testid='characters-tab']") === null ||
          !(container.textContent ?? "").includes("No characters yet"),
        { timeout: 2000 },
      );
    } finally {
      unmount();
    }
  });

  test("convert to tag handles non-Error thrown value", async () => {
    updateTagMock.mockRejectedValue("string error");
    const { container, unmount } = renderWithCharacters();
    try {
      await waitForCards(container, 3);

      const convertBtn = container.querySelector(
        "[data-testid='character-card-convert']",
      ) as HTMLButtonElement;
      await act(async () => {
        convertBtn.click();
      });

      await waitFor(() => (toast.error as jest.Mock).mock.calls.length > 0);

      expect(toast.error).toHaveBeenCalledWith(
        "Could not convert",
        "string error",
      );
    } finally {
      unmount();
    }
  });

  test("edit dialog handles non-Error thrown value", async () => {
    updateTagMock.mockRejectedValue("update string error");
    const { container, unmount } = renderWithCharacters();
    try {
      await waitForCards(container, 3);

      // Open edit dialog
      const editBtn = container.querySelector(
        "[data-testid='character-card-edit']",
      ) as HTMLButtonElement;
      act(() => {
        editBtn.click();
      });
      await waitFor(
        () =>
          document.body.querySelector("[data-testid='tag-dialog']") !== null,
      );

      // Submit with existing name
      const submitBtn = document.body.querySelector(
        "[data-testid='tag-form-submit']",
      ) as HTMLButtonElement;
      await act(async () => {
        submitBtn.click();
      });

      await waitFor(
        () =>
          document.body.querySelector("[data-testid='tag-form-error']") !==
          null,
      );
      expect(
        document.body.querySelector("[data-testid='tag-form-error']")!
          .textContent,
      ).toBe("update string error");
      expect(toast.error).toHaveBeenCalledWith(
        "Could not save",
        "update string error",
      );
    } finally {
      unmount();
    }
  });

  test("error alert shows string error message", async () => {
    getAnimeDetailsMock.mockRejectedValue("plain string error");
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/characters"],
    });
    try {
      await waitFor(
        () => container.querySelector("[role='alert']") !== null,
      );
      expect(container.querySelector("[role='alert']")!.textContent).toContain(
        "plain string error",
      );
    } finally {
      unmount();
    }
  });

  test("error alert handles null/undefined error value", async () => {
    // Reject with null to exercise the `String(error ?? "")` branch
    getAnimeDetailsMock.mockRejectedValue(null);
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/characters"],
    });
    try {
      await waitFor(
        () => container.querySelector("[role='alert']") !== null,
      );
      // The ErrorAlert should render without crashing
      expect(container.querySelector("[role='alert']")).not.toBeNull();
    } finally {
      unmount();
    }
  });

  test("renders thumbnail image when thumbnailPath is provided", async () => {
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({
        tags: [
          makeDerivedTag(1, "Spike Spiegel", "character", 10, "/files/anime/char.jpg"),
        ],
      }),
    );
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/characters"],
    });
    try {
      await waitFor(
        () =>
          container.querySelectorAll("[data-testid='character-card']").length ===
          1,
      );
      const card = container.querySelector("[data-testid='character-card']")!;
      const img = card.querySelector("img");
      expect(img).not.toBeNull();
      expect(img!.getAttribute("src")).toContain("/anime/char.jpg");
      expect(img!.getAttribute("alt")).toBe("Spike Spiegel");
    } finally {
      unmount();
    }
  });

  test("renders fallback Users icon when thumbnailPath is absent", async () => {
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({
        tags: [
          makeDerivedTag(1, "Faye Valentine", "character", 8),
        ],
      }),
    );
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/characters"],
    });
    try {
      await waitFor(
        () =>
          container.querySelectorAll("[data-testid='character-card']").length ===
          1,
      );
      const card = container.querySelector("[data-testid='character-card']")!;
      const img = card.querySelector("img");
      expect(img).toBeNull();
      // The fallback SVG icon should be present
      const svg = card.querySelector("svg");
      expect(svg).not.toBeNull();
    } finally {
      unmount();
    }
  });

  test("search button navigates to search with anime param", async () => {
    const { container, unmount } = renderWithCharacters();
    try {
      await waitForCards(container, 3);

      // Click search button on the first character card
      const searchBtn = container.querySelector(
        "[data-testid='character-card-search']",
      ) as HTMLButtonElement;
      expect(searchBtn).not.toBeNull();

      act(() => {
        searchBtn.click();
      });

      // The navigate call goes to /search?tag=1&anime=42
      // Wait for the search page content to appear
      await waitFor(
        () =>
          container.querySelector("[role='searchbox']") !== null ||
          (container.textContent ?? "").includes("Search"),
        { timeout: 2000 },
      );

      // The characters tab should no longer be visible since we navigated away
      expect(
        container.querySelector("[data-testid='characters-grid']"),
      ).toBeNull();
    } finally {
      unmount();
    }
  });
});
