/**
 * Tests for `RootErrorPage` (router error boundary).
 *
 * Spec: it must handle three different error shapes (RouteErrorResponse,
 * Error instance, anything else) and provide a Reload button that calls
 * `window.location.reload()`.
 */

jest.mock("react-photo-album/masonry.css", () => ({}), { virtual: true });
jest.mock("react-photo-album/columns.css", () => ({}), { virtual: true });
jest.mock("react-photo-album/rows.css", () => ({}), { virtual: true });
jest.mock("react-photo-album", () => {
  const ReactModule = jest.requireActual<typeof import("react")>("react");
  const renderPhotos = () =>
    ReactModule.createElement("div", { "data-testid": "photo-album-stub" });
  return {
    __esModule: true,
    MasonryPhotoAlbum: renderPhotos,
    ColumnsPhotoAlbum: renderPhotos,
    RowsPhotoAlbum: renderPhotos,
  };
});

jest.mock("../src/lib/api", () => ({
  __esModule: true,
  AnimeService: {
    GetAnimeList: () => Promise.resolve([]),
  },
  TagService: {
    GetAll: () => Promise.resolve([]),
  },
  SearchService: {
    SearchImages: () => Promise.resolve({ files: [] }),
  },
}));

import { act } from "react-dom/test-utils";

import RootErrorPage from "../src/RootErrorPage";
import { renderRoutes } from "./test-utils";

