/**
 * Virtualized image grid using `react-window` FixedSizeGrid + AutoSizer.
 *
 * Replaces the previous `react-photo-album` implementation which rendered all
 * DOM nodes at once and became unresponsive at 500+ images. Uses
 * `react-virtualized-auto-sizer` to fill the available space and
 * `react-window`'s `FixedSizeGrid` to only render visible cells.
 *
 * Responsibilities:
 *   - Fill available container space via AutoSizer.
 *   - Calculate columns based on container width (~200px per thumbnail,
 *     min 2, max 6).
 *   - Render each cell with `<ImageThumbnail>` with selection/pending states.
 *   - Forward click events back to the caller.
 *   - Show `emptyState` when there are no images.
 */
import { Box } from "@chakra-ui/react";
import { AutoSizer } from "react-virtualized-auto-sizer";
import { FixedSizeGrid, type GridChildComponentProps } from "react-window";

import type { ImageFile } from "../../types";

import { ImageThumbnail } from "./image-thumbnail";

export type ImageGridLayout = "masonry" | "rows" | "columns";

export interface ColumnsByBreakpoint {
  mobile: number;
  tablet: number;
  desktop: number;
  wide: number;
}

export const DEFAULT_COLUMNS_BY_BREAKPOINT: ColumnsByBreakpoint = {
  mobile: 2,
  tablet: 4,
  desktop: 5,
  wide: 6,
};

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
  columnsByBreakpoint?: ColumnsByBreakpoint;
  /**
   * Layout variant. Kept for API compatibility with callers that pass it,
   * but the virtualized grid always renders a fixed-size grid layout.
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

/** Target width for each thumbnail cell. */
const TARGET_CELL_WIDTH = 200;

/** Minimum columns. */
const MIN_COLUMNS = 2;

/** Maximum columns. */
const MAX_COLUMNS = 6;

/** Row height includes the cell plus gap. */
const CELL_HEIGHT = 200;

/**
 * Calculate the number of columns based on the container width.
 * Targets ~200px per cell, clamped between 2 and 6.
 */
function calculateColumnCount(containerWidth: number): number {
  const raw = Math.floor(containerWidth / TARGET_CELL_WIDTH);
  return Math.max(MIN_COLUMNS, Math.min(MAX_COLUMNS, raw));
}

/** Data passed to each grid cell via react-window's itemData. */
interface CellData {
  images: ImageFile[];
  columnCount: number;
  selectedIds?: ReadonlySet<number>;
  pendingIds?: ReadonlySet<number>;
  selectMode: boolean;
  onImageClick?: (image: ImageFile, event: React.MouseEvent) => void;
  sizes?: string;
  columnWidth: number;
}

/** A single cell in the virtualized grid. */
function Cell({
  columnIndex,
  rowIndex,
  style,
  data,
}: GridChildComponentProps<CellData>): JSX.Element | null {
  const {
    images,
    columnCount,
    selectedIds,
    pendingIds,
    selectMode,
    onImageClick,
    sizes,
    columnWidth,
  } = data;

  const index = rowIndex * columnCount + columnIndex;
  if (index >= images.length) {
    return <div style={style} />;
  }

  const image = images[index];
  const selected = selectedIds?.has(image.id) ?? false;
  const pending = pendingIds?.has(image.id) ?? false;

  // The cell style from react-window positions the cell absolutely. We add
  // padding inside to create the gap between cells.
  const innerStyle: React.CSSProperties = {
    ...style,
    // Shrink the inner content by the gap amount to create spacing.
    paddingRight: CELL_GAP,
    paddingBottom: CELL_GAP,
    boxSizing: "border-box",
  };

  // The thumbnail size should account for the gap padding.
  const thumbSize = columnWidth - CELL_GAP;

  return (
    <div style={innerStyle}>
      <ImageThumbnail
        image={image}
        width={thumbSize}
        height={thumbSize}
        selected={selected}
        rubberBandPending={pending}
        selectMode={selectMode}
        sizes={sizes}
        onClick={
          onImageClick
            ? (event) => {
                onImageClick(image, event as React.MouseEvent);
              }
            : undefined
        }
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

  return (
    <Box
      data-testid="image-grid"
      data-layout={layout}
      width="100%"
      height="100%"
      minHeight="400px"
      // AutoSizer needs a parent with explicit dimensions to measure.
      // flex: 1 makes this fill remaining space in flex layouts.
      flex="1"
    >
      <AutoSizer
        renderProp={({ height, width }) => {
          if (!width || !height) return null;

          const columnCount = calculateColumnCount(width);
          const columnWidth = Math.floor(width / columnCount);
          const rowCount = Math.ceil(images.length / columnCount);
          // Row height: square cells plus gap.
          const rowHeight = CELL_HEIGHT + CELL_GAP;

          const itemData: CellData = {
            images,
            columnCount,
            selectedIds,
            pendingIds,
            selectMode,
            onImageClick,
            sizes,
            columnWidth,
          };

          return (
            <FixedSizeGrid
              columnCount={columnCount}
              columnWidth={columnWidth}
              height={height}
              width={width}
              rowCount={rowCount}
              rowHeight={rowHeight}
              overscanRowCount={3}
              itemData={itemData}
            >
              {Cell}
            </FixedSizeGrid>
          );
        }}
      />
    </Box>
  );
}

export default ImageGrid;
