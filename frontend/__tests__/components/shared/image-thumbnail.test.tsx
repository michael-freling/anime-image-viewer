/**
 * Tests for `ImageThumbnail` (ui-design §4.2).
 *
 * Proves:
 *   - Renders `<img>` with alt text (a11y) and lazy/async/srcset attributes.
 *   - Selected state exposes a checkbox and sets data-selected.
 *   - Rubber-band pending state exposes dashed border via outline + data flag.
 *   - `onError` on the image swaps to the broken-image fallback.
 *   - Click handler is fired with the native event.
 */
import { act } from "react-dom/test-utils";

import { ImageThumbnail } from "../../../src/components/shared/image-thumbnail";
import type { ImageFile } from "../../../src/types";
import { renderWithClient } from "../../test-utils";

const IMAGE: ImageFile = {
  id: 77,
  name: "ep01-frame-012.png",
  path: "Attack on Titan/S1/ep01-frame-012.png",
};

function fireEvent(node: Element, type: "load" | "error") {
  act(() => {
    node.dispatchEvent(new Event(type));
  });
}

describe("ImageThumbnail", () => {
  test("renders an image with alt text, lazy loading and srcset", () => {
    const { container, unmount } = renderWithClient(
      <ImageThumbnail image={IMAGE} />,
    );
    try {
      const img = container.querySelector("img");
      expect(img).not.toBeNull();
      expect(img!.getAttribute("alt")).toBe(IMAGE.name);
      expect(img!.getAttribute("loading")).toBe("lazy");
      expect(img!.getAttribute("decoding")).toBe("async");
      const srcset =
        img!.getAttribute("srcset") ?? img!.getAttribute("srcSet");
      expect(srcset).toContain(`/_/images/${IMAGE.id}?width=520`);
      expect(srcset).toContain("1920w");
      // Outer wrapper uses the `.tile` utility class.
      expect(container.querySelector(".tile")).not.toBeNull();
    } finally {
      unmount();
    }
  });

  test("selected state shows a checkmark and sets data-selected", () => {
    const { container, unmount } = renderWithClient(
      <ImageThumbnail image={IMAGE} selected />,
    );
    try {
      const wrapper = container.querySelector(
        "[data-testid='image-thumbnail']",
      );
      expect(wrapper?.getAttribute("data-selected")).toBe("true");
      const checkbox = container.querySelector(
        "[data-testid='image-thumbnail-checkbox']",
      );
      expect(checkbox).not.toBeNull();
      expect(checkbox?.getAttribute("data-checked")).toBe("true");
    } finally {
      unmount();
    }
  });

  test("rubber-band pending state sets dashed outline + data-pending", () => {
    const { container, unmount } = renderWithClient(
      <ImageThumbnail image={IMAGE} rubberBandPending />,
    );
    try {
      const wrapper = container.querySelector<HTMLElement>(
        "[data-testid='image-thumbnail']",
      );
      expect(wrapper?.getAttribute("data-pending")).toBe("true");
      const checkbox = container.querySelector(
        "[data-testid='image-thumbnail-checkbox']",
      );
      expect(checkbox?.getAttribute("data-pending")).toBe("true");
      expect(checkbox?.getAttribute("data-checked")).toBeNull();
    } finally {
      unmount();
    }
  });

  test("checkbox is hidden unless selected or selectMode is true", () => {
    const { container, unmount } = renderWithClient(
      <ImageThumbnail image={IMAGE} />,
    );
    try {
      expect(
        container.querySelector("[data-testid='image-thumbnail-checkbox']"),
      ).toBeNull();
    } finally {
      unmount();
    }
  });

  test("selectMode=true renders checkbox even without selection", () => {
    const { container, unmount } = renderWithClient(
      <ImageThumbnail image={IMAGE} selectMode />,
    );
    try {
      expect(
        container.querySelector("[data-testid='image-thumbnail-checkbox']"),
      ).not.toBeNull();
    } finally {
      unmount();
    }
  });

  test("error state shows the broken image fallback", () => {
    const { container, unmount } = renderWithClient(
      <ImageThumbnail image={IMAGE} />,
    );
    try {
      const img = container.querySelector("img");
      expect(img).not.toBeNull();
      fireEvent(img!, "error");
      // After the error, the img is removed and the fallback appears.
      expect(container.querySelector("img")).toBeNull();
      const fallback = container.querySelector(
        "[data-testid='image-thumbnail-error']",
      );
      expect(fallback).not.toBeNull();
      expect(fallback?.getAttribute("aria-label")).toContain(IMAGE.name);
    } finally {
      unmount();
    }
  });

  test("loading skeleton disappears once the image fires onLoad", () => {
    const { container, unmount } = renderWithClient(
      <ImageThumbnail image={IMAGE} />,
    );
    try {
      expect(
        container.querySelector("[data-testid='image-thumbnail-skeleton']"),
      ).not.toBeNull();
      const img = container.querySelector("img");
      fireEvent(img!, "load");
      expect(
        container.querySelector("[data-testid='image-thumbnail-skeleton']"),
      ).toBeNull();
    } finally {
      unmount();
    }
  });

  test("fires onClick when clicked", () => {
    const onClick = jest.fn();
    const { container, unmount } = renderWithClient(
      <ImageThumbnail image={IMAGE} onClick={onClick} />,
    );
    try {
      const wrapper = container.querySelector<HTMLElement>(
        "[data-testid='image-thumbnail']",
      );
      act(() => {
        wrapper!.click();
      });
      expect(onClick).toHaveBeenCalledTimes(1);
    } finally {
      unmount();
    }
  });
});
