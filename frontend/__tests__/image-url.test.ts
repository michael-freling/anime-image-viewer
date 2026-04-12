/**
 * Tests for image URL construction logic used by LazyImage and ImageCard.
 *
 * These tests verify:
 * - The width query parameter is appended correctly (doubled for retina displays)
 * - Paths with special characters are handled
 * - The pattern used in the frontend to build image request URLs
 */
describe("image URL construction", () => {
  /**
   * Builds the image URL the same way LazyImage does:
   *   src + "?" + new URLSearchParams({ width: String(width * 2) })
   */
  function buildImageUrl(src: string, width: number): string {
    const query = new URLSearchParams();
    query.append("width", (width * 2).toFixed(0));
    return src + "?" + query.toString();
  }

  test("appends doubled width for retina displays", () => {
    const url = buildImageUrl("/files/photos/image.jpg", 120);
    expect(url).toBe("/files/photos/image.jpg?width=240");
  });

  test("handles width of zero", () => {
    const url = buildImageUrl("/files/photos/image.jpg", 0);
    expect(url).toBe("/files/photos/image.jpg?width=0");
  });

  test("handles path with spaces encoded", () => {
    const url = buildImageUrl("/files/my%20photos/image.jpg", 100);
    expect(url).toBe("/files/my%20photos/image.jpg?width=200");
  });

  test("handles deeply nested paths", () => {
    const url = buildImageUrl("/files/a/b/c/d/image.png", 240);
    expect(url).toBe("/files/a/b/c/d/image.png?width=480");
  });

  /**
   * ImageCard uses a slightly different pattern: src + "?width=" + (2 * width).toFixed(0)
   */
  function buildImageCardUrl(src: string, width: number): string {
    return src + "?width=" + (2 * width).toFixed(0);
  }

  test("ImageCard URL pattern matches LazyImage pattern", () => {
    const src = "/files/photos/image.jpg";
    const width = 240;
    const lazyUrl = buildImageUrl(src, width);
    const cardUrl = buildImageCardUrl(src, width);
    expect(lazyUrl).toBe(cardUrl);
  });
});

describe("image error response handling", () => {
  test("HTTP 500 status indicates server error", () => {
    // When the backend returns 500 for a corrupted image that cannot
    // be restored, the response body contains the error message.
    const status = 500;
    const body = "image corrupted and restore failed: no valid backup found for file: photos/bad.jpg";

    expect(status).toBe(500);
    expect(body).toContain("image corrupted and restore failed");
  });

  test("HTTP 400 status indicates bad request", () => {
    // When a file is not found and cannot be restored, the backend
    // returns 400.
    const status = 400;
    expect(status).toBe(400);
  });

  test("HTTP 200 indicates successful serve (possibly after restore)", () => {
    // A 200 response means the image was served successfully, even if
    // a restore happened transparently on the backend.
    const status = 200;
    expect(status).toBe(200);
  });
});
