/**
 * Virtualized masonry image grid using `masonic` lower-level hooks.
 *
 * Uses `useMasonry` + `usePositioner` + `useResizeObserver` instead of the
 * high-level `Masonry` component because the app uses container-level scroll
 * (the tab panel has `overflow: auto`), not window-level scroll. The built-in
 * `Masonry` component only listens to `window.scroll` and would never
 * virtualize items in this layout.
 *
 * Each cell height is derived from the image's native aspect ratio (falling
 * back to 1:1 when dimensions are unknown), giving a true masonry layout.
 */
import { Box } from "@chakra-ui/react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  useMasonry,
  usePositioner,
  useResizeObserver,
} from "masonic";

import { useLongPress } from "../../hooks/use-long-press";
import type { ImageFile } from "../../types";
import { ImageThumbnail } from "./image-thumbnail";

export type ImageGridLayout = "masonry" | "rows" | "columns";

export interface ImageGridProps {
  images: ImageFile[];
  selectedIds?: ReadonlySet<number>;
  pendingIds?: ReadonlySet<number>;
  selectMode?: boolean;
  onImageClick?: (image: ImageFile, event: React.MouseEvent) => void;
  onLongPress?: (image: ImageFile) => void;
  layout?: ImageGridLayout;
  emptyState?: React.ReactNode;
  sizes?: string;
  /** Column width in pixels. Defaults to 200. */
  columnWidth?: number;
}

/** Spacing between cells in pixels. */
const CELL_GAP = 8;

/** Target width for each thumbnail column. */
const TARGET_CELL_WIDTH = 200;

interface GridSharedState {
  selectedIds?: ReadonlySet<number>;
  pendingIds?: ReadonlySet<number>;
  selectMode: boolean;
  onImageClick?: (image: ImageFile, event: React.MouseEvent) => void;
  onLongPress?: (image: ImageFile) => void;
  sizes?: string;
}

const GridContext = React.createContext<GridSharedState>({
  selectMode: false,
});

function MasonryCard({
  data,
  width,
}: {
  data: ImageFile;
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
  } = React.useContext(GridContext);

  const image = data;

  const selected = selectedIds?.has(image.id) ?? false;
  const pending = pendingIds?.has(image.id) ?? false;

  const aspectRatio =
    image.width && image.height ? image.width / image.height : 1;
  const height = Math.round(width / aspectRatio);

  const handleLongPress = useCallback(() => {
    onLongPressProp?.(image);
  }, [onLongPressProp, image]);

  const longPressHandlers = useLongPress({ onLongPress: handleLongPress });

  const handleClick = useCallback(
    (event: React.MouseEvent | React.KeyboardEvent) => {
      if (longPressHandlers.firedRef.current) {
        longPressHandlers.firedRef.current = false;
        return;
      }
      onImageClick?.(image, event as React.MouseEvent);
    },
    [onImageClick, image, longPressHandlers.firedRef],
  );

  return (
    <div
      {...longPressHandlers}
      style={{ touchAction: "none" }}
    >
      <ImageThumbnail
        image={image}
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

/**
 * Hook that tracks scroll position on a container element instead of window.
 * masonic's built-in `useScroller` only listens to window scroll.
 */
function useContainerScroller(containerRef: React.RefObject<HTMLElement | null>) {
  const [scrollTop, setScrollTop] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let timeout: ReturnType<typeof setTimeout>;
    const handleScroll = () => {
      setScrollTop(el.scrollTop);
      setIsScrolling(true);
      clearTimeout(timeout);
      timeout = setTimeout(() => setIsScrolling(false), 150);
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", handleScroll);
      clearTimeout(timeout);
    };
  }, [containerRef]);

  return { scrollTop, isScrolling };
}

/**
 * Hook that tracks a container element's content dimensions via ResizeObserver.
 */
function useContainerSize(containerRef: React.RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver(([entry]) => {
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);

  return size;
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
  columnWidth,
}: ImageGridProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const { width, height } = useContainerSize(containerRef);
  const { scrollTop, isScrolling } = useContainerScroller(containerRef);

  const effectiveColumnWidth = columnWidth ?? TARGET_CELL_WIDTH;

  const sharedState = useMemo<GridSharedState>(
    () => ({ selectedIds, pendingIds, selectMode, onImageClick, onLongPress, sizes }),
    [selectedIds, pendingIds, selectMode, onImageClick, onLongPress, sizes],
  );

  const positioner = usePositioner(
    { width, columnWidth: effectiveColumnWidth, columnGutter: CELL_GAP },
    [images, effectiveColumnWidth],
  );
  const resizeObserver = useResizeObserver(positioner);

  const masonryContent = useMasonry({
    positioner,
    resizeObserver,
    items: images,
    height,
    scrollTop,
    isScrolling,
    containerRef,
    render: MasonryCard,
    itemKey: (data: ImageFile) => data.id,
    overscanBy: 3,
  });

  if (images.length === 0) {
    return (
      <Box data-testid="image-grid-empty" width="100%">
        {emptyState}
      </Box>
    );
  }

  return (
    <GridContext.Provider value={sharedState}>
      <Box
        ref={containerRef}
        data-testid="image-grid"
        data-layout={layout}
        width="100%"
        height="100%"
        flex="1"
        minHeight="0"
        overflow="auto"
      >
        {masonryContent}
      </Box>
    </GridContext.Provider>
  );
}

export default ImageGrid;
