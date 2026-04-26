/**
 * Full-screen image viewer overlay.
 *
 * Spec: ui-design.md §3.3 — "Full-screen dark overlay, Full-screen image,
 * Close button (X, top-left), Subtle left/right navigation arrows (on
 * hover). Nothing else. No counter, no filename, no zoom controls, no tag
 * panel, no thumbnails."
 *
 * Architecture: this is a **controlled** component, NOT a route. Pages that
 * want a lightbox render `<ImageViewerOverlay open ... />` and own the
 * `currentIndex` / `open` state. That keeps viewer state colocated with the
 * caller's image list (search results, anime detail images, etc.) per
 * frontend-design.md §2 "image-viewer/" directory entry.
 *
 * Zoom / pan: wrapped in `react-zoom-pan-pinch` per frontend-design.md §1
 * ("keep"). Defaults: initial scale 1, double-tap/double-click toggles to 2x
 * (built-in `doubleClick.mode="toggle"`). Users can also scroll-wheel zoom
 * and pan by drag.
 *
 * Image source: `fileResizeUrl(path, 1920)` — the "full-bleed preview" tier
 * from frontend-design.md §4. The original is not served here; only the
 * sized WebP preview, which is ~10x smaller than the raw PNG. The URL is
 * path-keyed because the current Wails static file service mounts at
 * `/files/<relative-path>`; see `frontend/src/lib/image-urls.ts`.
 *
 * Prefetch: `useImagePrefetch(images, currentIndex, 2)` warms the two nearest
 * forward and backward neighbours so arrow navigation is seamless
 * (frontend-design.md §4 "only prefetching adjacent full-size previews in
 * the image viewer").
 *
 * Keyboard: Escape closes; ArrowLeft/Right step; Home/End jump to edges.
 * Bound only when `open === true` so global hotkeys don't double-fire.
 *
 * A11y: `role="dialog"`, `aria-modal="true"`, `aria-label="Image viewer"`.
 * Focus moves to the close button on open and returns to the caller's
 * `returnFocusRef` on close.
 *
 * Reduced motion: the fade-in transition on the overlay/image is suppressed
 * under `prefers-reduced-motion: reduce` via a media query in the inline
 * `<style>` block.
 */
import type { ReactElement } from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Box } from "@chakra-ui/react";
import { useHotkeys } from "@mantine/hooks";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";

import { useImagePrefetch } from "../../hooks/use-image-prefetch";
import { ImageService } from "../../lib/api";
import { fileResizeUrl } from "../../lib/image-urls";
import type { ImageFile } from "../../types";

import { ImageViewerControls } from "./image-viewer-controls";

/** Full-size preview width — frontend-design.md §4 "1920 — full-bleed preview". */
const PREVIEW_WIDTH = 1920;

export interface ImageViewerOverlayProps {
  /** Controls visibility — pages toggle this to open/close the lightbox. */
  open: boolean;
  /** Full list of images the viewer can page through. */
  images: ImageFile[];
  /** Which image is currently displayed. Clamped to a valid range. */
  currentIndex: number;
  /** Called when the user steps forward/back via arrows or keyboard. */
  onIndexChange: (nextIndex: number) => void;
  /** Called when the close button or Escape fires. */
  onClose: () => void;
  /**
   * Element to return focus to when the viewer closes. Typically a ref to
   * the thumbnail that was clicked to open the viewer. Optional because
   * some callers may not have a trigger element (e.g. command-palette open).
   */
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}

/**
 * Styles for the overlay's fade-in and reduced-motion opt-out.
 *
 * Inlined into a `<style>` tag rather than globals.css because Phase E1 is
 * constrained to files under `src/components/image-viewer/**` — we don't
 * want to touch shared styles here.
 */
const OVERLAY_CSS = `
@keyframes animevault-image-viewer-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
.animevault-image-viewer-overlay {
  animation: animevault-image-viewer-fade-in 180ms ease-out both;
}
@media (prefers-reduced-motion: reduce) {
  .animevault-image-viewer-overlay {
    animation: none;
  }
}
`;

/**
 * Clamp `index` into the valid range for `images`. Returns 0 when the list
 * is empty so callers get a safe default; the overlay guards against
 * rendering an `<img>` when `images.length === 0` anyway.
 */
function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  if (index < 0) return 0;
  if (index >= length) return length - 1;
  return index;
}

