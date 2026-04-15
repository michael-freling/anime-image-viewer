/**
 * Tests for `TagsTab`.
 *
 * Spec: ui-design.md §3.2.4 "Tags tab". Verifies grouping-by-category,
 * active chip render, empty state, and error state.
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
  imageCount = 1,
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

describe("TagsTab", () => {
  beforeEach(() => {
    getAnimeDetailsMock.mockReset();
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
});
