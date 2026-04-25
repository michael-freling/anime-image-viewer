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

import { routes } from "../../../src/app/routes";
import type { AnimeDerivedTag, AnimeDetail } from "../../../src/types";
import { renderRoutes, waitFor } from "../../test-utils";

function makeDerivedTag(
  id: number,
  name: string,
  category: string,
  imageCount = 3,
): AnimeDerivedTag {
  return { id, name, category, imageCount };
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

describe("CharactersTab", () => {
  beforeEach(() => {
    getAnimeDetailsMock.mockReset();
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
});