export function ImageViewerOverlay({
  open,
  images,
  currentIndex,
  onIndexChange,
  onClose,
  returnFocusRef,
}: ImageViewerOverlayProps): ReactElement | null {
  const safeIndex = clampIndex(currentIndex, images.length);
  const hasPrev = safeIndex > 0;
  const hasNext = safeIndex < images.length - 1;
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Prefetch neighbours whenever the viewer is open and the index moves.
  // When closed we still call the hook to keep hook order stable; passing
  // an empty list is a no-op per `useImagePrefetch`'s own guards.
  useImagePrefetch(open ? images : [], safeIndex, 2);

  // Keyboard shortcuts. Gated inside each callback so bindings are inert
  // while the viewer is closed (per the task spec), without unbinding and
  // re-binding the listener on every toggle.
  //
  // NOTE: Mantine's `useHotkeys` normalises the event's `key` through
  // `keyNameMap` ("Escape" → "esc") but NOT the hotkey string — so the
  // hotkey must be the normalised name `"Esc"` (parseHotkey lowercases to
  // "esc" which matches the event). Using "Escape" would silently fail.
  useHotkeys([
    [
      "Esc",
      () => {
        if (!open) return;
        onClose();
      },
    ],
    [
      "ArrowLeft",
      () => {
        if (!open) return;
        if (safeIndex > 0) onIndexChange(safeIndex - 1);
      },
    ],
    [
      "ArrowRight",
      () => {
        if (!open) return;
        if (safeIndex < images.length - 1) onIndexChange(safeIndex + 1);
      },
    ],
    [
      "Home",
      () => {
        if (!open) return;
        if (images.length > 0 && safeIndex !== 0) onIndexChange(0);
      },
    ],
    [
      "End",
      () => {
        if (!open) return;
        if (images.length > 0 && safeIndex !== images.length - 1) {
          onIndexChange(images.length - 1);
        }
      },
    ],
  ]);

  // Focus management: move focus to the close button on open, restore it
  // to the caller's trigger element when the viewer closes. The effect
  // tracks `open` specifically so a re-render at the same open state does
  // not re-steal focus away from a user who tabbed to Prev/Next.
  useEffect(() => {
    if (open) {
      // Microtask delay so the button is mounted before we focus it.
      // React commits the DOM before effects fire, but Chakra's
      // `IconButton` uses a forwarded ref that may still be null on the
      // first effect tick; scheduling through a microtask waits one tick.
      queueMicrotask(() => closeButtonRef.current?.focus());
      return;
    }
    // On close, restore focus to the trigger element if we have one.
    returnFocusRef?.current?.focus();
    return;
  }, [open, returnFocusRef]);

  // Trap focus inside the dialog: Tab/Shift+Tab cycles between the
  // focusable controls (close, prev, next). We listen on the overlay's
  // keydown capture phase and short-circuit the default browser order.
  const overlayRef = useRef<HTMLDivElement>(null);
  const handleOverlayKeyDown = (event: React.KeyboardEvent) => {
    if (!open || event.key !== "Tab") return;
    const container = overlayRef.current;
    if (!container) return;
    const focusable = Array.from(
      container.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => !el.hasAttribute("data-nofocus"));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (event.shiftKey) {
      if (active === first || !container.contains(active)) {
        event.preventDefault();
        last.focus();
      }
    } else if (active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const currentImage = images[safeIndex];

  // Open-in-OS handler: delegates to the Wails backend via ImageService.
  const handleOpenInOS = useCallback(() => {
    if (!currentImage) return;
    ImageService.OpenImageInOS(currentImage.id).catch((err: unknown) => {
      console.error("Failed to open image in OS:", err);
    });
  }, [currentImage]);

  // `useMemo` keeps the img src stable across unrelated re-renders; this
  // matters because the React Query HTTP cache is keyed by URL and we want
  // the browser image cache to reuse the prefetched response.
  const imgSrc = useMemo(
    () => (currentImage ? fileResizeUrl(currentImage.path, PREVIEW_WIDTH) : ""),
    [currentImage],
  );

  if (!open) return null;
  if (images.length === 0) return null;
  if (!currentImage) return null;

  return (
    <>
      <style>{OVERLAY_CSS}</style>
      <Box
        ref={overlayRef}
        className="animevault-image-viewer-overlay"
        data-testid="image-viewer-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="Image viewer"
        onKeyDown={handleOverlayKeyDown}
        position="fixed"
        top={0}
        left={0}
        right={0}
        bottom={0}
        bg="rgba(0, 0, 0, 0.95)"
        zIndex="modal"
        // Allow Tab/keyboard interaction within the dialog.
        tabIndex={-1}
      >
        {/*
          The zoom/pan wrapper sits under the controls; `disablePadding` on
          TransformComponent keeps the canvas flush so the image can size
          freely inside the centred flex container.
        */}
        <TransformWrapper
          initialScale={1}
          minScale={1}
          maxScale={8}
          doubleClick={{ mode: "toggle", step: 1 }}
          // Allow panning only when zoomed in; otherwise drags should be
          // interpreted as potential swipes for future gesture work.
          panning={{ disabled: false }}
          // Reset transform whenever the image behind it changes so users
          // don't see the previous image's zoom state on the next one.
          key={currentImage.id}
        >
          <TransformComponent
            wrapperStyle={{ width: "100%", height: "100%" }}
            contentStyle={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <img
              data-testid="image-viewer-image"
              src={imgSrc}
              alt={
                currentImage.name ||
                `Image ${safeIndex + 1} of ${images.length}`
              }
              decoding="async"
              loading="eager"
              draggable={false}
              style={{
                maxWidth: "100vw",
                maxHeight: "100vh",
                width: "auto",
                height: "auto",
                objectFit: "contain",
                userSelect: "none",
              }}
            />
          </TransformComponent>
        </TransformWrapper>

        <ImageViewerControls
          hasPrev={hasPrev}
          hasNext={hasNext}
          onPrev={() => {
            if (hasPrev) onIndexChange(safeIndex - 1);
          }}
          onNext={() => {
            if (hasNext) onIndexChange(safeIndex + 1);
          }}
          onClose={onClose}
          onOpenInOS={handleOpenInOS}
          closeButtonRef={closeButtonRef}
        />
      </Box>
    </>
  );
}

export default ImageViewerOverlay;
