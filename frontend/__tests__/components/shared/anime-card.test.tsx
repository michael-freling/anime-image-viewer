/**
 * Tests for `AnimeCard` + `NewAnimeCard` + `AnimeCardSkeleton` (ui-design §4.1).
 *
 * Proves:
 *   - Default card renders title + image count.
 *   - Image element carries `loading="lazy"`, `decoding="async"`, and a
 *     `srcset` string built from `thumbnailSrcSet`.
 *   - Clicking the card fires the provided `onClick` handler.
 *   - NewAnimeCard fires its click handler and exposes the "New anime"
 *     accessible label.
 *   - Without a `coverFileId` the empty/gradient placeholder is used.
 *   - Skeleton variant renders in its own element with the expected label.
 */
import { act } from "react-dom/test-utils";

import {
  AnimeCard,
  AnimeCardSkeleton,
  NewAnimeCard,
} from "../../../src/components/shared/anime-card";
import type { AnimeSummary } from "../../../src/types";
import { renderWithClient } from "../../test-utils";

const ANIME: AnimeSummary = {
  id: 42,
  name: "Attack on Titan",
  imageCount: 342,
};

describe("AnimeCard", () => {
  test("renders the title and pluralised count", () => {
    const { container, unmount } = renderWithClient(
      <AnimeCard anime={ANIME} coverFileId={100} />,
    );
    try {
      expect(container.textContent).toContain("Attack on Titan");
      // Footer caption reads "342 images".
      expect(container.textContent).toContain("342 images");
      // Badge displays the bare count.
      expect(container.textContent).toContain("342");
    } finally {
      unmount();
    }
  });

  test("shows the singular label when there is exactly one image", () => {
    const { container, unmount } = renderWithClient(
      <AnimeCard anime={{ ...ANIME, imageCount: 1 }} coverFileId={100} />,
    );
    try {
      expect(container.textContent).toContain("1 image");
      expect(container.textContent).not.toContain("1 images");
    } finally {
      unmount();
    }
  });

  test("image has lazy loading, async decoding and a thumbnail srcset", () => {
    const { container, unmount } = renderWithClient(
      <AnimeCard anime={ANIME} coverFileId={100} />,
    );
    try {
      const img = container.querySelector("img");
      expect(img).not.toBeNull();
      expect(img!.getAttribute("loading")).toBe("lazy");
      expect(img!.getAttribute("decoding")).toBe("async");
      const srcset = img!.getAttribute("srcset") ?? img!.getAttribute("srcSet");
      expect(srcset).toBeTruthy();
      expect(srcset).toContain("520w");
      expect(srcset).toContain("1040w");
      expect(srcset).toContain("1920w");
      expect(srcset).toContain(`/_/images/${ANIME.id === 42 ? 100 : 100}?width=520`);
    } finally {
      unmount();
    }
  });

  test("outer wrapper gets the `.tile` class for content-visibility", () => {
    const { container, unmount } = renderWithClient(
      <AnimeCard anime={ANIME} coverFileId={100} />,
    );
    try {
      const tile = container.querySelector(".tile");
      expect(tile).not.toBeNull();
    } finally {
      unmount();
    }
  });

  test("without coverFileId falls back to gradient placeholder", () => {
    const { container, unmount } = renderWithClient(<AnimeCard anime={ANIME} />);
    try {
      expect(container.querySelector("img")).toBeNull();
      // Initial letter renders inside the placeholder.
      expect(container.textContent).toContain("A");
    } finally {
      unmount();
    }
  });

  test("fires onClick when the card is clicked", () => {
    const onClick = jest.fn();
    const { container, unmount } = renderWithClient(
      <AnimeCard anime={ANIME} coverFileId={100} onClick={onClick} />,
    );
    try {
      const card = container.querySelector<HTMLElement>(
        "[data-testid='anime-card']",
      );
      expect(card).not.toBeNull();
      act(() => {
        card!.click();
      });
      expect(onClick).toHaveBeenCalledTimes(1);
    } finally {
      unmount();
    }
  });
});

describe("NewAnimeCard", () => {
  test("fires onClick and exposes the label", () => {
    const onClick = jest.fn();
    const { container, unmount } = renderWithClient(
      <NewAnimeCard onClick={onClick} />,
    );
    try {
      const card = container.querySelector<HTMLElement>(
        "[data-testid='new-anime-card']",
      );
      expect(card).not.toBeNull();
      expect(card!.getAttribute("aria-label")).toBe("New anime");
      act(() => {
        card!.click();
      });
      expect(onClick).toHaveBeenCalledTimes(1);
    } finally {
      unmount();
    }
  });

  test("respects custom label", () => {
    const { container, unmount } = renderWithClient(
      <NewAnimeCard onClick={() => {}} label="Import anime" />,
    );
    try {
      const card = container.querySelector<HTMLElement>(
        "[data-testid='new-anime-card']",
      );
      expect(card!.getAttribute("aria-label")).toBe("Import anime");
      expect(container.textContent).toContain("Import anime");
    } finally {
      unmount();
    }
  });
});

describe("AnimeCardSkeleton", () => {
  test("renders a skeleton placeholder with the default label", () => {
    const { container, unmount } = renderWithClient(<AnimeCardSkeleton />);
    try {
      const skeleton = container.querySelector(
        "[data-testid='anime-card-skeleton']",
      );
      expect(skeleton).not.toBeNull();
      expect(skeleton!.getAttribute("aria-label")).toBe("Loading anime");
    } finally {
      unmount();
    }
  });
});
