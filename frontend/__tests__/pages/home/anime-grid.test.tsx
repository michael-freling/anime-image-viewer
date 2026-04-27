/**
 * Tests for the Home page's `AnimeGrid` primitive.
 *
 * Covers the three rendering modes exposed by the component (ui-design §3.1,
 * frontend-design Phase D1):
 *   - Skeleton mode (`skeletonCount`) emits N `anime-card-skeleton` tiles.
 *   - Item mode (`items`) emits one `anime-card` per entry plus the
 *     caller-supplied `trailing` node.
 *   - Click propagation: an `onCardClick(id)` handler fires with the anime id
 *     when the underlying `AnimeCard` button is activated.
 *
 * Renders through `renderWithClient` (real Chakra) so the AnimeCard's
 * `chakra("button")` pipes HTML attributes + data-* props through correctly.
 */
import { act } from "react-dom/test-utils";

import { AnimeGrid } from "../../../src/pages/home/anime-grid";
import { NewAnimeCard } from "../../../src/components/shared/anime-card";
import type { AnimeSummary } from "../../../src/types";
import { renderWithClient } from "../../test-utils";

const ANIME: AnimeSummary[] = [
  { id: 1, name: "Cowboy Bebop", imageCount: 30 },
  { id: 2, name: "Attack on Titan", imageCount: 42 },
  { id: 3, name: "Naruto", imageCount: 100 },
];

describe("AnimeGrid", () => {
  test("renders one anime card per item", () => {
    const { container, unmount } = renderWithClient(
      <AnimeGrid items={ANIME} />,
    );
    try {
      const cards = container.querySelectorAll(
        "[data-testid='anime-card']",
      );
      expect(cards.length).toBe(ANIME.length);
      const text = container.textContent ?? "";
      expect(text).toContain("Cowboy Bebop");
      expect(text).toContain("Attack on Titan");
      expect(text).toContain("Naruto");
    } finally {
      unmount();
    }
  });

  test("renders the trailing node after the cards", () => {
    const { container, unmount } = renderWithClient(
      <AnimeGrid
        items={ANIME}
        trailing={<NewAnimeCard onClick={() => undefined} />}
      />,
    );
    try {
      // Grid contains the cards plus the new-anime tile.
      expect(
        container.querySelectorAll("[data-testid='anime-card']").length,
      ).toBe(ANIME.length);
      const trailing = container.querySelector("[data-testid='new-anime-card']");
      expect(trailing).not.toBeNull();
    } finally {
      unmount();
    }
  });

  test("skeletonCount renders N skeletons and suppresses cards", () => {
    const { container, unmount } = renderWithClient(
      <AnimeGrid
        items={ANIME}
        skeletonCount={4}
        trailing={<NewAnimeCard onClick={() => undefined} />}
      />,
    );
    try {
      const skeletons = container.querySelectorAll(
        "[data-testid='anime-card-skeleton']",
      );
      expect(skeletons.length).toBe(4);
      // Cards and trailing are hidden while skeletons are rendered.
      expect(
        container.querySelectorAll("[data-testid='anime-card']").length,
      ).toBe(0);
      expect(
        container.querySelector("[data-testid='new-anime-card']"),
      ).toBeNull();
    } finally {
      unmount();
    }
  });

  test("calls onCardClick with the anime id when a card is clicked", () => {
    const onCardClick = jest.fn();
    const { container, unmount } = renderWithClient(
      <AnimeGrid items={ANIME} onCardClick={onCardClick} />,
    );
    try {
      const cards = container.querySelectorAll<HTMLElement>(
        "[data-testid='anime-card']",
      );
      expect(cards.length).toBe(ANIME.length);
      // Click the second card; data-anime-id on the button carries the id.
      act(() => {
        cards[1].click();
      });
      expect(onCardClick).toHaveBeenCalledTimes(1);
      expect(onCardClick).toHaveBeenCalledWith(ANIME[1].id);
    } finally {
      unmount();
    }
  });

  test("renders the grid container with the test id even when empty", () => {
    const { container, unmount } = renderWithClient(<AnimeGrid items={[]} />);
    try {
      expect(
        container.querySelector("[data-testid='anime-grid']"),
      ).not.toBeNull();
      expect(
        container.querySelectorAll("[data-testid='anime-card']").length,
      ).toBe(0);
    } finally {
      unmount();
    }
  });
});
