/**
 * Tests for `ImageViewerOverlay`.
 *
 * Spec: ui-design.md §3.3 (minimal full-screen viewer) + frontend-design.md
 * §4 (prefetch strategy).
 *
 * `react-zoom-pan-pinch` ships as ESM with internals that crash jsdom's
 * layout engine, so we replace it with pass-through stubs at module level
 * (per the Phase E1 task spec). `useImagePrefetch` is spied so we can
 * assert the arguments passed to it without actually creating detached
 * `Image` objects.
 *
 * `useHotkeys` from `@mantine/hooks` attaches to `document.documentElement`
 * — the command-palette test already proves this works; we drive
 * keypresses the same way.
 */

// --- Mocks (must be declared before any imports that pull them in) ----------

jest.mock("react-zoom-pan-pinch", () => ({
  __esModule: true,
  TransformWrapper: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  TransformComponent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

const useImagePrefetchMock = jest.fn();
jest.mock("../../../src/hooks/use-image-prefetch", () => ({
  __esModule: true,
  useImagePrefetch: (...args: unknown[]) => useImagePrefetchMock(...args),
}));

// --- Imports ----------------------------------------------------------------

import { ChakraProvider } from "@chakra-ui/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { act } from "react-dom/test-utils";
import { MemoryRouter } from "react-router";

import { ImageViewerOverlay } from "../../../src/components/image-viewer/image-viewer-overlay";
import system from "../../../src/styles/theme";
import type { ImageFile } from "../../../src/types";
import { flushPromises, renderWithClient } from "../../test-utils";

const IMAGES: ImageFile[] = [
  { id: 10, name: "first.png", path: "anime/first.png" },
  { id: 20, name: "second.png", path: "anime/second.png" },
  { id: 30, name: "third.png", path: "anime/third.png" },
];

function byTestId(container: HTMLElement, id: string): HTMLElement | null {
  return container.querySelector(`[data-testid="${id}"]`);
}

function dispatchKey(key: string): void {
  act(() => {
    document.documentElement.dispatchEvent(
      new KeyboardEvent("keydown", { key, code: key, bubbles: true }),
    );
  });
}

beforeEach(() => {
  useImagePrefetchMock.mockReset();
});

describe("ImageViewerOverlay", () => {
  test("renders nothing when open=false", () => {
    const r = renderWithClient(
      <ImageViewerOverlay
        open={false}
        images={IMAGES}
        currentIndex={0}
        onIndexChange={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    try {
      expect(byTestId(r.container, "image-viewer-overlay")).toBeNull();
      // Image element is not mounted either.
      expect(r.container.querySelector("img")).toBeNull();
    } finally {
      r.unmount();
    }
  });

  test("renders nothing when images list is empty", () => {
    const r = renderWithClient(
      <ImageViewerOverlay
        open
        images={[]}
        currentIndex={0}
        onIndexChange={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    try {
      expect(byTestId(r.container, "image-viewer-overlay")).toBeNull();
    } finally {
      r.unmount();
    }
  });

  test("renders dialog with role=dialog, aria-modal, aria-label, and width=1920 image source", async () => {
    const r = renderWithClient(
      <ImageViewerOverlay
        open
        images={IMAGES}
        currentIndex={1}
        onIndexChange={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    try {
      await flushPromises();
      const overlay = byTestId(r.container, "image-viewer-overlay")!;
      expect(overlay.getAttribute("role")).toBe("dialog");
      expect(overlay.getAttribute("aria-modal")).toBe("true");
      expect(overlay.getAttribute("aria-label")).toBe("Image viewer");

      const img = byTestId(r.container, "image-viewer-image") as
        | HTMLImageElement
        | null;
      expect(img).not.toBeNull();
      expect(img!.getAttribute("src")).toBe(`/files/anime/second.png?width=1920`);
      // alt text falls back to the file name when present.
      expect(img!.getAttribute("alt")).toBe("second.png");
      expect(img!.getAttribute("decoding")).toBe("async");
    } finally {
      r.unmount();
    }
  });

  test("falls back to index-based alt text when file name is missing", async () => {
    const images: ImageFile[] = [
      { id: 1, name: "", path: "a.png" },
      { id: 2, name: "", path: "b.png" },
    ];
    const r = renderWithClient(
      <ImageViewerOverlay
        open
        images={images}
        currentIndex={0}
        onIndexChange={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    try {
      await flushPromises();
      const img = byTestId(r.container, "image-viewer-image")!;
      expect(img.getAttribute("alt")).toBe("Image 1 of 2");
    } finally {
      r.unmount();
    }
  });

  test("calls onClose when the close button is clicked", async () => {
    const onClose = jest.fn();
    const r = renderWithClient(
      <ImageViewerOverlay
        open
        images={IMAGES}
        currentIndex={1}
        onIndexChange={jest.fn()}
        onClose={onClose}
      />,
    );
    try {
      await flushPromises();
      const close = byTestId(r.container, "image-viewer-close")!;
      act(() => {
        close.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      expect(onClose).toHaveBeenCalledTimes(1);
    } finally {
      r.unmount();
    }
  });

  test("Prev click calls onIndexChange(currentIndex - 1)", async () => {
    const onIndexChange = jest.fn();
    const r = renderWithClient(
      <ImageViewerOverlay
        open
        images={IMAGES}
        currentIndex={2}
        onIndexChange={onIndexChange}
        onClose={jest.fn()}
      />,
    );
    try {
      await flushPromises();
      const prev = byTestId(r.container, "image-viewer-prev")!;
      act(() => {
        prev.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      expect(onIndexChange).toHaveBeenCalledWith(1);
    } finally {
      r.unmount();
    }
  });

  test("Next click calls onIndexChange(currentIndex + 1)", async () => {
    const onIndexChange = jest.fn();
    const r = renderWithClient(
      <ImageViewerOverlay
        open
        images={IMAGES}
        currentIndex={0}
        onIndexChange={onIndexChange}
        onClose={jest.fn()}
      />,
    );
    try {
      await flushPromises();
      const next = byTestId(r.container, "image-viewer-next")!;
      act(() => {
        next.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      expect(onIndexChange).toHaveBeenCalledWith(1);
    } finally {
      r.unmount();
    }
  });

  test("Prev arrow hidden at index 0, Next arrow hidden at last index", async () => {
    const first = renderWithClient(
      <ImageViewerOverlay
        open
        images={IMAGES}
        currentIndex={0}
        onIndexChange={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    try {
      await flushPromises();
      expect(byTestId(first.container, "image-viewer-prev")).toBeNull();
      expect(byTestId(first.container, "image-viewer-next")).not.toBeNull();
    } finally {
      first.unmount();
    }

    const last = renderWithClient(
      <ImageViewerOverlay
        open
        images={IMAGES}
        currentIndex={IMAGES.length - 1}
        onIndexChange={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    try {
      await flushPromises();
      expect(byTestId(last.container, "image-viewer-prev")).not.toBeNull();
      expect(byTestId(last.container, "image-viewer-next")).toBeNull();
    } finally {
      last.unmount();
    }
  });

  test("Escape keypress calls onClose", async () => {
    const onClose = jest.fn();
    const r = renderWithClient(
      <ImageViewerOverlay
        open
        images={IMAGES}
        currentIndex={1}
        onIndexChange={jest.fn()}
        onClose={onClose}
      />,
    );
    try {
      await flushPromises();
      dispatchKey("Escape");
      expect(onClose).toHaveBeenCalledTimes(1);
    } finally {
      r.unmount();
    }
  });

  test("Escape is a no-op when open=false", async () => {
    const onClose = jest.fn();
    const r = renderWithClient(
      <ImageViewerOverlay
        open={false}
        images={IMAGES}
        currentIndex={1}
        onIndexChange={jest.fn()}
        onClose={onClose}
      />,
    );
    try {
      dispatchKey("Escape");
      expect(onClose).not.toHaveBeenCalled();
    } finally {
      r.unmount();
    }
  });

  test("ArrowRight advances index; ArrowLeft steps back", async () => {
    const onIndexChange = jest.fn();
    const r = renderWithClient(
      <ImageViewerOverlay
        open
        images={IMAGES}
        currentIndex={1}
        onIndexChange={onIndexChange}
        onClose={jest.fn()}
      />,
    );
    try {
      await flushPromises();
      dispatchKey("ArrowRight");
      expect(onIndexChange).toHaveBeenLastCalledWith(2);
      dispatchKey("ArrowLeft");
      expect(onIndexChange).toHaveBeenLastCalledWith(0);
    } finally {
      r.unmount();
    }
  });

  test("ArrowRight is inert at the last index; ArrowLeft inert at 0", async () => {
    const onIndexChange = jest.fn();
    const last = renderWithClient(
      <ImageViewerOverlay
        open
        images={IMAGES}
        currentIndex={IMAGES.length - 1}
        onIndexChange={onIndexChange}
        onClose={jest.fn()}
      />,
    );
    try {
      await flushPromises();
      dispatchKey("ArrowRight");
      expect(onIndexChange).not.toHaveBeenCalled();
    } finally {
      last.unmount();
    }

    const first = renderWithClient(
      <ImageViewerOverlay
        open
        images={IMAGES}
        currentIndex={0}
        onIndexChange={onIndexChange}
        onClose={jest.fn()}
      />,
    );
    try {
      await flushPromises();
      dispatchKey("ArrowLeft");
      expect(onIndexChange).not.toHaveBeenCalled();
    } finally {
      first.unmount();
    }
  });

  test("Home jumps to first image; End jumps to last image", async () => {
    const onIndexChange = jest.fn();
    const r = renderWithClient(
      <ImageViewerOverlay
        open
        images={IMAGES}
        currentIndex={1}
        onIndexChange={onIndexChange}
        onClose={jest.fn()}
      />,
    );
    try {
      await flushPromises();
      dispatchKey("Home");
      expect(onIndexChange).toHaveBeenLastCalledWith(0);
      dispatchKey("End");
      expect(onIndexChange).toHaveBeenLastCalledWith(IMAGES.length - 1);
    } finally {
      r.unmount();
    }
  });

  test("Home / End are inert when already at the edge", async () => {
    const onIndexChange = jest.fn();
    const atStart = renderWithClient(
      <ImageViewerOverlay
        open
        images={IMAGES}
        currentIndex={0}
        onIndexChange={onIndexChange}
        onClose={jest.fn()}
      />,
    );
    try {
      await flushPromises();
      dispatchKey("Home");
      expect(onIndexChange).not.toHaveBeenCalled();
    } finally {
      atStart.unmount();
    }

    const atEnd = renderWithClient(
      <ImageViewerOverlay
        open
        images={IMAGES}
        currentIndex={IMAGES.length - 1}
        onIndexChange={onIndexChange}
        onClose={jest.fn()}
      />,
    );
    try {
      await flushPromises();
      dispatchKey("End");
      expect(onIndexChange).not.toHaveBeenCalled();
    } finally {
      atEnd.unmount();
    }
  });

  test("useImagePrefetch is called with (images, currentIndex, 2) when open", async () => {
    const r = renderWithClient(
      <ImageViewerOverlay
        open
        images={IMAGES}
        currentIndex={1}
        onIndexChange={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    try {
      await flushPromises();
      expect(useImagePrefetchMock).toHaveBeenCalled();
      const lastCall =
        useImagePrefetchMock.mock.calls[
          useImagePrefetchMock.mock.calls.length - 1
        ];
      expect(lastCall[0]).toEqual(IMAGES);
      expect(lastCall[1]).toBe(1);
      expect(lastCall[2]).toBe(2);
    } finally {
      r.unmount();
    }
  });

  test("useImagePrefetch is called with an empty list when closed (keeps hook order)", async () => {
    const r = renderWithClient(
      <ImageViewerOverlay
        open={false}
        images={IMAGES}
        currentIndex={0}
        onIndexChange={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    try {
      await flushPromises();
      expect(useImagePrefetchMock).toHaveBeenCalled();
      const lastCall =
        useImagePrefetchMock.mock.calls[
          useImagePrefetchMock.mock.calls.length - 1
        ];
      expect(lastCall[0]).toEqual([]);
    } finally {
      r.unmount();
    }
  });

  test("focuses the close button when opened", async () => {
    const r = renderWithClient(
      <ImageViewerOverlay
        open
        images={IMAGES}
        currentIndex={0}
        onIndexChange={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    try {
      await flushPromises();
      // queueMicrotask may have scheduled the focus; flush again.
      await flushPromises();
      const close = byTestId(r.container, "image-viewer-close")!;
      expect(document.activeElement).toBe(close);
    } finally {
      r.unmount();
    }
  });

  test("restores focus to returnFocusRef on close", async () => {
    // A wrapper component that owns a trigger button + toggle state so we
    // can close the overlay without remounting it. The trigger ref is
    // captured via a closure so the test can flip `open` via state
    // provided by the caller (see `HarnessController`).
    function Harness({
      open,
      triggerRef,
    }: {
      open: boolean;
      triggerRef: React.RefObject<HTMLButtonElement>;
    }): JSX.Element {
      return (
        <>
          <button ref={triggerRef} data-testid="trigger">
            trigger
          </button>
          <ImageViewerOverlay
            open={open}
            images={IMAGES}
            currentIndex={0}
            onIndexChange={jest.fn()}
            onClose={jest.fn()}
            returnFocusRef={triggerRef}
          />
        </>
      );
    }

    // Use a ref-container style object to share state across renders.
    const triggerRef = { current: null as HTMLButtonElement | null };
    const r = renderWithClient(
      <Harness open triggerRef={triggerRef} />,
    );
    try {
      // Two flushes so queueMicrotask completes and focus lands on close.
      await flushPromises();
      await flushPromises();

      // Re-render with open=false — overlay effect should restore focus
      // to the trigger before it unmounts.
      act(() => {
        r.root.render(
          <ChakraProvider value={system}>
            <QueryClientProvider client={r.client}>
              <MemoryRouter>
                <Harness open={false} triggerRef={triggerRef} />
              </MemoryRouter>
            </QueryClientProvider>
          </ChakraProvider>,
        );
      });
      await flushPromises();

      const trigger = r.container.querySelector(
        "[data-testid='trigger']",
      ) as HTMLElement;
      expect(document.activeElement).toBe(trigger);
    } finally {
      r.unmount();
    }
  });

  test("clamps currentIndex when it exceeds images.length without crashing", async () => {
    const r = renderWithClient(
      <ImageViewerOverlay
        open
        images={IMAGES}
        currentIndex={99}
        onIndexChange={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    try {
      await flushPromises();
      const img = byTestId(r.container, "image-viewer-image") as
        | HTMLImageElement
        | null;
      expect(img).not.toBeNull();
      // Clamped to the last image (index 2 -> id 30).
      expect(img!.getAttribute("src")).toBe("/files/anime/third.png?width=1920");
      // Prev arrow present, Next arrow hidden (we're at last).
      expect(byTestId(r.container, "image-viewer-prev")).not.toBeNull();
      expect(byTestId(r.container, "image-viewer-next")).toBeNull();
    } finally {
      r.unmount();
    }
  });

  test("clamps a negative currentIndex to 0", async () => {
    const r = renderWithClient(
      <ImageViewerOverlay
        open
        images={IMAGES}
        currentIndex={-5}
        onIndexChange={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    try {
      await flushPromises();
      const img = byTestId(r.container, "image-viewer-image") as
        | HTMLImageElement
        | null;
      expect(img!.getAttribute("src")).toBe("/files/anime/first.png?width=1920");
      expect(byTestId(r.container, "image-viewer-prev")).toBeNull();
    } finally {
      r.unmount();
    }
  });

  test("Tab on the last focusable element wraps focus to the first (focus trap)", async () => {
    const r = renderWithClient(
      <ImageViewerOverlay
        open
        images={IMAGES}
        currentIndex={1}
        onIndexChange={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    try {
      await flushPromises();
      await flushPromises();
      const overlay = byTestId(r.container, "image-viewer-overlay")!;
      const next = byTestId(r.container, "image-viewer-next")! as HTMLElement;
      next.focus();
      // Simulate Tab at the end of the focusable list.
      act(() => {
        const event = new KeyboardEvent("keydown", {
          key: "Tab",
          bubbles: true,
          cancelable: true,
        });
        overlay.dispatchEvent(event);
      });
      // After wrapping, focus should be back on the first focusable
      // (close button).
      const close = byTestId(r.container, "image-viewer-close")!;
      expect(document.activeElement).toBe(close);
    } finally {
      r.unmount();
    }
  });

  test("ArrowLeft/ArrowRight/Home/End are inert when open=false", async () => {
    const onIndexChange = jest.fn();
    const r = renderWithClient(
      <ImageViewerOverlay
        open={false}
        images={IMAGES}
        currentIndex={1}
        onIndexChange={onIndexChange}
        onClose={jest.fn()}
      />,
    );
    try {
      dispatchKey("ArrowLeft");
      dispatchKey("ArrowRight");
      dispatchKey("Home");
      dispatchKey("End");
      expect(onIndexChange).not.toHaveBeenCalled();
    } finally {
      r.unmount();
    }
  });

  test("Tab outside the overlay is a no-op when no element is focused within", async () => {
    const r = renderWithClient(
      <ImageViewerOverlay
        open
        images={IMAGES}
        currentIndex={1}
        onIndexChange={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    try {
      await flushPromises();
      await flushPromises();
      // Focus body (outside the overlay) then press Tab on the overlay.
      (document.body as HTMLElement).focus();
      const overlay = byTestId(r.container, "image-viewer-overlay")!;
      act(() => {
        overlay.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Tab",
            shiftKey: true,
            bubbles: true,
            cancelable: true,
          }),
        );
      });
      // With shift+Tab from outside, focus wraps to the last focusable.
      const next = byTestId(r.container, "image-viewer-next")!;
      expect(document.activeElement).toBe(next);
    } finally {
      r.unmount();
    }
  });

  test("non-Tab keys on the overlay do nothing in the focus trap", async () => {
    const r = renderWithClient(
      <ImageViewerOverlay
        open
        images={IMAGES}
        currentIndex={1}
        onIndexChange={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    try {
      await flushPromises();
      const overlay = byTestId(r.container, "image-viewer-overlay")!;
      // "a" is not Tab — the focus-trap should not preventDefault.
      const event = new KeyboardEvent("keydown", {
        key: "a",
        bubbles: true,
        cancelable: true,
      });
      act(() => {
        overlay.dispatchEvent(event);
      });
      expect(event.defaultPrevented).toBe(false);
    } finally {
      r.unmount();
    }
  });

  test("Shift+Tab on the first focusable element wraps focus to the last", async () => {
    const r = renderWithClient(
      <ImageViewerOverlay
        open
        images={IMAGES}
        currentIndex={1}
        onIndexChange={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    try {
      await flushPromises();
      await flushPromises();
      const overlay = byTestId(r.container, "image-viewer-overlay")!;
      const close = byTestId(r.container, "image-viewer-close")! as HTMLElement;
      close.focus();
      act(() => {
        const event = new KeyboardEvent("keydown", {
          key: "Tab",
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        });
        overlay.dispatchEvent(event);
      });
      // Should wrap to the last control (next button, since we have one).
      const next = byTestId(r.container, "image-viewer-next")!;
      expect(document.activeElement).toBe(next);
    } finally {
      r.unmount();
    }
  });
});
