import {
  thumbnailUrl,
  thumbnailSrcSet,
  fileResizeUrl,
  fileResizeSrcSet,
} from "../../src/lib/image-urls";
import { THUMBNAIL_WIDTHS } from "../../src/lib/constants";

describe("thumbnailUrl", () => {
  test("appends width as an integer query parameter", () => {
    expect(thumbnailUrl(42, 520)).toBe("/_/images/42?width=520");
  });

  test("rounds fractional widths to integers", () => {
    expect(thumbnailUrl(1, 520.7)).toBe("/_/images/1?width=521");
  });
});

describe("thumbnailSrcSet", () => {
  test("defaults to the three design-spec widths (520/1040/1920)", () => {
    expect(thumbnailSrcSet(9)).toBe(
      "/_/images/9?width=520 520w, /_/images/9?width=1040 1040w, /_/images/9?width=1920 1920w",
    );
  });

  test("honours an explicit width list", () => {
    expect(thumbnailSrcSet(9, [256, 512])).toBe(
      "/_/images/9?width=256 256w, /_/images/9?width=512 512w",
    );
  });

  test("exported THUMBNAIL_WIDTHS matches design spec", () => {
    expect([...THUMBNAIL_WIDTHS]).toEqual([520, 1040, 1920]);
  });
});

describe("fileResizeUrl (current backend shape)", () => {
  test("mounts under /files/ and preserves the leading slash", () => {
    expect(fileResizeUrl("/photos/a.jpg", 520)).toBe(
      "/files/photos/a.jpg?width=520",
    );
  });

  test("adds a leading slash when the path lacks one", () => {
    expect(fileResizeUrl("photos/a.jpg", 520)).toBe(
      "/files/photos/a.jpg?width=520",
    );
  });
});

describe("fileResizeSrcSet", () => {
  test("defaults to THUMBNAIL_WIDTHS", () => {
    expect(fileResizeSrcSet("/a.jpg")).toBe(
      "/files/a.jpg?width=520 520w, /files/a.jpg?width=1040 1040w, /files/a.jpg?width=1920 1920w",
    );
  });
});
