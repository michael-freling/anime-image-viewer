/**
 * Helpers for building `<img src>` / `srcset` values that point at the
 * Wails resize endpoint.
 *
 * Per frontend-design.md §4, the backend serves thumbnails at three widths:
 *   520   — grid @1x
 *   1040  — grid @2x (retina)
 *   1920  — full-bleed preview
 *
 * TODO(backend): The resize endpoint lives at `/files/<relative-path>?width=N`
 * today, but the new route in the proposal is a content-addressed
 * `/_/images/<fileId>?width=N`. Until the backend ships a by-ID resolver,
 * downstream code should pass the image's relative path (the current
 * `Image.path` field) and wrap it with `fileResizeUrl(path, width)` instead
 * of `thumbnailUrl(id, width)`.
 */

import { THUMBNAIL_WIDTHS } from "./constants";

/**
 * Build a thumbnail URL from a file id.
 *
 * This is the forward-looking shape the redesigned backend will expose; the
 * current Wails static file service keys by relative path, not id. Until the
 * bridge is updated, call sites should prefer `fileResizeUrl`.
 */
export function thumbnailUrl(fileId: number, width: number): string {
  return `/_/images/${fileId}?width=${Math.round(width)}`;
}

/**
 * Build a DPR-aware srcset string for a file id across the given widths.
 *
 * Example:
 *   thumbnailSrcSet(42) ->
 *     "/_/images/42?width=520 520w, /_/images/42?width=1040 1040w, ..."
 */
export function thumbnailSrcSet(
  fileId: number,
  widths: readonly number[] = THUMBNAIL_WIDTHS,
): string {
  return widths
    .map((w) => `${thumbnailUrl(fileId, w)} ${Math.round(w)}w`)
    .join(", ");
}

/**
 * Build a resize URL from the image's relative path (current backend shape).
 *
 * The current static file service mounts at `/files/` and accepts a
 * `?width=N` query parameter.
 */
export function fileResizeUrl(relativePath: string, width: number): string {
  const base = relativePath.startsWith("/") ? relativePath : `/${relativePath}`;
  return `/files${base}?width=${Math.round(width)}`;
}

/**
 * Build a srcset string from a relative path across the given widths.
 */
export function fileResizeSrcSet(
  relativePath: string,
  widths: readonly number[] = THUMBNAIL_WIDTHS,
): string {
  return widths
    .map((w) => `${fileResizeUrl(relativePath, w)} ${Math.round(w)}w`)
    .join(", ");
}
