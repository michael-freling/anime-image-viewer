/**
 * `useImagePrefetch` — prefetch the next/previous full-size preview images
 * in the Image Viewer. Per frontend-design §4, we *only* prefetch adjacent
 * full-size previews in the viewer — never grid thumbnails — because the
 * viewer is the one place a user is expected to flip through images quickly.
 *
 * Strategy: create a detached `new Image()` for each neighbouring URL, which
 * puts the bytes in the browser HTTP cache without attaching anything to the
 * DOM. `decoding="async"` (via `.decoding`) hands decode work to a worker so
 * it doesn't jank the current frame.
 *
 * The effect re-runs whenever the list or pointer changes; on unmount we null
 * the .src of pending Image objects so they can be GC'd without completing.
 */
import { useEffect } from "react";
import { thumbnailUrl } from "../lib/image-urls";
import type { ImageFile } from "../types";

/** Full-size preview width as specified in frontend-design §4. */
const PREFETCH_WIDTH = 1920;

export function useImagePrefetch(
  allImages: ImageFile[],
  currentIndex: number,
  prefetchCount: number = 2,
): void {
  useEffect(() => {
    if (
      allImages.length === 0 ||
      currentIndex < 0 ||
      currentIndex >= allImages.length ||
      prefetchCount <= 0
    ) {
      return;
    }

    const pending: HTMLImageElement[] = [];
    // Prefetch forward neighbours first (more likely direction of travel).
    for (let offset = 1; offset <= prefetchCount; offset++) {
      const forwardIdx = currentIndex + offset;
      if (forwardIdx < allImages.length) {
        const img = createPrefetchImage(allImages[forwardIdx]);
        if (img) pending.push(img);
      }
      const backwardIdx = currentIndex - offset;
      if (backwardIdx >= 0) {
        const img = createPrefetchImage(allImages[backwardIdx]);
        if (img) pending.push(img);
      }
    }

    return () => {
      // Drop references so the browser can cancel in-flight decodes if the
      // user flips again before they complete.
      for (const img of pending) {
        img.src = "";
      }
    };
  }, [allImages, currentIndex, prefetchCount]);
}

function createPrefetchImage(file: ImageFile): HTMLImageElement | null {
  if (typeof window === "undefined" || typeof Image === "undefined") {
    return null;
  }
  const img = new Image();
  img.decoding = "async";
  img.loading = "eager";
  img.src = thumbnailUrl(file.id, PREFETCH_WIDTH);
  return img;
}
