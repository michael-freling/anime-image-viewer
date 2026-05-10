/**
 * Virtualized masonry image grid using `masonic`.
 *
 * Replaces the previous `react-window` FixedSizeGrid which forced all cells to
 * a fixed 200x200px square. `masonic` computes column count from the container
 * width and virtualizes rendering via IntersectionObserver + a position cache.
 *
 * Each cell height is derived from the image's native aspect ratio (falling
 * back to 1:1 when dimensions are unknown), giving a true masonry layout.
 *
 * Responsibilities:
 *   - Render a masonry grid of image thumbnails sized to their aspect ratios.
 *   - Virtualize rendering so only visible cells are in the DOM.
 *   - Forward click / long-press events back to the caller.
 *   - Show `emptyState` when there are no images.
 */
import { Box } from "@chakra-ui/react";
import { useCallback, useMemo } from "react";
import { Masonry } from "masonic";

import { useLongPress } from "../../hooks/use-long-press";
import type { ImageFile } from "../../types";
import { ImageThumbnail } from "./image-thumbnail";

export type ImageGridLayout = "masonry" | "rows" | "columns";

export interface ImageGridProps {
  images: ImageFile[];
  /** Image IDs currently in the selection store. */
  selectedIds?: ReadonlySet<number>;
  /** Image IDs inside the live rubber-band rectangle. */
  pendingIds?: ReadonlySet<number>;
  /**
   * When true, thumbnails render their selection checkbox even when not
   * individually selected (the caller is in select mode).
   */
  selectMode?: boolean;
  /** Click handler for a single image. Receives the native event. */
  onImageClick?: (image: ImageFile, event: React.MouseEvent) => void;
  /** Long-press handler for a single image (used to enter select mode). */
  onLongPress?: (image: ImageFile) => void;
  /**
   * Layout variant. Kept for API compatibility with callers that pass it,
   * but the virtualized grid always renders a masonry layout.
   */
  layout?: ImageGridLayout;
  /** Shown when `images.length === 0`. Receives no props. */
  emptyState?: React.ReactNode;
  /**
   * `sizes` attribute forwarded to each `<img>`. Defaults to the ui-design
   * §6.1 breakpoint layout.
   */
  sizes?: string;
}

/** Spacing between cells in pixels. */
const CELL_GAP = 8;

/** Target width for each thumbnail column. */
const TARGET_CELL_WIDTH = 200;

/**
 * Data shape passed to each masonry cell. Extends ImageFile with the shared
 * props that every cell needs so masonic's render component can access them
 * without external closures (masonic memoizes render components aggressively).
 */
interface MasonryItemData extends ImageFile {
  selectedIds?: ReadonlySet<number>;
  pendingIds?: ReadonlySet<number>;
  selectMode: boolean;
  onImageClick?: (image: ImageFile, event: React.MouseEvent) => void;
  onLongPress?: (image: ImageFile) => void;
  sizes?: string;
}

function MasonryCard({
  data,
  width,
}: {
  data: MasonryItemData;
  width: number;
  index: number;
}) {
  const {
    selectedIds,
    pendingIds,
    selectMode,
    onImageClick,
    onLongPress: onLongPressProp,
    sizes,
    ...image
  } = data;

  const selected = selectedIds?.has(image.id) ?? false;
  const pending = pendingIds?.has(image.id) ?? false;

  // Compute height from aspect ratio; fallback to square when unknown.
  const aspectRatio =
    image.width && image.height ? image.width / image.height : 1;
  const height = Math.round(width / aspectRatio);

  const handleLongPress = useCallback(() => {
    onLongPressProp?.(image as ImageFile);
  }, [onLongPressProp, image]);

  const longPressHandlers = useLongPress({ onLongPress: handleLongPress });

  const handleClick = useCallback(
    (event: React.MouseEvent | React.KeyboardEvent) => {
      if (longPressHandlers.firedRef.current) {
        longPressHandlers.firedRef.current = false;
        return;
      }
      onImageClick?.(image as ImageFile, event as React.MouseEvent);
    },
    [onImageClick, image, longPressHandlers.firedRef],
  );

  return (
    <div
      {...longPressHandlers}
      style={{ touchAction: "none" }}
    >
      <ImageThumbnail
        image={image as ImageFile}
        width={width}
        height={height}
        selected={selected}
        rubberBandPending={pending}
        selectMode={selectMode}
        sizes={sizes}
        onClick={handleClick}
      />
    </div>
  );
}

export function ImageGrid({
  images,
  selectedIds,
  pendingIds,
  selectMode = false,
  onImageClick,
  onLongPress,
  layout = "masonry",
  emptyState,
  sizes,
}: ImageGridProps): JSX.Element {
  if (images.length === 0) {
    return (
      <Box data-testid="image-grid-empty" width="100%">
        {emptyState}
      </Box>
    );
  }

  // Enrich each image with shared props so MasonryCard can access them.
  // masonic requires each item to have a unique `id` field (which ImageFile
  // already provides).
  const items: MasonryItemData[] = useMemo(
    () =>
      images.map((img) => ({
        ...img,
        selectedIds,
        pendingIds,
        selectMode,
        onImageClick,
        onLongPress,
        sizes,
      })),
    [images, selectedIds, pendingIds, selectMode, onImageClick, onLongPress, sizes],
  );

  return (
    <Box
      data-testid="image-grid"
      data-layout={layout}
      width="100%"
      height="100%"
      flex="1"
      minHeight="0"
      overflow="auto"
    >
      <Masonry
        items={items}
        columnGutter={CELL_GAP}
        columnWidth={TARGET_CELL_WIDTH}
        overscanBy={3}
        render={MasonryCard}
        itemKey={(data) => data.id}
      />
    </Box>
  );
}

export default ImageGrid;
