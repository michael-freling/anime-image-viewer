/**
 * Tests for the virtualized `ImageGrid` (masonic Masonry).
 *
 * Proves:
 *   - Renders the correct number of thumbnails for all provided images.
 *   - Forwards the underlying MouseEvent alongside the clicked ImageFile.
 *   - Shows the `emptyState` node when the image list is empty.
 *   - Passes selectedIds / pendingIds down so thumbnails mark themselves
 *     selected / pending appropriately.
 *   - Outer container has the expected data-testid and layout attribute.
 *
 * Masonic is mocked to render all items synchronously since jsdom has no
 * real IntersectionObserver or window scroll events.
 */
import * as React from "react";
import { act } from "react-dom/test-utils";

// Mock masonic hooks to render all items synchronously in jsdom (no real
// IntersectionObserver, ResizeObserver, or scroll events).
jest.mock("masonic", () => {
  const ReactModule = jest.requireActual<typeof import("react")>("react");
  return {
    __esModule: true,
    useMasonry: ({ items, render: Render, itemKey }: { items: unknown[]; render: React.ComponentType<{ data: unknown; width: number; index: number }>; itemKey?: (data: unknown) => unknown; [k: string]: unknown }) =>
      ReactModule.createElement(
        "div",
        { "data-testid": "masonry-mock" },
        (items as unknown[]).map((item, index) =>
          ReactModule.createElement(Render, { key: itemKey ? (itemKey(item) as React.Key) : index, data: item, width: 200, index }),
        ),
      ),
    usePositioner: () => ({}),
    useResizeObserver: () => ({}),
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
    width: 800,
    height: 600,
  }));
}

describe("ImageGrid", () => {
  test("renders thumbnails for all images", () => {
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

  test("renders many images without crashing", () => {
    // 100 images should not blow up. With the mock all items are rendered.
    const images = makeImages(100);
    const { container, unmount } = renderWithClient(
      <ImageGrid images={images} />,
    );
    try {
      const tiles = container.querySelectorAll(
        "[data-testid='image-thumbnail']",
      );
      expect(tiles.length).toBe(100);
    } finally {
      unmount();
    }
  });
});
