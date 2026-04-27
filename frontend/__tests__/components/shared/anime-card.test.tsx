/**
 * Tests for `AnimeCard` + `NewAnimeCard` + `AnimeCardSkeleton` (ui-design §4.1).
 *
 * The backend's `AnimeListItem` (see `internal/frontend/anime.go`) does not
 * yet expose a cover image path, so every `AnimeCard` renders the gradient
 * placeholder branch — there is no `<img>` to assert against.
 *
 * Proves:
 *   - Card renders title + image count.
 *   - Clicking the card fires the provided `onClick` handler.
 *   - NewAnimeCard fires its click handler and exposes the "New anime"
 *     accessible label.
 *   - Without a cover the gradient placeholder surfaces the first letter of
 *     the title (or "?" when the name is empty).
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
      <AnimeCard anime={ANIME} />,
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
      <AnimeCard anime={{ ...ANIME, imageCount: 1 }} />,
    );
    try {
      expect(container.textContent).toContain("1 image");
      expect(container.textContent).not.toContain("1 images");
    } finally {
      unmount();
    }
  });

  test("outer wrapper gets the `.tile` class for content-visibility", () => {
    const { container, unmount } = renderWithClient(
      <AnimeCard anime={ANIME} />,
    );
    try {
      const tile = container.querySelector(".tile");
      expect(tile).not.toBeNull();
    } finally {
      unmount();
    }
  });

  test("renders the gradient placeholder (no <img> until backend exposes a cover)", () => {
    const { container, unmount } = renderWithClient(<AnimeCard anime={ANIME} />);
    try {
      expect(container.querySelector("img")).toBeNull();
      // Initial letter renders inside the placeholder.
      expect(container.textContent).toContain("A");
    } finally {
      unmount();
    }
  });

  test("title with leading whitespace falls back to '?' initial", () => {
    // Drives the `|| "?"` fallback branch: when the trimmed first character
    // resolves to an empty string the placeholder shows the question mark.
    const { container, unmount } = renderWithClient(
      <AnimeCard anime={{ ...ANIME, name: "   " }} />,
    );
    try {
      expect(container.textContent).toContain("?");
    } finally {
      unmount();
    }
  });

  test("fires onClick when the card is clicked", () => {
    const onClick = jest.fn();
    const { container, unmount } = renderWithClient(
      <AnimeCard anime={ANIME} onClick={onClick} />,
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
