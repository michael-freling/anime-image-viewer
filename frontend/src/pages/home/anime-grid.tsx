/**
 * AnimeGrid — responsive CSS grid that hosts anime cover cards plus a
 * trailing "+ New anime" cell.
 *
 * Column counts mirror ui-design.md §6.1 (Responsive Design) and the brief
 * for Phase D1:
 *   - Mobile   (<640px):  2 columns
 *   - Tablet   (640-1023px): 3 columns
 *   - Desktop  (1024-1919px): 5 columns
 *   - Wide     (>=1920px): 6 columns
 *
 * Rendering modes:
 *   - `skeletonCount`        : render that many `AnimeCardSkeleton`s for the
 *                              initial load. `items` and trailing card are
 *                              hidden while skeletons are visible.
 *   - `items` + `trailing`   : render a card per entry plus the trailing
 *                              NewAnimeCard (or any caller-supplied node).
 *
 * The grid container itself is just a div — no measurement math, no
 * virtualisation — so it plays nicely with the tests' ResizeObserver stub
 * (jest.setup.ts).
 */
import { Box } from "@chakra-ui/react";
import type { ReactNode } from "react";

import {
  AnimeCard,
  AnimeCardSkeleton,
} from "../../components/shared/anime-card";
import type { AnimeSummary } from "../../types";

export interface AnimeGridProps {
  /** Anime records to render as cards. */
  items: AnimeSummary[];
  /** Number of skeleton tiles to render instead of cards. */
  skeletonCount?: number;
  /** Trailing cell (usually `<NewAnimeCard />`). */
  trailing?: ReactNode;
  /** Invoked when a card is clicked. Receives the anime id. */
  onCardClick?: (animeId: number) => void;
}

const GRID_COLUMNS = {
  base: "repeat(2, minmax(0, 1fr))",    // mobile <640
  sm: "repeat(3, minmax(0, 1fr))",      // tablet 640-1023
  lg: "repeat(5, minmax(0, 1fr))",      // desktop 1024-1919
  "2xl": "repeat(6, minmax(0, 1fr))",   // wide >=1920
};

export function AnimeGrid({
  items,
  skeletonCount,
  trailing,
  onCardClick,
}: AnimeGridProps): JSX.Element {
  return (
    <Box
      data-testid="anime-grid"
      display="grid"
      gridTemplateColumns={GRID_COLUMNS}
      gap={{ base: "3", md: "4" }}
      px={{ base: "4", md: "6" }}
      pb={{ base: "6", md: "8" }}
    >
      {skeletonCount !== undefined
        ? Array.from({ length: skeletonCount }).map((_, idx) => (
            <AnimeCardSkeleton key={`skeleton-${idx}`} />
          ))
        : (
          <>
            {items.map((anime) => (
              <AnimeCard
                key={anime.id}
                anime={anime}
                onClick={
                  onCardClick ? () => onCardClick(anime.id) : undefined
                }
              />
            ))}
            {trailing}
          </>
        )}
    </Box>
  );
}

export default AnimeGrid;
