/**
 * Single-image render helper used by `ImageGrid` (ui-design.md §4.2).
 *
 * This component is intentionally pure presentation: it does not read the
 * selection store directly. Callers pass `selected`/`rubberBandPending` so
 * the same component can render inside the grid, inside the image viewer's
 * filmstrip, or anywhere else a thumbnail is needed.
 *
 * Every `<img>` must carry `loading="lazy"`, `decoding="async"` and a
 * `srcSet` built from the shared `fileResizeSrcSet` helper per
 * frontend-design.md §4. The outer wrapper gets the `.tile` class so the
 * global `content-visibility: auto` utility applies.
 */
import { Box, Flex } from "@chakra-ui/react";
import { Check, ImageOff } from "lucide-react";
import { useState } from "react";

import { fileResizeSrcSet, fileResizeUrl } from "../../lib/image-urls";
import type { ImageFile } from "../../types";

export interface ImageThumbnailProps {
  image: ImageFile;
  /** Render at this pixel size; used when the caller is not `ImageGrid`. */
  width?: number;
  height?: number;
  /** Selected images get a primary border + tint + filled checkbox. */
  selected?: boolean;
  /**
   * Pending selection from an in-flight rubber-band drag. Dashed border +
   * lighter tint + half-filled checkbox (ui-design §5.3).
   */
  rubberBandPending?: boolean;
  /**
   * When true the selection checkbox is visible (even if neither `selected`
   * nor `rubberBandPending`). Callers flip this based on their select-mode
   * state; the component stays stateless.
   */
  selectMode?: boolean;
  /**
   * The `sizes` attribute is important for the browser to pick the right
   * srcset entry. Default matches the desktop 5-column / mobile 2-column
   * layout from ui-design §6.1.
   */
  sizes?: string;
  onClick?: (event: React.MouseEvent | React.KeyboardEvent) => void;
}

const DEFAULT_SIZES =
  "(max-width: 640px) 50vw, (max-width: 1023px) 33vw, 20vw";

export function ImageThumbnail({
  image,
  width,
  height,
  selected = false,
  rubberBandPending = false,
  selectMode = false,
  sizes = DEFAULT_SIZES,
  onClick,
}: ImageThumbnailProps): JSX.Element {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    "loading",
  );

  const showCheckbox = selectMode || selected || rubberBandPending;

  return (
    <Box
      className="tile"
      data-testid="image-thumbnail"
      data-file-id={image.id}
      data-selected={selected || undefined}
      data-pending={rubberBandPending || undefined}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-pressed={onClick ? selected : undefined}
      aria-label={image.name}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onClick(event);
              }
            }
          : undefined
      }
      position="relative"
      width={width !== undefined ? `${width}px` : "100%"}
      height={height !== undefined ? `${height}px` : "auto"}
      borderRadius="12px"
      overflow="hidden"
      bg="bg.surfaceAlt"
      cursor={onClick ? "pointer" : "default"}
      // Selected and pending variants layer their tints on top of the img.
      boxShadow={
        selected
          ? "inset 0 0 0 4px var(--chakra-colors-primary)"
          : rubberBandPending
            ? "inset 0 0 0 3px var(--chakra-colors-primary)"
            : undefined
      }
      // Rubber-band pending shows a dashed border via outline so it stacks
      // over the image without shifting layout.
      outline={rubberBandPending ? "3px dashed" : undefined}
      outlineColor={rubberBandPending ? "primary" : undefined}
      outlineOffset="-3px"
      transition="filter 0.15s ease-out"
      _hover={onClick ? { filter: "brightness(1.1)" } : undefined}
      _focusVisible={{
        outline: "2px solid",
        outlineColor: "primary",
        outlineOffset: "2px",
      }}
    >
      {status !== "error" && (
        <img
          src={fileResizeUrl(image.path, 520)}
          srcSet={fileResizeSrcSet(image.path)}
          sizes={sizes}
          alt={image.name}
          loading="lazy"
          decoding="async"
          onLoad={() => setStatus("loaded")}
          onError={() => setStatus("error")}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            display: "block",
          }}
        />
      )}

      {/* Loading skeleton — covers the img while the browser is fetching. */}
      {status === "loading" && (
        <Box
          data-testid="image-thumbnail-skeleton"
          position="absolute"
          inset="0"
          bg="bg.surfaceAlt"
          aria-hidden="true"
        />
      )}

      {/* Error fallback (ui-design §4.2 "Error: Broken image icon"). */}
      {status === "error" && (
        <Flex
          data-testid="image-thumbnail-error"
          position="absolute"
          inset="0"
          align="center"
          justify="center"
          direction="column"
          gap="4px"
          bg="bg.surfaceAlt"
          color="fg.muted"
          role="img"
          aria-label={`Failed to load ${image.name}`}
        >
          <ImageOff size={32} aria-hidden="true" />
        </Flex>
      )}

      {/* Selection tint overlay. */}
      {selected && (
        <Box
          position="absolute"
          inset="0"
          bg="primary"
          opacity="0.15"
          pointerEvents="none"
          aria-hidden="true"
        />
      )}
      {!selected && rubberBandPending && (
        <Box
          position="absolute"
          inset="0"
          bg="primary"
          opacity="0.1"
          pointerEvents="none"
          aria-hidden="true"
        />
      )}

      {/* Selection checkbox (top-right corner). */}
      {showCheckbox && (
        <Flex
          data-testid="image-thumbnail-checkbox"
          data-checked={selected || undefined}
          data-pending={rubberBandPending || undefined}
          position="absolute"
          top="8px"
          right="8px"
          width="22px"
          height="22px"
          borderRadius="6px"
          bg={selected ? "primary" : "rgba(15, 15, 20, 0.6)"}
          color="fg"
          border="2px solid"
          borderColor={selected || rubberBandPending ? "primary" : "border"}
          align="center"
          justify="center"
          pointerEvents="none"
          aria-hidden="true"
        >
          {selected && <Check size={14} strokeWidth={3} />}
          {!selected && rubberBandPending && (
            <Box
              width="10px"
              height="2px"
              bg="primary"
              borderRadius="1px"
              aria-hidden="true"
            />
          )}
        </Flex>
      )}
    </Box>
  );
}

export default ImageThumbnail;
