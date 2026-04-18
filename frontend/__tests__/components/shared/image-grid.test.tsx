/**
 * Tests for `ImageGrid` (ui-design §3.2 / §3.4, frontend-design §4).
 *
 * Proves:
 *   - Renders the correct number of thumbnails.
 *   - Forwards the underlying MouseEvent alongside the clicked ImageFile.
 *   - Shows the `emptyState` node when the image list is empty.
 *   - Passes selectedIds / pendingIds down so thumbnails mark themselves
 *     selected / pending appropriately.
 *
 * `react-photo-album` ships as pure ESM and its CSS imports are not
 * transformable by ts-jest, so we replace the module with a lightweight
 * stub that calls the `render.image` prop for every photo. Our wrapper's
 * responsibility (composing `photos`, wiring selection, event-forwarding)
 * is still fully exercised.
 */
import * as React from "react";
import { act } from "react-dom/test-utils";

jest.mock("react-photo-album/masonry.css", () => ({}), { virtual: true });
jest.mock("react-photo-album/columns.css", () => ({}), { virtual: true });
jest.mock("react-photo-album/rows.css", () => ({}), { virtual: true });
jest.mock("react-photo-album", () => {
  // `require` is necessary inside this factory because `jest.mock` is hoisted
  // above all imports; the top-level `React` binding is not yet initialised
  // when the factory executes.
  const ReactModule = jest.requireActual<typeof import("react")>("react");
  interface StubProps {
    photos: readonly { key?: string; width?: number; height?: number }[];
    columns?: number | ((containerWidth: number) => number);
    render?: {
      image?: (
        props: unknown,
        context: {
          photo: { key?: string; width?: number; height?: number };
          index: number;
          width: number;
          height: number;
        },
      ) => React.ReactNode;
    };
  }
  const renderPhotos = (props: StubProps) => {
    // When `columns` is a function, evaluate it across our four canonical
    // breakpoints and surface the results as data-* attributes so tests can
    // assert against `breakpointsToColumns`'s mapping.
    const columnAttrs: Record<string, string> = {};
    if (typeof props.columns === "function") {
      columnAttrs["data-columns-mobile"] = String(props.columns(320));
      columnAttrs["data-columns-tablet"] = String(props.columns(800));
      columnAttrs["data-columns-desktop"] = String(props.columns(1440));
      columnAttrs["data-columns-wide"] = String(props.columns(3000));
    }
    return ReactModule.createElement(
      "div",
      { "data-testid": "photo-album-stub", ...columnAttrs },
      props.photos.map((photo, index) =>
        ReactModule.createElement(
          "div",
          { key: photo.key ?? String(index), "data-photo-key": photo.key },
          props.render?.image?.(
            {},
            {
              photo,
              index,
              width: photo.width ?? 0,
              height: photo.height ?? 0,
            },
          ),
        ),
      ),
    );
  };
  return {
    __esModule: true,
    MasonryPhotoAlbum: renderPhotos,
    ColumnsPhotoAlbum: renderPhotos,
    RowsPhotoAlbum: renderPhotos,
  };
});

import { ImageGrid } from "../../../src/components/shared/image-grid";
import type { ImageFile } from "../../../src/types";
import { renderWithClient } from "../../test-utils";

function makeImages(n: number): ImageFile[] {
  return Array.from({ length: n }, (_, i) => ({
    id: 100 + i,
    name: `image-${i}.png`,
    path: `/files/anime/folder/image-${i}.png`,
  }));
}

describe("ImageGrid", () => {
  test("renders one thumbnail per image", () => {
    const images = makeImages(6);
    const { container, unmount } = renderWithClient(
      <ImageGrid images={images} />,
    );
    try {
      const tiles = container.querySelectorAll(
        "[data-testid='image-thumbnail']",
      );
      expect(tiles.length).toBe(6);
    } finally {
      unmount();
    }
  });

  test("shows empty state when images is empty", () => {
    const { container, unmount } = renderWithClient(
      <ImageGrid
        images={[]}
        emptyState={<div data-testid="empty">Nothing here</div>}
      />,
    );
    try {
      expect(container.querySelector("[data-testid='empty']")).not.toBeNull();
      expect(
        container.querySelector("[data-testid='image-thumbnail']"),
      ).toBeNull();
    } finally {
      unmount();
    }
  });

  test("forwards click with the original image and event", () => {
    const images = makeImages(3);
    const onImageClick = jest.fn();
    const { container, unmount } = renderWithClient(
      <ImageGrid images={images} onImageClick={onImageClick} />,
    );
    try {
      const target = container.querySelector<HTMLElement>(
        "[data-file-id='101']",
      );
      expect(target).not.toBeNull();
      act(() => {
        target!.click();
      });
      expect(onImageClick).toHaveBeenCalledTimes(1);
      const [fileArg, eventArg] = onImageClick.mock.calls[0];
      expect(fileArg).toEqual(images[1]);
      // The click event is forwarded as-is.
      expect(typeof eventArg).toBe("object");
    } finally {
      unmount();
    }
  });

  test("passes selectedIds and pendingIds to thumbnails", () => {
    const images = makeImages(4);
    const selectedIds = new Set<number>([100, 102]);
    const pendingIds = new Set<number>([103]);
    const { container, unmount } = renderWithClient(
      <ImageGrid
        images={images}
        selectedIds={selectedIds}
        pendingIds={pendingIds}
      />,
    );
    try {
      // Selected IDs render with data-selected="true".
      const sel100 = container.querySelector("[data-file-id='100']");
      expect(sel100?.getAttribute("data-selected")).toBe("true");
      const sel102 = container.querySelector("[data-file-id='102']");
      expect(sel102?.getAttribute("data-selected")).toBe("true");
      // Pending IDs render with data-pending="true".
      const pend103 = container.querySelector("[data-file-id='103']");
      expect(pend103?.getAttribute("data-pending")).toBe("true");
      // Unselected, non-pending renders without those flags.
      const unmarked = container.querySelector("[data-file-id='101']");
      expect(unmarked?.getAttribute("data-selected")).toBeNull();
      expect(unmarked?.getAttribute("data-pending")).toBeNull();
    } finally {
      unmount();
    }
  });

  test("breakpointsToColumns picks the right column count per width", () => {
    // Drives every branch of `breakpointsToColumns`:
    //   width <  640 → mobile
    //   width <  1024 → tablet
    //   width <  2560 → desktop
    //   else         → wide
    const images = makeImages(2);
    const { container, unmount } = renderWithClient(
      <ImageGrid
        images={images}
        columnsByBreakpoint={{
          mobile: 2,
          tablet: 4,
          desktop: 5,
          wide: 6,
        }}
      />,
    );
    try {
      const stub = container.querySelector(
        "[data-testid='photo-album-stub']",
      );
      expect(stub?.getAttribute("data-columns-mobile")).toBe("2");
      expect(stub?.getAttribute("data-columns-tablet")).toBe("4");
      expect(stub?.getAttribute("data-columns-desktop")).toBe("5");
      expect(stub?.getAttribute("data-columns-wide")).toBe("6");
    } finally {
      unmount();
    }
  });

  test("outer container has data-testid='image-grid' with the layout attribute", () => {
    const images = makeImages(2);
    const { container, unmount } = renderWithClient(
      <ImageGrid images={images} layout="columns" />,
    );
    try {
      const grid = container.querySelector("[data-testid='image-grid']");
      expect(grid?.getAttribute("data-layout")).toBe("columns");
    } finally {
      unmount();
    }
  });
});
