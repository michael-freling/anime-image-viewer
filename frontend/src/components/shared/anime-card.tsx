/**
 * Anime cards used by the Home grid (ui-design.md §3.1, §4.1; wireframe
 * 01-home-desktop.svg).
 *
 * Two exports:
 *  - `AnimeCard`     -- Netflix-style cover card with gradient overlay,
 *                       title and image count baked in.
 *  - `NewAnimeCard`  -- dashed-border "+ New anime" placeholder used at the
 *                       end of the grid.
 *
 * Cover art: the Wails backend (`internal/frontend/anime.AnimeListItem`) does
 * not currently surface a cover file id or path, so every card falls back to
 * the gradient placeholder (ui-design.md §4.1 "Empty: Gradient placeholder").
 * When the backend ships a cover resolver the card can be extended to render
 * a thumbnail via `fileResizeUrl` / `fileResizeSrcSet`.
 *
 * Both wrap their contents in a `<div class="tile">` so the global
 * content-visibility utility (frontend-design.md §4) applies.
 */
import { Box, Skeleton, Text, chakra } from "@chakra-ui/react";
import { Plus } from "lucide-react";

import { fileResizeUrl, fileResizeSrcSet } from "../../lib/image-urls";

/**
 * `chakra.button` gives us a `<button>` element that accepts the full Chakra
 * style-prop surface while preserving HTML button attributes like `type`.
 */
const CardButton = chakra("button");

import { formatCount } from "../../lib/format";
import type { AnimeSummary } from "../../types";

interface AnimeCardProps {
  anime: AnimeSummary;
  /**
   * Optional click handler. The card itself is rendered as a `<button>`
   * so it is keyboard-focusable and announces its role to screen readers.
   */
  onClick?: () => void;
}

/**
 * Map an arbitrary string to a stable hue 0-360 so cover-less placeholders
 * pick a consistent color per anime.
 */
function hashHue(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  // Force unsigned modulo.
  return Math.abs(h) % 360;
}

export function AnimeCard({
  anime,
  onClick,
}: AnimeCardProps): JSX.Element {
  const initial = anime.name.trim().charAt(0).toUpperCase() || "?";
  const hue = hashHue(anime.name);

  return (
    <CardButton
      type="button"
      onClick={onClick}
      data-testid="anime-card"
      data-anime-id={anime.id}
      aria-label={anime.name}
      // Layout / chrome.
      position="relative"
      display="block"
      width="100%"
      aspectRatio="2 / 3"
      borderRadius="md"
      overflow="hidden"
      bg="bg.surface"
      border="1px solid"
      borderColor="border"
      cursor="pointer"
      p="0"
      textAlign="left"
      transition="transform 0.15s ease-out, box-shadow 0.15s ease-out"
      // Hover / pressed states (ui-design §4.1).
      _hover={{
        transform: "scale(1.02)",
        boxShadow: "0 0 0 2px var(--chakra-colors-primary), 0 8px 24px rgba(0,0,0,0.45)",
      }}
      _active={{ transform: "scale(0.98)" }}
      _focusVisible={{
        outline: "2px solid",
        outlineColor: "primary",
        outlineOffset: "2px",
      }}
    >
      {/* `.tile` opts the cover into content-visibility (frontend-design §4). */}
      <Box className="tile" position="absolute" inset="0">
        {anime.coverImagePath ? (
          <chakra.img
            src={fileResizeUrl(anime.coverImagePath, 520)}
            srcSet={fileResizeSrcSet(anime.coverImagePath)}
            sizes="(min-width: 1920px) 16vw, (min-width: 1024px) 20vw, (min-width: 640px) 33vw, 50vw"
            alt={anime.name}
            width="100%"
            height="100%"
            objectFit="cover"
            loading="lazy"
          />
        ) : (
          <Box
            width="100%"
            height="100%"
            display="flex"
            alignItems="center"
            justifyContent="center"
            css={{
              backgroundImage: `linear-gradient(135deg, hsl(${hue} 50% 68%), hsl(${(hue + 40) % 360} 55% 58%))`,
              ".dark &": {
                backgroundImage: `linear-gradient(135deg, hsl(${hue} 55% 32%), hsl(${(hue + 40) % 360} 65% 18%))`,
              },
            }}
            color="whiteAlpha.800"
          >
            <Text fontSize="48px" fontWeight="700" opacity="0.7">
              {initial}
            </Text>
          </Box>
        )}
      </Box>

      {/* Image-count badge (top-right). */}
      <Box
        position="absolute"
        top="8px"
        right="8px"
        bg="rgba(0, 0, 0, 0.6)"
        color="white"
        borderRadius="pill"
        px="8px"
        py="2px"
        fontSize="10px"
        lineHeight="1.4"
      >
        {anime.imageCount}
      </Box>

      {/* Bottom gradient + title overlay. */}
      <Box
        position="absolute"
        left="0"
        right="0"
        bottom="0"
        padding="12px"
        backgroundImage="linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0) 100%)"
        textAlign="left"
        pointerEvents="none"
      >
        <Text
          fontSize="14px"
          fontWeight="600"
          color="white"
          lineClamp={2}
          textShadow="0 1px 2px rgba(0,0,0,0.6)"
        >
          {anime.name}
        </Text>
        <Text fontSize="10px" color="whiteAlpha.700" mt="2px">
          {formatCount(anime.imageCount, "image", "images")}
        </Text>
      </Box>
    </CardButton>
  );
}

interface NewAnimeCardProps {
  onClick: () => void;
  /** Optional override for the visible label. */
  label?: string;
}

export function NewAnimeCard({
  onClick,
  label = "New anime",
}: NewAnimeCardProps): JSX.Element {
  return (
    <CardButton
      type="button"
      onClick={onClick}
      data-testid="new-anime-card"
      aria-label={label}
      position="relative"
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      gap="8px"
      width="100%"
      aspectRatio="2 / 3"
      borderRadius="md"
      bg="bg.surfaceAlt"
      color="fg.secondary"
      border="2px dashed"
      borderColor="border"
      cursor="pointer"
      transition="border-color 0.15s ease-out, transform 0.15s ease-out, color 0.15s ease-out"
      _hover={{
        borderColor: "primary",
        color: "primary",
        transform: "scale(1.02)",
      }}
      _active={{ transform: "scale(0.98)" }}
      _focusVisible={{
        outline: "2px solid",
        outlineColor: "primary",
        outlineOffset: "2px",
      }}
    >
      <Plus size={32} aria-hidden="true" />
      <Text fontSize="14px" fontWeight="500">
        {label}
      </Text>
    </CardButton>
  );
}

interface AnimeCardSkeletonProps {
  /** Optional accessible label override; defaults to "Loading anime". */
  label?: string;
}

/**
 * Loading-state placeholder matching `AnimeCard`'s footprint. Exported as a
 * named convenience for grid skeletons (ui-design §4.1 "Loading: Skeleton").
 */
export function AnimeCardSkeleton({
  label = "Loading anime",
}: AnimeCardSkeletonProps = {}): JSX.Element {
  return (
    <Skeleton
      data-testid="anime-card-skeleton"
      aria-label={label}
      width="100%"
      borderRadius="md"
      aspectRatio="2 / 3"
    />
  );
}

export default AnimeCard;
