/**
 * Tests for `useImagePrefetch`.
 *
 * Uses a jest spy on the `Image` constructor to record the `src`s the hook
 * assigns. Verifies neighbours around `currentIndex` are prefetched and that
 * unmount cleans up pending loads.
 */
import { renderHookWithClient } from "../test-utils";

const originalImage = global.Image;
let assignedSrcs: string[] = [];

class ImageStub {
  // Recorded after construction.
  decoding: string = "auto";
  loading: string = "eager";
  private _src = "";

  constructor() {
    instances.push(this);
  }

  get src(): string {
    return this._src;
  }

  set src(value: string) {
    this._src = value;
    assignedSrcs.push(value);
  }
}
const instances: ImageStub[] = [];

beforeAll(() => {
  (global as unknown as { Image: typeof Image }).Image =
    ImageStub as unknown as typeof Image;
});
afterAll(() => {
  global.Image = originalImage;
});

beforeEach(() => {
  assignedSrcs = [];
  instances.length = 0;
});

import { useImagePrefetch } from "../../src/hooks/use-image-prefetch";

describe("useImagePrefetch", () => {
  const images = [
    { id: 1, name: "a.png", path: "a.png" },
    { id: 2, name: "b.png", path: "b.png" },
    { id: 3, name: "c.png", path: "c.png" },
    { id: 4, name: "d.png", path: "d.png" },
    { id: 5, name: "e.png", path: "e.png" },
  ];

  test("prefetches N adjacent images around the current index", () => {
    const { unmount } = renderHookWithClient(() =>
      useImagePrefetch(images, 2, 2),
    );
    // Expected neighbours: +1, -1, +2, -2 (order matters only for prioritization).
    // That's 4 prefetch Images each assigned a width=1920 URL once.
    expect(instances).toHaveLength(4);
    const initial = assignedSrcs.slice(0, 4);
    expect(initial).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/\/_\/images\/1\?width=1920$/),
        expect.stringMatching(/\/_\/images\/2\?width=1920$/),
        expect.stringMatching(/\/_\/images\/4\?width=1920$/),
        expect.stringMatching(/\/_\/images\/5\?width=1920$/),
      ]),
    );
    unmount();
  });

  test("clamps at array edges (no prefetch past the first/last image)", () => {
    const { unmount } = renderHookWithClient(() =>
      useImagePrefetch(images, 0, 2),
    );
    // index 0 with prefetchCount 2 → only +1 and +2 (no negatives).
    expect(instances).toHaveLength(2);
    const initial = assignedSrcs.slice(0, 2);
    expect(initial).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/\/_\/images\/2\?width=1920$/),
        expect.stringMatching(/\/_\/images\/3\?width=1920$/),
      ]),
    );
    unmount();
  });

  test("is a no-op when allImages is empty", () => {
    const { unmount } = renderHookWithClient(() =>
      useImagePrefetch([], 0, 3),
    );
    expect(instances).toHaveLength(0);
    unmount();
  });

  test("unmount resets pending image srcs for GC", () => {
    const { unmount } = renderHookWithClient(() =>
      useImagePrefetch(images, 2, 1),
    );
    // After setup, instances have their original src.
    const realSrcs = instances.map((i) => i.src);
    expect(realSrcs.every((s) => s.includes("/_/images/"))).toBe(true);

    unmount();
    // Cleanup nulled each src — the assigned-srcs log records the clear.
    const clears = assignedSrcs.filter((s) => s === "");
    expect(clears.length).toBe(instances.length);
  });
});
