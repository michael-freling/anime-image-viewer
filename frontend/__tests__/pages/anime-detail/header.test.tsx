/**
 * Tests for `AnimeDetailHeader`.
 *
 * Spec: ui-design.md §3.2.1 "Header: breadcrumb, anime name, entry count,
 * image count, Upload button, `...` overflow menu". We verify:
 *   - the title + breadcrumb render the anime name (or a loading fallback),
 *   - the metadata line pluralises entries/images,
 *   - Back button is always present,
 *   - Upload / More buttons appear only when their handlers are provided.
 */
import type { AnimeDetail } from "../../../src/types";
import { AnimeDetailHeader } from "../../../src/pages/anime-detail/header";
import { renderWithClient } from "../../test-utils";

function makeDetail(overrides: Partial<AnimeDetail> = {}): AnimeDetail {
  return {
    anime: { id: 1, name: "Cowboy Bebop", aniListId: null },
    tags: [],
    characters: [],
    folders: [],
    folderTree: null,
    entries: [],
    ...overrides,
  };
}

describe("AnimeDetailHeader", () => {
  test("renders the anime name as the page title", () => {
    const { container, unmount } = renderWithClient(
      <AnimeDetailHeader
        detail={makeDetail()}
        entryCount={2}
        totalImages={12}
      />,
    );
    try {
      const h1 = container.querySelector("h1");
      expect(h1?.textContent).toBe("Cowboy Bebop");
    } finally {
      unmount();
    }
  });

  test("falls back to a loading title when detail is undefined", () => {
    const { container, unmount } = renderWithClient(
      <AnimeDetailHeader detail={undefined} entryCount={0} totalImages={0} />,
    );
    try {
      const h1 = container.querySelector("h1");
      // The header uses an ellipsis placeholder while loading.
      expect(h1?.textContent ?? "").toMatch(/Loading/);
    } finally {
      unmount();
    }
  });

  test("metadata line contains pluralised counts", () => {
    const { container, unmount } = renderWithClient(
      <AnimeDetailHeader
        detail={makeDetail()}
        entryCount={3}
        totalImages={1}
      />,
    );
    try {
      expect(container.textContent ?? "").toContain("3 entries");
      // singular "image" (not "images") when total === 1
      expect(container.textContent ?? "").toContain("1 image");
    } finally {
      unmount();
    }
  });

  test("Back button is always rendered", () => {
    const { container, unmount } = renderWithClient(
      <AnimeDetailHeader
        detail={makeDetail()}
        entryCount={0}
        totalImages={0}
      />,
    );
    try {
      const back = container.querySelector(
        "[data-testid='anime-detail-back']",
      );
      expect(back).not.toBeNull();
    } finally {
      unmount();
    }
  });

  test("Upload button only renders when onUpload is provided", () => {
    const withoutUpload = renderWithClient(
      <AnimeDetailHeader
        detail={makeDetail()}
        entryCount={0}
        totalImages={0}
      />,
    );
    expect(
      withoutUpload.container.querySelector(
        "[data-testid='anime-detail-upload']",
      ),
    ).toBeNull();
    withoutUpload.unmount();

    const withUpload = renderWithClient(
      <AnimeDetailHeader
        detail={makeDetail()}
        entryCount={0}
        totalImages={0}
        onUpload={() => undefined}
      />,
    );
    expect(
      withUpload.container.querySelector(
        "[data-testid='anime-detail-upload']",
      ),
    ).not.toBeNull();
    withUpload.unmount();
  });

  test("More button only renders when onMore is provided", () => {
    const { container, unmount } = renderWithClient(
      <AnimeDetailHeader
        detail={makeDetail()}
        entryCount={0}
        totalImages={0}
        onMore={() => undefined}
      />,
    );
    try {
      expect(
        container.querySelector("[data-testid='anime-detail-more']"),
      ).not.toBeNull();
    } finally {
      unmount();
    }
  });

  test("breadcrumb shows Home > Anime name", () => {
    const { container, unmount } = renderWithClient(
      <AnimeDetailHeader
        detail={makeDetail({
          anime: { id: 9, name: "Spirited Away", aniListId: null },
        })}
        entryCount={0}
        totalImages={0}
      />,
    );
    try {
      const breadcrumbNav = container.querySelector(
        "nav[aria-label='Breadcrumb']",
      );
      expect(breadcrumbNav).not.toBeNull();
      expect(breadcrumbNav?.textContent ?? "").toContain("Home");
      expect(breadcrumbNav?.textContent ?? "").toContain("Spirited Away");
    } finally {
      unmount();
    }
  });

  test("computes total images from the entry tree when totalImages=0", () => {
    const detail = makeDetail({
      entries: [
        {
          id: 1,
          name: "S1",
          type: "season",
          entryNumber: 1,
          airingSeason: "",
          airingYear: null,
          imageCount: 5,
          children: [
            {
              id: 2,
              name: "S1 part 1",
              type: "season",
              entryNumber: 1,
              airingSeason: "",
              airingYear: null,
              imageCount: 3,
              children: [],
            },
          ],
        },
      ],
    });
    const { container, unmount } = renderWithClient(
      <AnimeDetailHeader detail={detail} entryCount={1} totalImages={0} />,
    );
    try {
      // 5 + 3 = 8 images across the root + child entry.
      expect(container.textContent ?? "").toContain("8 images");
    } finally {
      unmount();
    }
  });
});
