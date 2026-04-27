/**
 * Image viewer controls — close button + prev/next navigation arrows.
 *
 * Spec: ui-design.md §3.3 "Image Viewer"
 *   > Close button (X, top-left)
 *   > Subtle left/right navigation arrows (on hover)
 *   > Nothing else. No counter, no filename, no zoom controls, no tag panel,
 *   > no thumbnails.
 *
 * Behaviour:
 *   - Close button is always visible and anchored top-left with a ~48px hit
 *     target (ui-design.md §7 Accessibility: "Touch targets 44x44px minimum").
 *   - Prev/Next arrows sit vertically centred against the left/right edges.
 *     On pointer-capable devices (desktops) they only appear on overlay
 *     hover via CSS `opacity: 0` → `1` transitions. On touch-only devices
 *     (coarse pointer / no hover) they are always visible per the mobile
 *     wireframe (`03-image-viewer-mobile.svg`).
 *   - Arrows are hidden entirely at list edges: no prev at index 0, no next
 *     at `images.length - 1`. This keeps the overlay genuinely minimal and
 *     avoids surfacing non-actionable controls.
 *
 * Reduced motion: the hover fade-in is conditionally skipped under
 * `prefers-reduced-motion: reduce` so the arrows appear instantly.
 *
 * This component is pure presentation — all state lives in the overlay.
 */
import type { ReactElement, RefObject } from "react";
import { Box, IconButton } from "@chakra-ui/react";
import { ChevronLeft, ChevronRight, ExternalLink, FolderOpen, X } from "lucide-react";

export interface ImageViewerControlsProps {
  /** Whether a previous image exists. Hide Prev when false. */
  hasPrev: boolean;
  /** Whether a next image exists. Hide Next when false. */
  hasNext: boolean;
  /** Fired by Prev arrow. */
  onPrev: () => void;
  /** Fired by Next arrow. */
  onNext: () => void;
  /** Fired by Close button. */
  onClose: () => void;
  /** Fired by "Open in default application" button. Only rendered when provided. */
  onOpenInOS?: () => void;
  /** Fired by "Show in file explorer" button. Only rendered when provided. */
  onShowInExplorer?: () => void;
  /**
   * Ref surfaced to the parent so it can move focus to the close button on
   * open (ui-design.md §7 "All interactive elements keyboard-focusable").
   */
  closeButtonRef?: RefObject<HTMLButtonElement>;
}

/** Class name used to scope the hover-reveal CSS to this component's arrows. */
const ARROWS_CLASS = "animevault-image-viewer-arrow";

/**
 * Inlined CSS for the hover-to-reveal arrows. We scope the rule to the
 * parent overlay (`data-testid="image-viewer-overlay"`) so arrows only fade
 * in when the user hovers the viewer itself, not neighbouring content.
 *
 * On coarse pointer devices (touch) `@media (hover: none)` forces the
 * arrows fully opaque since there is no hover signal.
 */
const CONTROLS_CSS = `
.${ARROWS_CLASS} {
  opacity: 0;
  transition: opacity 180ms ease-out;
}
[data-testid="image-viewer-overlay"]:hover .${ARROWS_CLASS},
[data-testid="image-viewer-overlay"]:focus-within .${ARROWS_CLASS} {
  opacity: 1;
}
@media (hover: none) {
  .${ARROWS_CLASS} {
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .${ARROWS_CLASS} {
    transition: none;
  }
}
`;