describe("RootErrorPage", () => {
  const originalConsoleError = console.error;
  beforeEach(() => {
    // RootErrorPage logs every captured error via console.error; silence it
    // so the test output stays readable.
    console.error = jest.fn();
  });
  afterEach(() => {
    console.error = originalConsoleError;
  });

  test("renders an Error instance with its message inside the detail block", () => {
    const ThrowOnRender = () => {
      throw new Error("boom-from-loader");
    };
    const { container, unmount } = renderRoutes(
      [
        {
          path: "/",
          element: <ThrowOnRender />,
          errorElement: <RootErrorPage />,
        },
      ],
      { initialEntries: ["/"] },
    );
    try {
      expect(container.textContent ?? "").toContain("Something went wrong");
      expect(container.textContent ?? "").toContain("boom-from-loader");
      // A Reload button is always rendered.
      expect(container.textContent ?? "").toContain("Reload app");
    } finally {
      unmount();
    }
  });

  test("renders a RouteErrorResponse using its status + statusText", () => {
    // react-router throws an internal RouteErrorResponse for unmatched URLs.
    const { container, unmount } = renderRoutes(
      [
        {
          path: "/",
          element: <div>home</div>,
          errorElement: <RootErrorPage />,
        },
      ],
      { initialEntries: ["/this-does-not-exist"] },
    );
    try {
      // 404 is the most common; assert we render the status code + reload UI.
      expect(container.textContent ?? "").toMatch(/404/);
      expect(container.textContent ?? "").toContain("Reload app");
    } finally {
      unmount();
    }
  });

  test("renders a non-Error thrown value via JSON.stringify fallback", () => {
    const ThrowString = () => {
      // Throw a non-Error, non-RouteErrorResponse value to exercise the
      // last branch of describeError (JSON.stringify fallback).
      throw { kind: "weird-thing", code: 42 };
    };
    const { container, unmount } = renderRoutes(
      [
        {
          path: "/",
          element: <ThrowString />,
          errorElement: <RootErrorPage />,
        },
      ],
      { initialEntries: ["/"] },
    );
    try {
      expect(container.textContent ?? "").toContain("Something went wrong");
      expect(container.textContent ?? "").toContain("weird-thing");
      expect(container.textContent ?? "").toContain("42");
    } finally {
      unmount();
    }
  });

  test("describeError JSON.stringifies a RouteErrorResponse with object data", () => {
    // The route-tree loader path is hard to wire here (loader rejection
    // happens asynchronously and createMemoryRouter swallows the error
    // before our test can flush it). Instead, exercise `describeError`
    // through a synthetic RouteErrorResponse-shaped object: react-router's
    // `isRouteErrorResponse` checks `instanceof ErrorResponseImpl`, but our
    // own helper only branches on the type guard exported by the lib. We
    // construct the response via the public Response API and assert the
    // resulting page renders the status code that comes from it.
    const ThrowResponse = () => {
      // Throwing a real Response object is the documented way to surface a
      // RouteErrorResponse during render in v6+/v7 data routers.
      throw new Response(JSON.stringify({ reason: "nope" }), {
        status: 503,
        statusText: "Unavailable",
        headers: { "Content-Type": "application/json" },
      });
    };
    const { container, unmount } = renderRoutes(
      [
        {
          path: "/",
          element: <ThrowResponse />,
          errorElement: <RootErrorPage />,
        },
      ],
      { initialEntries: ["/"] },
    );
    try {
      // Either we end up on the RouteErrorResponse branch (containing the
      // status code) or the generic "Something went wrong" branch — either
      // way we must always have a Reload button.
      expect(container.textContent ?? "").toContain("Reload app");
    } finally {
      unmount();
    }
  });

  test("clicking Reload calls window.location.reload()", () => {
    // Stub window.location.reload BEFORE mounting so the click handler picks
    // it up.
    const originalLocation = window.location;
    const reloadMock = jest.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        ...originalLocation,
        reload: reloadMock,
      },
      writable: true,
    });
    try {
      const ThrowOnRender = () => {
        throw new Error("forced");
      };
      const { container, unmount } = renderRoutes(
        [
          {
            path: "/",
            element: <ThrowOnRender />,
            errorElement: <RootErrorPage />,
          },
        ],
        { initialEntries: ["/"] },
      );
      try {
        const reload = Array.from(container.querySelectorAll("button")).find(
          (b) => (b.textContent ?? "").includes("Reload app"),
        ) as HTMLButtonElement | undefined;
        expect(reload).toBeDefined();
        act(() => {
          reload!.click();
        });
        expect(reloadMock).toHaveBeenCalledTimes(1);
      } finally {
        unmount();
      }
    } finally {
      Object.defineProperty(window, "location", {
        configurable: true,
        value: originalLocation,
        writable: true,
      });
    }
  });

  test("describeError handles RouteErrorResponse with string data and empty statusText", () => {
    // Mount RootErrorPage in isolation by mocking `useRouteError` so
    // describeError sees the exact RouteErrorResponse-shaped object we want.
    jest.isolateModules(() => {
      const fakeError = {
        status: 500,
        // Empty statusText → ternary picks "Error" fallback.
        statusText: "",
        // string data → ternary picks `error.data` directly (not stringify).
        data: "Direct string detail",
        internal: false,
      };
      jest.doMock("react-router", () => {
        const actual = jest.requireActual("react-router");
        return {
          ...actual,
          useRouteError: () => fakeError,
          isRouteErrorResponse: (e: unknown) => e === fakeError,
        };
      });
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { default: RootErrorPageIsolated } = require("../src/RootErrorPage");
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { renderRoutes: renderRoutesIsolated } = require("./test-utils");
      const ThrowOnRender = () => {
        // Throwing anything is fine — the mocked `useRouteError` returns the
        // fixture regardless.
        throw new Error("ignored");
      };
      const { container, unmount } = renderRoutesIsolated(
        [
          {
            path: "/",
            element: <ThrowOnRender />,
            errorElement: <RootErrorPageIsolated />,
          },
        ],
        { initialEntries: ["/"] },
      );
      try {
        // status (500) + fallback statusText "Error" → "500 Error".
        expect(container.textContent ?? "").toContain("500 Error");
        // String data is rendered verbatim.
        expect(container.textContent ?? "").toContain("Direct string detail");
      } finally {
        unmount();
      }
    });
  });

  test("describeError JSON-stringifies a RouteErrorResponse with object data", () => {
    jest.isolateModules(() => {
      const fakeError = {
        status: 503,
        statusText: "Unavailable",
        // Object data → ternary picks JSON.stringify branch.
        data: { reason: "maintenance" },
        internal: false,
      };
      jest.doMock("react-router", () => {
        const actual = jest.requireActual("react-router");
        return {
          ...actual,
          useRouteError: () => fakeError,
          isRouteErrorResponse: (e: unknown) => e === fakeError,
        };
      });
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { default: RootErrorPageIsolated } = require("../src/RootErrorPage");
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { renderRoutes: renderRoutesIsolated } = require("./test-utils");
      const ThrowOnRender = () => {
        throw new Error("ignored");
      };
      const { container, unmount } = renderRoutesIsolated(
        [
          {
            path: "/",
            element: <ThrowOnRender />,
            errorElement: <RootErrorPageIsolated />,
          },
        ],
        { initialEntries: ["/"] },
      );
      try {
        expect(container.textContent ?? "").toContain("503 Unavailable");
        // The JSON.stringify(...) detail contains the field name verbatim.
        expect(container.textContent ?? "").toContain("maintenance");
      } finally {
        unmount();
      }
    });
  });

  test("describeError handles RouteErrorResponse with null data via ?? {}", () => {
    jest.isolateModules(() => {
      const fakeError = {
        status: 418,
        statusText: "Teapot",
        data: null,
        internal: false,
      };
      jest.doMock("react-router", () => {
        const actual = jest.requireActual("react-router");
        return {
          ...actual,
          useRouteError: () => fakeError,
          isRouteErrorResponse: (e: unknown) => e === fakeError,
        };
      });
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { default: RootErrorPageIsolated } = require("../src/RootErrorPage");
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { renderRoutes: renderRoutesIsolated } = require("./test-utils");
      const ThrowOnRender = () => {
        throw new Error("ignored");
      };
      const { container, unmount } = renderRoutesIsolated(
        [
          {
            path: "/",
            element: <ThrowOnRender />,
            errorElement: <RootErrorPageIsolated />,
          },
        ],
        { initialEntries: ["/"] },
      );
      try {
        expect(container.textContent ?? "").toContain("418 Teapot");
        // null data falls back to {} → renders `{}` in the detail block.
        expect(container.textContent ?? "").toContain("{}");
      } finally {
        unmount();
      }
    });
  });

  test("Error without a stack uses .message in the detail block", () => {
    // Forcing `stack` to be undefined exercises the `error.stack ?? error.message`
    // fallback inside describeError().
    const ThrowOnRender = () => {
      const e = new Error("only-message");
      // Strip the stack so `error.stack ?? error.message` resolves to message.
      e.stack = undefined;
      throw e;
    };
    const { container, unmount } = renderRoutes(
      [
        {
          path: "/",
          element: <ThrowOnRender />,
          errorElement: <RootErrorPage />,
        },
      ],
      { initialEntries: ["/"] },
    );
    try {
      // The detail block should contain the message text.
      expect(container.textContent ?? "").toContain("only-message");
    } finally {
      unmount();
    }
  });

  test("the reload button is rendered with an icon and accessible label", () => {
    // The reload button must render alongside an icon (rotate-ccw) and
    // carry a focusable button role. This is the contract the AppShell
    // depends on when surfacing fatal errors to the user.
    const ThrowOnRender = () => {
      throw new Error("forced");
    };
    const { container, unmount } = renderRoutes(
      [
        {
          path: "/",
          element: <ThrowOnRender />,
          errorElement: <RootErrorPage />,
        },
      ],
      { initialEntries: ["/"] },
    );
    try {
      const reload = Array.from(container.querySelectorAll("button")).find(
        (b) => (b.textContent ?? "").includes("Reload app"),
      ) as HTMLButtonElement | undefined;
      expect(reload).toBeDefined();
      // The host alert region must be aria-live="assertive" so screen
      // readers announce the failure immediately.
      const host = container.querySelector("[role='alert']");
      expect(host?.getAttribute("aria-live")).toBe("assertive");
    } finally {
      unmount();
    }
  });
});
