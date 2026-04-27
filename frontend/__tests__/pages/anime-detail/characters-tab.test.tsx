/**
 * Tests for `CharactersTab`.
 *
 * Characters are separate entities (not tags), fetched via `useAnimeDetail`
 * in the `characters` array. CRUD operations use `CharacterService` bindings.
 * Tests mock `AnimeService.GetAnimeDetails` and `CharacterService` methods,
 * and render through the real router so `useParams` works.
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

jest.mock("../../../src/components/ui/toaster", () => ({
  __esModule: true,
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

const getAnimeDetailsMock = jest.fn();
const renameCharacterMock = jest.fn();
const deleteCharacterMock = jest.fn();
const createCharacterMock = jest.fn();

jest.mock("../../../src/lib/api", () => ({
  __esModule: true,
  AnimeService: {
    GetAnimeDetails: (...args: unknown[]) => getAnimeDetailsMock(...args),
    GetAnimeImages: () => Promise.resolve({ images: [] }),
    GetAnimeImagesByEntry: () => Promise.resolve({ images: [] }),
    GetAnimeList: () => Promise.resolve([]),
  },
  CharacterService: {
    RenameCharacter: (...args: unknown[]) => renameCharacterMock(...args),
    DeleteCharacter: (...args: unknown[]) => deleteCharacterMock(...args),
    CreateCharacter: (...args: unknown[]) => createCharacterMock(...args),
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
import type { AnimeCharacter, AnimeDetail } from "../../../src/types";
import { renderRoutes, waitFor } from "../../test-utils";

function makeCharacter(
  id: number,
  name: string,
  imageCount = 3,
  thumbnailPath?: string,
): AnimeCharacter {
  const ch: AnimeCharacter = { id, name, imageCount };
  if (thumbnailPath !== undefined) {
    ch.thumbnailPath = thumbnailPath;
  }
  return ch;
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

/** Helper: render the characters tab with three characters. */
function renderWithCharacters() {
  getAnimeDetailsMock.mockResolvedValue(
    makeDetail({
      characters: [
        makeCharacter(1, "Spike Spiegel", 10),
        makeCharacter(2, "Jet Black", 5),
        makeCharacter(3, "Faye Valentine", 8),
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
    renameCharacterMock.mockReset();
    deleteCharacterMock.mockReset();
    createCharacterMock.mockReset();
    (toast.success as jest.Mock).mockClear();
    (toast.error as jest.Mock).mockClear();
  });

  test("renders empty state when no characters exist", async () => {
    getAnimeDetailsMock.mockResolvedValue(makeDetail());
    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/42/characters"],
    });
    try {
      await waitFor(
        () => (container.textContent ?? "").includes("No characters yet"),
      );
      expect(
        container.querySelector("[data-testid='characters-tab-add']"),
      ).not.toBeNull();
    } finally {
      unmount();
    }
  });

  test("renders character cards from data.characters", async () => {
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({
        characters: [
          makeCharacter(1, "Spike Spiegel", 10),
          makeCharacter(2, "Jet Black", 5),
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
        characters: [
          makeCharacter(1, "Solo", 1),
          makeCharacter(2, "Many", 5),
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

  test("clicking edit opens the rename dialog", async () => {
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

      // RenameDialog uses Portal, so it renders to document.body
      await waitFor(
        () =>
          document.body.querySelector("[data-testid='rename-dialog']") !== null,
      );
      expect(
        document.body.querySelector("[data-testid='rename-dialog']"),
      ).not.toBeNull();
      expect(
        document.body.querySelector("[data-testid='rename-dialog-submit']"),
      ).not.toBeNull();
    } finally {
      unmount();
    }
  });

  test("rename dialog validates empty name", async () => {
    const { container, unmount } = renderWithCharacters();
    try {
      await waitForCards(container, 3);

      // Open rename dialog
      const editBtn = container.querySelector(
        "[data-testid='character-card-edit']",
      ) as HTMLButtonElement;
      act(() => {
        editBtn.click();
      });
      await waitFor(
        () =>
          document.body.querySelector("[data-testid='rename-dialog']") !== null,
      );

      // Clear the name field
      const nameInput = document.body.querySelector(
        "[data-testid='rename-dialog-input']",
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

      // Trigger submit via Enter key
      await act(async () => {
        nameInput.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
        );
      });

      await waitFor(
        () =>
          document.body.querySelector("[data-testid='rename-dialog-error']") !==
          null,
      );
      expect(
        document.body.querySelector("[data-testid='rename-dialog-error']")!
          .textContent,
      ).toBe("Name is required.");
    } finally {
      unmount();
    }
  });

  test("rename dialog submits successfully", async () => {
    renameCharacterMock.mockResolvedValue({
      id: 1,
      name: "Spike S.",
      animeId: 42,
      imageCount: 10,
    });
    const { container, unmount } = renderWithCharacters();
    try {
      await waitForCards(container, 3);

      // Open rename dialog for the first character
      const editBtn = container.querySelector(
        "[data-testid='character-card-edit']",
      ) as HTMLButtonElement;
      act(() => {
        editBtn.click();
      });
      await waitFor(
        () =>
          document.body.querySelector("[data-testid='rename-dialog']") !== null,
      );

      // Change the name
      const nameInput = document.body.querySelector(
        "[data-testid='rename-dialog-input']",
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
        "[data-testid='rename-dialog-submit']",
      ) as HTMLButtonElement;
      await act(async () => {
        submitBtn.click();
      });

      await waitFor(() => renameCharacterMock.mock.calls.length > 0);

      expect(renameCharacterMock).toHaveBeenCalledWith(1, "Spike S.");
      expect(toast.success).toHaveBeenCalledWith(
        "Character renamed",
        '"Spike S." saved.',
      );
    } finally {
      unmount();
    }
  });

  test("rename dialog shows error on failure", async () => {
    renameCharacterMock.mockRejectedValue(new Error("server error"));
    const { container, unmount } = renderWithCharacters();
    try {
      await waitForCards(container, 3);

      const editBtn = container.querySelector(
        "[data-testid='character-card-edit']",
      ) as HTMLButtonElement;
      act(() => {
        editBtn.click();
      });
      await waitFor(
        () =>
          document.body.querySelector("[data-testid='rename-dialog']") !== null,
      );

      const submitBtn = document.body.querySelector(
        "[data-testid='rename-dialog-submit']",
      ) as HTMLButtonElement;
      await act(async () => {
        submitBtn.click();
      });

      await waitFor(
        () =>
          document.body.querySelector("[data-testid='rename-dialog-error']") !==
          null,
      );
      expect(
        document.body.querySelector("[data-testid='rename-dialog-error']")!
          .textContent,
      ).toBe("server error");
      expect(toast.error).toHaveBeenCalledWith(
        "Could not rename",
        "server error",
      );
    } finally {
      unmount();
    }
  });

  test("delete character calls DeleteCharacter after confirm", async () => {
    deleteCharacterMock.mockResolvedValue(undefined);
    const { container, unmount } = renderWithCharacters();
    try {
      await waitForCards(container, 3);

      // Click delete button on the first character card
      const deleteBtn = container.querySelector(
        "[data-testid='character-card-delete']",
      ) as HTMLButtonElement;
      expect(deleteBtn).not.toBeNull();

      act(() => {
        deleteBtn.click();
      });

      // Confirm dialog should appear
      await waitFor(
        () =>
          document.body.querySelector("[data-testid='confirm-dialog']") !== null,
      );

      // Click the confirm button
      const confirmBtn = document.body.querySelector(
        "[data-testid='confirm-dialog-confirm']",
      ) as HTMLButtonElement;
      expect(confirmBtn).not.toBeNull();

      await act(async () => {
        confirmBtn.click();
      });

      await waitFor(() => deleteCharacterMock.mock.calls.length > 0);

      expect(deleteCharacterMock).toHaveBeenCalledWith(1);
      expect(toast.success).toHaveBeenCalledWith(
        "Character deleted",
        '"Spike Spiegel" removed.',
      );
    } finally {
      unmount();
    }
  });

  test("delete confirm dialog cancel does not call DeleteCharacter", async () => {
    const { container, unmount } = renderWithCharacters();
    try {
      await waitForCards(container, 3);

      const deleteBtn = container.querySelector(
        "[data-testid='character-card-delete']",
      ) as HTMLButtonElement;
      act(() => {
        deleteBtn.click();
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

      expect(deleteCharacterMock).not.toHaveBeenCalled();
    } finally {
      unmount();
    }
  });

  test("delete character shows error on failure", async () => {
    deleteCharacterMock.mockRejectedValue(new Error("delete failed"));
    const { container, unmount } = renderWithCharacters();
    try {
      await waitForCards(container, 3);

      const deleteBtn = container.querySelector(
        "[data-testid='character-card-delete']",
      ) as HTMLButtonElement;
      act(() => {
        deleteBtn.click();
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
        "Could not delete",
        "delete failed",
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

      const retryBtn = container.querySelector(
        "[data-testid='characters-tab'] [role='alert'] button",
      ) as HTMLButtonElement;
      expect(retryBtn).not.toBeNull();

      // Set up a successful response for the retry
      getAnimeDetailsMock.mockResolvedValue(
        makeDetail({
          characters: [makeCharacter(1, "Spike Spiegel", 10)],
        }),
      );

      await act(async () => {
        retryBtn.click();
      });

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

  test("renders thumbnail image when thumbnailPath is provided", async () => {
    getAnimeDetailsMock.mockResolvedValue(
      makeDetail({
        characters: [
          makeCharacter(1, "Spike Spiegel", 10, "/files/anime/char.jpg"),
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
        characters: [
          makeCharacter(1, "Faye Valentine", 8),
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
      const svg = card.querySelector("svg");
      expect(svg).not.toBeNull();
    } finally {
      unmount();
    }
  });

  test("clicking character card navigates to search with anime param", async () => {
    const { container, unmount } = renderWithCharacters();
    try {
      await waitForCards(container, 3);

      const card = container.querySelector(
        "[data-testid='character-card']",
      ) as HTMLButtonElement;
      expect(card).not.toBeNull();

      act(() => {
        card.click();
      });

      await waitFor(
        () =>
          container.querySelector("[role='searchbox']") !== null ||
          (container.textContent ?? "").includes("Search"),
        { timeout: 2000 },
      );

      expect(
        container.querySelector("[data-testid='characters-grid']"),
      ).toBeNull();
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
    getAnimeDetailsMock.mockRejectedValue(null);
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
});