export function ImageViewerControls({
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onClose,
  onOpenInOS,
  onShowInExplorer,
  closeButtonRef,
}: ImageViewerControlsProps): ReactElement {
  return (
    <>
      <style>{CONTROLS_CSS}</style>

      {/* Close button — top-left, always visible. */}
      <Box position="absolute" top="16px" left="16px" zIndex={2}>
        <IconButton
          ref={closeButtonRef}
          aria-label="Close image viewer"
          data-testid="image-viewer-close"
          onClick={onClose}
          size="lg"
          variant="ghost"
          width="48px"
          height="48px"
          minW="48px"
          borderRadius="pill"
          bg="rgba(30, 30, 46, 0.8)"
          color="#f1f5f9"
          _hover={{ bg: "rgba(30, 30, 46, 0.95)" }}
          _focusVisible={{
            outline: "2px solid",
            outlineColor: "primary",
            outlineOffset: "2px",
          }}
        >
          <X size={24} aria-hidden="true" />
        </IconButton>
      </Box>

      {/* Top-right action buttons — open in OS and show in explorer. */}
      {(onOpenInOS || onShowInExplorer) && (
        <Box
          position="absolute"
          top="16px"
          right="16px"
          zIndex={2}
          display="flex"
          gap="8px"
        >
          {onShowInExplorer && (
            <IconButton
              aria-label="Show in file explorer"
              data-testid="image-viewer-show-in-explorer"
              onClick={onShowInExplorer}
              size="lg"
              variant="ghost"
              width="48px"
              height="48px"
              minW="48px"
              borderRadius="pill"
              bg="rgba(30, 30, 46, 0.8)"
              color="#f1f5f9"
              _hover={{ bg: "rgba(30, 30, 46, 0.95)" }}
              _focusVisible={{
                outline: "2px solid",
                outlineColor: "primary",
                outlineOffset: "2px",
              }}
            >
              <FolderOpen size={24} aria-hidden="true" />
            </IconButton>
          )}
          {onOpenInOS && (
            <IconButton
              aria-label="Open in default application"
              data-testid="image-viewer-open-in-os"
              onClick={onOpenInOS}
              size="lg"
              variant="ghost"
              width="48px"
              height="48px"
              minW="48px"
              borderRadius="pill"
              bg="rgba(30, 30, 46, 0.8)"
              color="#f1f5f9"
              _hover={{ bg: "rgba(30, 30, 46, 0.95)" }}
              _focusVisible={{
                outline: "2px solid",
                outlineColor: "primary",
                outlineOffset: "2px",
              }}
            >
              <ExternalLink size={24} aria-hidden="true" />
            </IconButton>
          )}
        </Box>
      )}

      {/* Prev arrow — vertically centred, left edge. Hidden at list start. */}
      {hasPrev && (
        <Box
          className={ARROWS_CLASS}
          position="absolute"
          top="50%"
          left="16px"
          transform="translateY(-50%)"
          zIndex={2}
        >
          <IconButton
            aria-label="Previous image"
            data-testid="image-viewer-prev"
            onClick={onPrev}
            size="lg"
            variant="ghost"
            width="48px"
            height="48px"
            minW="48px"
            borderRadius="pill"
            bg="rgba(30, 30, 46, 0.6)"
            color="#f1f5f9"
            _hover={{ bg: "rgba(30, 30, 46, 0.85)" }}
            _focusVisible={{
              outline: "2px solid",
              outlineColor: "primary",
              outlineOffset: "2px",
            }}
          >
            <ChevronLeft size={28} aria-hidden="true" />
          </IconButton>
        </Box>
      )}

      {/* Next arrow — vertically centred, right edge. Hidden at list end. */}
      {hasNext && (
        <Box
          className={ARROWS_CLASS}
          position="absolute"
          top="50%"
          right="16px"
          transform="translateY(-50%)"
          zIndex={2}
        >
          <IconButton
            aria-label="Next image"
            data-testid="image-viewer-next"
            onClick={onNext}
            size="lg"
            variant="ghost"
            width="48px"
            height="48px"
            minW="48px"
            borderRadius="pill"
            bg="rgba(30, 30, 46, 0.6)"
            color="#f1f5f9"
            _hover={{ bg: "rgba(30, 30, 46, 0.85)" }}
            _focusVisible={{
              outline: "2px solid",
              outlineColor: "primary",
              outlineOffset: "2px",
            }}
          >
            <ChevronRight size={28} aria-hidden="true" />
          </IconButton>
        </Box>
      )}
    </>
  );
}

export default ImageViewerControls;
