/**
 * Helpers for building `<img src>` / `srcset` values that point at the
 * Wails resize endpoint.
 *
 * Per frontend-design.md §4, the backend serves thumbnails at three widths:
 *   520   — grid @1x
 *   1040  — grid @2x (retina)
 *   1920  — full-bleed preview
 *
 * The current Wails static file service mounts at `/files/` and keys by the
 * image's relative path (see `internal/frontend/file.go` and
 * `internal/image/files.go`). The redesigned backend is expected to expose a
 * content-addressed `/_/images/<fileId>?width=N` route, but that by-ID
 * resolver has not shipped yet. Call sites therefore pass the image's
 * `path` field and use `fileResizeUrl` / `fileResizeSrcSet`.
 */

import { THUMBNAIL_WIDTHS } from "./constants";

/**
 * Build a resize URL from the image's relative path (current backend shape).
 *
 * The static file service accepts a `?width=N` query parameter and serves
 * a resized WebP variant. Omitting the query returns the original bytes.
 */
export function fileResizeUrl(relativePath: string, width: number): string {
  // Normalize Windows backslashes (Go's strings.TrimPrefix preserves OS
  // separators, so on Windows Image.Path arrives as "/files\dir\img.png").
  let path = relativePath.replace(/\\/g, "/");
  if (!path.startsWith("/")) path = `/${path}`;
  // The backend already includes the /files prefix in Image.Path — strip it
  // so we can unconditionally re-add it below without doubling.
  if (path.startsWith("/files/")) path = path.slice("/files".length);
  return `/files${path}?width=${Math.round(width)}`;
}

/**
 * Build a DPR-aware srcset string from a relative path across the given widths.
 *
 * Example:
 *   fileResizeSrcSet("/a.jpg") ->
 *     "/files/a.jpg?width=520 520w, /files/a.jpg?width=1040 1040w, ..."
 */
export function fileResizeSrcSet(
  relativePath: string,
  widths: readonly number[] = THUMBNAIL_WIDTHS,
): string {
  return widths
    .map((w) => `${fileResizeUrl(relativePath, w)} ${Math.round(w)}w`)
    .join(", ");
}
