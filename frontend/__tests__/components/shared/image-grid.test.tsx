/**
 * Tests for the virtualized `ImageGrid` (react-window + AutoSizer).
 *
 * Proves:
 *   - Renders the correct number of thumbnails for the visible viewport.
 *   - Forwards the underlying MouseEvent alongside the clicked ImageFile.
 *   - Shows the `emptyState` node when the image list is empty.
 *   - Passes selectedIds / pendingIds down so thumbnails mark themselves
 *     selected / pending appropriately.
 *   - Outer container has the expected data-testid and layout attribute.
 *
 * AutoSizer is mocked to provide fixed dimensions (1000x800) since jsdom
 * has no real layout engine. react-window's FixedSizeGrid is used directly
 * (not mocked) so that the Cell render function is exercised.
 */
import * as React from "react";
import { act } from "react-dom/test-utils";

// Mock AutoSizer to provide a fixed width/height in jsdom.
// react-virtualized-auto-sizer v2 uses a `renderProp` API rather than
// children-as-function.
jest.mock("react-virtualized-auto-sizer", () => {
  const ReactModule = jest.requireActual<typeof import("react")>("react");
  return {
    __esModule: true,
    AutoSizer: ({
      renderProp,
    }: {
      renderProp: (size: {
        height: number | undefined;
        width: number | undefined;
      }) => React.ReactNode;
    }) =>
      ReactModule.createElement(
        "div",
        {
          "data-testid": "auto-sizer-mock",
          style: { width: 1000, height: 800 },
        },
        renderProp({ height: 800, width: 1000 }),
      ),
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
  test("renders thumbnails for visible images", () => {
    // With width=1000 and TARGET_CELL_WIDTH=200, we get 5 columns.
    // With height=800 and rowHeight=208, we get ~3.8 visible rows.
    // react-window with overscanRowCount=3 will render more rows.
    // 6 images with 5 columns = 2 rows, all should be rendered.
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

  test("outer container has data-testid='image-grid' with the layout attribute", () => {
    const images = makeImages(2);
    const { container, unmount } = renderWithClient(
      <ImageGrid images={images} layout="columns" />,
    );
    try {
      const grid = container.querySelector("[data-testid='image-grid']");
      expect(grid).not.toBeNull();
      expect(grid?.getAttribute("data-layout")).toBe("columns");
    } finally {
      unmount();
    }
  });

  test("renders many images without crashing (virtualization test)", () => {
    // 100 images should not blow up - only a subset should be in the DOM
    // due to virtualization.
    const images = makeImages(100);
    const { container, unmount } = renderWithClient(
      <ImageGrid images={images} />,
    );
    try {
      const tiles = container.querySelectorAll(
        "[data-testid='image-thumbnail']",
      );
      // With 5 columns, 100 images = 20 rows. Viewport fits ~3.8 rows,
      // plus 3 overscan rows = ~7 rows visible = ~35 thumbnails rendered.
      // The exact count depends on react-window internals, but it should
      // be significantly fewer than 100.
      expect(tiles.length).toBeGreaterThan(0);
      expect(tiles.length).toBeLessThan(100);
    } finally {
      unmount();
    }
  });
});
