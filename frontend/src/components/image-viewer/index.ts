/**
 * Barrel exports for the image-viewer component cluster.
 *
 * Public surface (per frontend-design.md §2):
 *   - `ImageViewerOverlay` — controlled full-screen lightbox
 *   - `ImageViewerControls` — reusable close/prev/next control group
 */
export {
  ImageViewerOverlay,
  type ImageViewerOverlayProps,
} from "./image-viewer-overlay";
export {
  ImageViewerControls,
  type ImageViewerControlsProps,
} from "./image-viewer-controls";
