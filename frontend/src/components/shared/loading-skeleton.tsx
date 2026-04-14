/**
 * Shape-specific skeleton placeholders.
 *
 * Spec: ui-design.md §4.1 "Loading: Skeleton placeholder" and §4.2
 * "Loading: Skeleton". Each component mirrors the resting layout of the
 * real component it stands in for, so the grid doesn't shift when the data
 * finishes loading.
 *
 * The shimmer animation is disabled under `prefers-reduced-motion: reduce`
 * per ui-design.md §7 accessibility rules. We scope the keyframes + the
 * media query override to a local `<style>` block so we don't depend on
 * globals.css.
 */
import type { ReactElement } from "react";
import { Box, Skeleton, Stack } from "@chakra-ui/react";

const SHIMMER_CSS = `
@keyframes animevault-skeleton-shimmer {
  0%   { opacity: 0.6; }
  50%  { opacity: 1;   }
  100% { opacity: 0.6; }
}
.animevault-skeleton {
  animation: animevault-skeleton-shimmer 1.4s ease-in-out infinite;
  background: var(--chakra-colors-bg-surfaceAlt);
  border-radius: var(--chakra-radii-md, 10px);
}
@media (prefers-reduced-motion: reduce) {
  .animevault-skeleton {
    animation: none !important;
  }
}
`;

function ShimmerCss(): ReactElement {
  return <style data-testid="animevault-skeleton-style">{SHIMMER_CSS}</style>;
}

/**
 * Cover card sized for the Home grid. Matches the aspect ratio of the
 * real `AnimeCard`: 3:4 portrait with a small title band at the bottom.
 */
export function AnimeCardSkeleton(): ReactElement {
  return (
    <>
      <ShimmerCss />
      <Skeleton
        data-testid="anime-card-skeleton"
        className="animevault-skeleton"
        width="full"
        aspectRatio="3 / 4"
        borderRadius="lg"
      />
    </>
  );
}

/**
 * Generic thumbnail placeholder. Defaults to a 4:3 aspect ratio which
 * matches the mean of the masonry cards on the Search wireframe; callers
 * can override via the `aspectRatio` prop.
 */
export interface ImageThumbnailSkeletonProps {
  aspectRatio?: string;
}

export function ImageThumbnailSkeleton(
  props: ImageThumbnailSkeletonProps,
): ReactElement {
  const { aspectRatio = "4 / 3" } = props;
  return (
    <>
      <ShimmerCss />
      <Skeleton
        data-testid="image-thumbnail-skeleton"
        className="animevault-skeleton"
        width="full"
        aspectRatio={aspectRatio}
        borderRadius="md"
      />
    </>
  );
}

/**
 * Tag chip placeholder — pill shaped, short.
 */
export function TagChipSkeleton(): ReactElement {
  return (
    <>
      <ShimmerCss />
      <Skeleton
        data-testid="tag-chip-skeleton"
        className="animevault-skeleton"
        height="24px"
        width="96px"
        borderRadius="pill"
      />
    </>
  );
}

/**
 * Generic list row placeholder: title line + subtitle line.
 */
export interface RowSkeletonProps {
  lines?: number;
}

export function RowSkeleton(props: RowSkeletonProps): ReactElement {
  const { lines = 2 } = props;
  const widths = ["65%", "40%", "55%", "35%"];
  return (
    <>
      <ShimmerCss />
      <Box
        data-testid="row-skeleton"
        width="full"
        py="2"
        px="3"
      >
        <Stack gap="2">
          {Array.from({ length: lines }).map((_, i) => (
            <Skeleton
              key={i}
              className="animevault-skeleton"
              height="12px"
              width={widths[i % widths.length]}
              borderRadius="sm"
            />
          ))}
        </Stack>
      </Box>
    </>
  );
}
