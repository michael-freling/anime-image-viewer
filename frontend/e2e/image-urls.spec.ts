/**
 * E2E test: Image URL correctness.
 *
 * Verifies that rendered `<img>` elements never contain the doubled
 * `/files/files/` prefix that was fixed in commit 3e5d894. The test
 * navigates to an anime detail page (which is seeded with mock images
 * via the `wails-runtime-mock`), waits for the image grid to render,
 * and asserts on the `src` and `srcset` attributes of every `<img>`.
 *
 * Mock images intentionally include paths that start with `/files/`
 * (e.g. `/files/bebop/spike-spiegel.png`) AND paths without it
 * (e.g. `bebop/jet-black.png`) so both code paths in `fileResizeUrl`
 * are exercised.
 *
 * Because there is no real file server, all `/files/**` requests are
 * intercepted by Playwright's route handler and served as a 1x1 transparent
 * PNG. This prevents the `<img>` `onError` from firing and unmounting the
 * element before we can inspect its attributes. Importantly, the route
 * handler also records every requested URL so we can assert on the full
 * set of URLs the browser actually fetched.
 */
import { test, expect } from "@playwright/test";

/** 1x1 transparent PNG (67 bytes). */
const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAB" +
    "Nl7BcQAAAABJRU5ErkJggg==",
  "base64",
);

test.describe("Image URL rendering", () => {
  /** URLs requested by the browser for `/files/**` resources. */
  let requestedUrls: string[];

  test.beforeEach(async ({ page }) => {
    requestedUrls = [];

    // Intercept /files/** image requests and serve a 1x1 PNG so images load
    // successfully and the <img> elements stay in the DOM. We use a regex
    // to match only paths that start with /files/ at the root (avoiding
    // false matches like /node_modules/.../files/...).
    await page.route(/^http:\/\/localhost:\d+\/files\//, async (route) => {
      const url = route.request().url();
      requestedUrls.push(url);
      await route.fulfill({
        status: 200,
        contentType: "image/png",
        body: PIXEL_PNG,
      });
    });

    // Navigate to the anime detail images tab. The mock backend
    // has anime ID 1 ("Cowboy Bebop") with 3 images.
    await page.goto("/anime/1/images");
  });

  test("no image src contains double /files/files/ prefix", async ({
    page,
  }) => {
    // Wait for the image grid to appear (data-testid="image-grid").
    await page.waitForSelector('[data-testid="image-grid"]', {
      timeout: 15_000,
    });

    // Wait for images to settle into the "loaded" state.
    await page.waitForSelector('[data-testid="image-grid"] img[src]', {
      timeout: 10_000,
    });

    // Collect all <img> elements within the grid.
    const images = page.locator('[data-testid="image-grid"] img');
    const count = await images.count();

    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const img = images.nth(i);
      const src = await img.getAttribute("src");
      const srcset = await img.getAttribute("srcset");

      // Assert no doubled prefix.
      if (src) {
        expect(
          src,
          `img[${i}].src should not contain /files/files/`,
        ).not.toContain("/files/files/");
      }

      if (srcset) {
        expect(
          srcset,
          `img[${i}].srcset should not contain /files/files/`,
        ).not.toContain("/files/files/");
      }
    }
  });

  test("all image srcs start with /files/ (single prefix)", async ({
    page,
  }) => {
    await page.waitForSelector('[data-testid="image-grid"]', {
      timeout: 15_000,
    });
    await page.waitForSelector('[data-testid="image-grid"] img[src]', {
      timeout: 10_000,
    });

    const images = page.locator('[data-testid="image-grid"] img');
    const count = await images.count();

    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const img = images.nth(i);
      const src = await img.getAttribute("src");

      // Every src should start with /files/ followed by the path.
      expect(src, `img[${i}].src should start with /files/`).toMatch(
        /^\/files\//,
      );
    }
  });

  test("srcset entries all start with /files/ and contain width descriptors", async ({
    page,
  }) => {
    await page.waitForSelector('[data-testid="image-grid"]', {
      timeout: 15_000,
    });
    await page.waitForSelector('[data-testid="image-grid"] img[src]', {
      timeout: 10_000,
    });

    const images = page.locator('[data-testid="image-grid"] img');
    const count = await images.count();

    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const img = images.nth(i);
      const srcset = await img.getAttribute("srcset");

      if (srcset) {
        // srcset is comma-separated: "/files/x?width=520 520w, /files/x?width=1040 1040w, ..."
        const entries = srcset.split(",").map((s) => s.trim());

        for (const entry of entries) {
          // Each entry should start with /files/.
          expect(
            entry,
            `srcset entry should start with /files/`,
          ).toMatch(/^\/files\//);

          // Each entry should NOT contain doubled /files/files/.
          expect(
            entry,
            `srcset entry should not contain /files/files/`,
          ).not.toContain("/files/files/");

          // Each entry should have a width descriptor (e.g. "520w").
          expect(
            entry,
            `srcset entry should have a width descriptor`,
          ).toMatch(/\d+w$/);
        }
      }
    }
  });

  test("image thumbnails have correct data attributes", async ({ page }) => {
    await page.waitForSelector('[data-testid="image-grid"]', {
      timeout: 15_000,
    });

    const thumbnails = page.locator('[data-testid="image-thumbnail"]');
    const count = await thumbnails.count();

    // The mock serves 3 images for anime 1.
    expect(count).toBe(3);

    // Each thumbnail should have a data-file-id attribute.
    for (let i = 0; i < count; i++) {
      const fileId = await thumbnails.nth(i).getAttribute("data-file-id");
      expect(fileId).not.toBeNull();
      expect(Number(fileId)).toBeGreaterThan(0);
    }
  });

  test("browser-fetched image URLs never contain /files/files/", async ({
    page,
  }) => {
    await page.waitForSelector('[data-testid="image-grid"]', {
      timeout: 15_000,
    });

    // Wait a moment for all image requests to be dispatched.
    await page.waitForTimeout(2_000);

    // The route handler collected every /files/** URL the browser fetched.
    expect(
      requestedUrls.length,
      "at least one /files/ request was intercepted",
    ).toBeGreaterThan(0);

    for (const url of requestedUrls) {
      const pathname = new URL(url).pathname;
      expect(
        pathname,
        `fetched URL pathname should not contain /files/files/`,
      ).not.toContain("/files/files/");
      expect(
        pathname,
        `fetched URL pathname should start with /files/`,
      ).toMatch(/^\/files\//);
    }
  });
});
