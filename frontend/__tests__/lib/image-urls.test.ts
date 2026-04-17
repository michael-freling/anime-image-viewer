import {
  fileResizeUrl,
  fileResizeSrcSet,
} from "../../src/lib/image-urls";
import { THUMBNAIL_WIDTHS } from "../../src/lib/constants";

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

  test("rounds fractional widths to integers", () => {
    expect(fileResizeUrl("a.jpg", 520.7)).toBe("/files/a.jpg?width=521");
  });
});

describe("fileResizeSrcSet", () => {
  test("defaults to the three design-spec widths (520/1040/1920)", () => {
    expect(fileResizeSrcSet("/a.jpg")).toBe(
      "/files/a.jpg?width=520 520w, /files/a.jpg?width=1040 1040w, /files/a.jpg?width=1920 1920w",
    );
  });

  test("honours an explicit width list", () => {
    expect(fileResizeSrcSet("/a.jpg", [256, 512])).toBe(
      "/files/a.jpg?width=256 256w, /files/a.jpg?width=512 512w",
    );
  });

  test("exported THUMBNAIL_WIDTHS matches design spec", () => {
    expect([...THUMBNAIL_WIDTHS]).toEqual([520, 1040, 1920]);
  });
});
