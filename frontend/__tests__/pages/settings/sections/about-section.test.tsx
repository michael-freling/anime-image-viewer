/**
 * Tests for the AboutSection — the identity + external-link row at the
 * bottom of the Settings page.
 *
 * Spec: ui-design.md §3.7 (Settings — About). The GitHub repository link
 * prefers Wails' `Browser.OpenURL` when the runtime is attached so it
 * opens in the native browser rather than navigating away from the
 * WebView. In a fallback (no Wails) path the anchor's default
 * behaviour handles the click.
 *
 * Coverage goal: the async `openRepo` handler (lines 27–31 in
 * `about-section.tsx`).
 */

// `@wailsio/runtime` is dynamically imported inside `openRepo`. The
// factory runs once and its returned namespace is cached, so we expose a
// live-binding shape whose `Browser` is a getter that reads mutable state.
// That way the *same* mocked module presents as "ok" / "no-browser"
// depending on the per-test flag.
const openURLMock = jest.fn();
type RuntimeBehaviour = "ok" | "no-browser";
let runtimeBehaviour: RuntimeBehaviour = "ok";

jest.mock("@wailsio/runtime", () => {
  const browserImpl = {
    OpenURL: (...args: unknown[]) => openURLMock(...args),
  };
  return {
    __esModule: true,
    get Browser() {
      return runtimeBehaviour === "ok" ? browserImpl : undefined;
    },
  };
});

import { act } from "react-dom/test-utils";

import { AboutSection } from "../../../../src/pages/settings/sections/about-section";
import { renderWithClient, flushPromises } from "../../../test-utils";

const REPO_URL = "https://github.com/michael-freling/anime-image-viewer";

describe("AboutSection", () => {
  beforeEach(() => {
    openURLMock.mockReset();
    runtimeBehaviour = "ok";
  });

  test("renders app identity rows (name, version) and the GitHub link", () => {
    const r = renderWithClient(<AboutSection />);
    try {
      const appName = r.container.querySelector(
        "[data-testid='about-app-name']",
      );
      expect(appName?.textContent).toBe("AnimeVault");
      const version = r.container.querySelector(
        "[data-testid='about-version']",
      );
      expect(version?.textContent).toBe("Dev");
      const link = r.container.querySelector(
        "[data-testid='about-github-link']",
      );
      expect(link).not.toBeNull();
      expect(link?.getAttribute("href")).toBe(REPO_URL);
      expect(link?.getAttribute("target")).toBe("_blank");
      expect(link?.getAttribute("rel")).toBe("noreferrer noopener");
    } finally {
      r.unmount();
    }
  });

  test("clicking the GitHub link calls Browser.OpenURL when Wails is available", async () => {
    runtimeBehaviour = "ok";
    openURLMock.mockResolvedValue(undefined);
    const r = renderWithClient(<AboutSection />);
    try {
      const link = r.container.querySelector(
        "[data-testid='about-github-link']",
      ) as HTMLAnchorElement;
      expect(link).not.toBeNull();
      const click = new MouseEvent("click", { bubbles: true, cancelable: true });
      await act(async () => {
        link.dispatchEvent(click);
      });
      // Let the dynamic import's microtask chain settle. Two turns is
      // generally enough: (1) the dynamic import's `then`, (2) the
      // awaited OpenURL promise.
      await flushPromises();
      await flushPromises();
      expect(openURLMock).toHaveBeenCalledWith(REPO_URL);
      // `preventDefault` fires once a wails runtime is resolved so the
      // default anchor navigation is suppressed.
      expect(click.defaultPrevented).toBe(true);
    } finally {
      r.unmount();
    }
  });

  test("falls through when Wails runtime loads but Browser.OpenURL is missing", async () => {
    runtimeBehaviour = "no-browser";
    const r = renderWithClient(<AboutSection />);
    try {
      const link = r.container.querySelector(
        "[data-testid='about-github-link']",
      ) as HTMLAnchorElement;
      const click = new MouseEvent("click", { bubbles: true, cancelable: true });
      await act(async () => {
        link.dispatchEvent(click);
      });
      await flushPromises();
      await flushPromises();
      expect(openURLMock).not.toHaveBeenCalled();
      expect(click.defaultPrevented).toBe(false);
    } finally {
      r.unmount();
    }
  });

  test("OpenURL rejection is swallowed so the app keeps running", async () => {
    runtimeBehaviour = "ok";
    openURLMock.mockRejectedValue(new Error("browser closed"));
    const r = renderWithClient(<AboutSection />);
    try {
      const link = r.container.querySelector(
        "[data-testid='about-github-link']",
      ) as HTMLAnchorElement;
      const click = new MouseEvent("click", { bubbles: true, cancelable: true });
      await act(async () => {
        link.dispatchEvent(click);
      });
      await flushPromises();
      await flushPromises();
      await flushPromises();
      // OpenURL was still invoked (rejection happens async inside the
      // handler's try/catch, which swallows it).
      expect(openURLMock).toHaveBeenCalledWith(REPO_URL);
    } finally {
      r.unmount();
    }
  });
});
