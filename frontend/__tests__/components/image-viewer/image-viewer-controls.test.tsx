/**
 * Tests for `ImageViewerControls` (close + prev/next arrows).
 *
 * Spec: ui-design.md §3.3 — close button always visible top-left, arrows
 *       hidden at list edges, hover-reveal handled via CSS.
 *
 * The component is pure presentation, so we can render it directly under
 * the shared `renderWithClient` helper (real Chakra) and assert behaviour
 * via data-testid + click dispatch.
 */
import { act } from "react-dom/test-utils";

import { ImageViewerControls } from "../../../src/components/image-viewer/image-viewer-controls";
import { renderWithClient } from "../../test-utils";

function byTestId(container: HTMLElement, id: string): HTMLElement | null {
  return container.querySelector(`[data-testid="${id}"]`);
}

describe("ImageViewerControls", () => {
  test("renders the close button with an accessible label", () => {
    const r = renderWithClient(
      <ImageViewerControls
        hasPrev
        hasNext
        onPrev={jest.fn()}
        onNext={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    try {
      const close = byTestId(r.container, "image-viewer-close");
      expect(close).not.toBeNull();
      expect(close!.getAttribute("aria-label")).toBe("Close image viewer");
    } finally {
      r.unmount();
    }
  });

  test("renders prev and next arrows when both edges have neighbours", () => {
    const r = renderWithClient(
      <ImageViewerControls
        hasPrev
        hasNext
        onPrev={jest.fn()}
        onNext={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    try {
      expect(byTestId(r.container, "image-viewer-prev")).not.toBeNull();
      expect(byTestId(r.container, "image-viewer-next")).not.toBeNull();
    } finally {
      r.unmount();
    }
  });

  test("hides Prev when hasPrev=false", () => {
    const r = renderWithClient(
      <ImageViewerControls
        hasPrev={false}
        hasNext
        onPrev={jest.fn()}
        onNext={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    try {
      expect(byTestId(r.container, "image-viewer-prev")).toBeNull();
      expect(byTestId(r.container, "image-viewer-next")).not.toBeNull();
    } finally {
      r.unmount();
    }
  });

  test("hides Next when hasNext=false", () => {
    const r = renderWithClient(
      <ImageViewerControls
        hasPrev
        hasNext={false}
        onPrev={jest.fn()}
        onNext={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    try {
      expect(byTestId(r.container, "image-viewer-prev")).not.toBeNull();
      expect(byTestId(r.container, "image-viewer-next")).toBeNull();
    } finally {
      r.unmount();
    }
  });

  test("clicking close fires onClose", () => {
    const onClose = jest.fn();
    const r = renderWithClient(
      <ImageViewerControls
        hasPrev
        hasNext
        onPrev={jest.fn()}
        onNext={jest.fn()}
        onClose={onClose}
      />,
    );
    try {
      const close = byTestId(r.container, "image-viewer-close")!;
      act(() => {
        close.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      expect(onClose).toHaveBeenCalledTimes(1);
    } finally {
      r.unmount();
    }
  });

  test("clicking Prev fires onPrev", () => {
    const onPrev = jest.fn();
    const r = renderWithClient(
      <ImageViewerControls
        hasPrev
        hasNext
        onPrev={onPrev}
        onNext={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    try {
      const prev = byTestId(r.container, "image-viewer-prev")!;
      act(() => {
        prev.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      expect(onPrev).toHaveBeenCalledTimes(1);
    } finally {
      r.unmount();
    }
  });

  test("clicking Next fires onNext", () => {
    const onNext = jest.fn();
    const r = renderWithClient(
      <ImageViewerControls
        hasPrev
        hasNext
        onPrev={jest.fn()}
        onNext={onNext}
        onClose={jest.fn()}
      />,
    );
    try {
      const next = byTestId(r.container, "image-viewer-next")!;
      act(() => {
        next.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      expect(onNext).toHaveBeenCalledTimes(1);
    } finally {
      r.unmount();
    }
  });

  test("forwards a ref to the close button via closeButtonRef", () => {
    const closeButtonRef = { current: null as HTMLButtonElement | null };
    const r = renderWithClient(
      <ImageViewerControls
        hasPrev
        hasNext
        onPrev={jest.fn()}
        onNext={jest.fn()}
        onClose={jest.fn()}
        closeButtonRef={closeButtonRef}
      />,
    );
    try {
      // After mount, ref should resolve to the close button element so
      // parents can move focus to it on open.
      expect(closeButtonRef.current).not.toBeNull();
      expect(
        closeButtonRef.current?.getAttribute("data-testid"),
      ).toBe("image-viewer-close");
    } finally {
      r.unmount();
    }
  });

  test("renders the 'Open in default application' button when onOpenInOS is provided", () => {
    const onOpenInOS = jest.fn();
    const r = renderWithClient(
      <ImageViewerControls
        hasPrev
        hasNext
        onPrev={jest.fn()}
        onNext={jest.fn()}
        onClose={jest.fn()}
        onOpenInOS={onOpenInOS}
      />,
    );
    try {
      const btn = byTestId(r.container, "image-viewer-open-in-os");
      expect(btn).not.toBeNull();
      expect(btn!.getAttribute("aria-label")).toBe(
        "Open in default application",
      );
    } finally {
      r.unmount();
    }
  });

  test("does not render 'Open in default application' button when onOpenInOS is not provided", () => {
    const r = renderWithClient(
      <ImageViewerControls
        hasPrev
        hasNext
        onPrev={jest.fn()}
        onNext={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    try {
      expect(byTestId(r.container, "image-viewer-open-in-os")).toBeNull();
    } finally {
      r.unmount();
    }
  });

  test("clicking 'Open in default application' fires onOpenInOS", () => {
    const onOpenInOS = jest.fn();
    const r = renderWithClient(
      <ImageViewerControls
        hasPrev
        hasNext
        onPrev={jest.fn()}
        onNext={jest.fn()}
        onClose={jest.fn()}
        onOpenInOS={onOpenInOS}
      />,
    );
    try {
      const btn = byTestId(r.container, "image-viewer-open-in-os")!;
      act(() => {
        btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      expect(onOpenInOS).toHaveBeenCalledTimes(1);
    } finally {
      r.unmount();
    }
  });

  test("renders both edges hidden when hasPrev and hasNext are both false", () => {
    const r = renderWithClient(
      <ImageViewerControls
        hasPrev={false}
        hasNext={false}
        onPrev={jest.fn()}
        onNext={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    try {
      expect(byTestId(r.container, "image-viewer-prev")).toBeNull();
      expect(byTestId(r.container, "image-viewer-next")).toBeNull();
      // Close stays.
      expect(byTestId(r.container, "image-viewer-close")).not.toBeNull();
    } finally {
      r.unmount();
    }
  });
});
