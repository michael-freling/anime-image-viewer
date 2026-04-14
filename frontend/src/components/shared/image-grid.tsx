/**
 * Wrapper around `react-photo-album`'s responsive photo albums (ui-design
 * §3.2 / §3.4, frontend-design §4).
 *
 * Responsibilities:
 *   - Compose `ImageFile` objects into the shape `react-photo-album`
 *     expects, embedding our `srcSet` and `sizes` so the browser always
 *     picks the right thumbnail width.
 *   - Render each photo with `<ImageThumbnail>` via the `render.image` prop
 *     so selection / rubber-band / error states work.
 *   - Forward the original `MouseEvent` back to the caller on click.
 *   - Show an `emptyState` node when there are no photos.
 *
 * Per frontend-design.md §4 we deliberately do NOT virtualise here — the
 * grid renders all tiles and relies on `loading="lazy"` +
 * `content-visibility: auto` on `.tile` wrappers to keep memory low.
 */
import { Box } from "@chakra-ui/react";
import {
  ColumnsPhotoAlbum,
  MasonryPhotoAlbum,
  RowsPhotoAlbum,
  type Photo,
  type Render,
} from "react-photo-album";
import "react-photo-album/masonry.css";
import "react-photo-album/columns.css";
import "react-photo-album/rows.css";

import { THUMBNAIL_WIDTHS } from "../../lib/constants";
import { thumbnailUrl } from "../../lib/image-urls";
import type { ImageFile } from "../../types";

import { ImageThumbnail } from "./image-thumbnail";

export type ImageGridLayout = "masonry" | "rows" | "columns";

export interface ColumnsByBreakpoint {
  mobile: number;
  tablet: number;
  desktop: number;
  wide: number;
}

/**
 * Default column counts per ui-design §6.1.
 *
 *   mobile   (0-639)      : 2
 *   tablet   (640-1023)   : 4
 *   desktop  (1024-2559)  : 5
 *   wide     (2560+)      : 6
 *
 * `react-photo-album` selects the largest breakpoint `<= containerWidth`,
 * so we key the returned counts by the minimum container width.
 */
export const DEFAULT_COLUMNS_BY_BREAKPOINT: ColumnsByBreakpoint = {
  mobile: 2,
  tablet: 4,
  desktop: 5,
  wide: 6,
};

/**
 * Extended Photo shape that lets us round-trip back to the original
 * `ImageFile` inside the render callback.
 */
interface ImageFilePhoto extends Photo {
  file: ImageFile;
}

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
  /** Layout variant. Defaults to `"masonry"`. */
  layout?: ImageGridLayout;
  /** Shown when `images.length === 0`. Receives no props. */
  emptyState?: React.ReactNode;
  /**
   * `sizes` attribute forwarded to each `<img>`. Defaults to the ui-design
   * §6.1 breakpoint layout.
   */
  sizes?: string;
}

/**
 * Fall back to a reasonable 1:1 aspect-ratio box (520x520) when the backend
 * hasn't provided pixel dimensions. `react-photo-album`'s masonry layout
 * uses the ratio, not the absolute numbers, to pack tiles.
 */
function toPhoto(image: ImageFile): ImageFilePhoto {
  const src = thumbnailUrl(image.id, THUMBNAIL_WIDTHS[0]);
  return {
    key: String(image.id),
    src,
    width: 520,
    height: 520,
    alt: image.name,
    file: image,
    srcSet: THUMBNAIL_WIDTHS.map((w) => ({
      src: thumbnailUrl(image.id, w),
      width: w,
      // Square assumption keeps the declared srcSet dimensions consistent.
      height: w,
    })),
  };
}

function breakpointsToColumns(columns: ColumnsByBreakpoint) {
  return (containerWidth: number): number => {
    if (containerWidth < 640) return columns.mobile;
    if (containerWidth < 1024) return columns.tablet;
    if (containerWidth < 2560) return columns.desktop;
    return columns.wide;
  };
}

export function ImageGrid({
  images,
  selectedIds,
  pendingIds,
  selectMode = false,
  onImageClick,
  columnsByBreakpoint = DEFAULT_COLUMNS_BY_BREAKPOINT,
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

  const photos = images.map(toPhoto);
  const columns = breakpointsToColumns(columnsByBreakpoint);

  const renderImage: Render<ImageFilePhoto>["image"] = (_props, context) => {
    const { photo } = context;
    const file = photo.file;
    const selected = selectedIds?.has(file.id) ?? false;
    const pending = pendingIds?.has(file.id) ?? false;
    return (
      <ImageThumbnail
        image={file}
        selected={selected}
        rubberBandPending={pending}
        selectMode={selectMode}
        sizes={sizes}
        onClick={
          onImageClick
            ? (event) => {
                // ImageThumbnail may forward KeyboardEvent too; MasonryPhotoAlbum
                // only triggers image clicks via pointer, so re-narrowing to
                // MouseEvent is safe here.
                onImageClick(file, event as React.MouseEvent);
              }
            : undefined
        }
      />
    );
  };

  const albumProps = {
    photos,
    spacing: 8,
    padding: 0,
    columns,
    render: { image: renderImage },
  } as const;

  return (
    <Box data-testid="image-grid" data-layout={layout} width="100%">
      {layout === "masonry" && <MasonryPhotoAlbum {...albumProps} />}
      {layout === "columns" && <ColumnsPhotoAlbum {...albumProps} />}
      {layout === "rows" && (
        <RowsPhotoAlbum
          photos={photos}
          spacing={8}
          padding={0}
          render={{ image: renderImage }}
        />
      )}
    </Box>
  );
}

export default ImageGrid;
