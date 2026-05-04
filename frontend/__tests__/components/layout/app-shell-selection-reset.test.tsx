/**
 * Tests for AppShell selection-mode reset on route change.
 *
 * The AppShell has a useEffect that resets selection (exits selectMode) when
 * the route changes, with two exceptions:
 *   1. Don't reset when navigating TO `/images/edit` or `/images/edit/tags`
 *   2. Don't reset when coming BACK FROM those editor paths (cancel preserves state)
 *
 * We use minimal route definitions with placeholder components that trigger
 * navigation via `useNavigate`, and assert on the `useSelectionStore` state.
 */
import { act } from "react-dom/test-utils";
import { useNavigate } from "react-router";
import { useSelectionStore } from "../../../src/stores/selection-store";
import { renderRoutes } from "../../test-utils";

// Mock sub-components that have heavy dependencies (Wails bindings, lucide, etc.)
jest.mock("../../../src/components/layout/icon-rail", () => ({
  __esModule: true,
  IconRail: () => <div data-testid="icon-rail-stub" />,
}));
jest.mock("../../../src/components/layout/bottom-tab-bar", () => ({
  __esModule: true,
  BottomTabBar: () => <div data-testid="bottom-tab-bar-stub" />,
}));
jest.mock("../../../src/components/shared/import-progress-bar", () => ({
  __esModule: true,
  ImportProgressBar: () => null,
}));
jest.mock("../../../src/lib/api", () => ({
  __esModule: true,
  AnimeService: {},
  TagService: {},
  ImageService: {},
  SearchService: {},
  BackupFrontendService: {},
  ConfigFrontendService: {},
  BatchImportImageService: {},
  DirectoryService: {},
}));

import { AppShell } from "../../../src/components/layout/app-shell";

/**
 * Test page component that renders a button to navigate to a given path.
 */
function TestPage({ id, navigateTo }: { id: string; navigateTo?: string }) {
  const navigate = useNavigate();
  return (
    <div data-testid={`page-${id}`}>
      {navigateTo && (
        <button
          data-testid={`nav-to-${id}`}
          onClick={() => navigate(navigateTo)}
        >
          Navigate
        </button>
      )}
    </div>
  );
}

function resetStore() {
  act(() => {
    useSelectionStore.setState({
      selectMode: false,
      selectedIds: new Set<number>(),
      lastSelectedId: null,
    });
  });
}

function enterSelectModeWithItems() {
  act(() => {
    useSelectionStore.setState({
      selectMode: true,
      selectedIds: new Set<number>([1, 2, 3]),
      lastSelectedId: 3,
    });
  });
}

describe("AppShell selection reset on route change", () => {
  beforeEach(() => {
    resetStore();
  });

  test("resets selection when navigating from search to anime detail", () => {
    const routes = [
      {
        element: <AppShell />,
        children: [
          {
            path: "search",
            element: (
              <TestPage id="search" navigateTo="/anime/1/images" />
            ),
          },
          {
            path: "anime/:animeId/images",
            element: <TestPage id="anime-detail" />,
          },
        ],
      },
    ];

    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/search"],
    });

    // Verify we are on the search page
    expect(
      container.querySelector("[data-testid='page-search']"),
    ).not.toBeNull();

    // Enter select mode with items selected
    enterSelectModeWithItems();
    expect(useSelectionStore.getState().selectMode).toBe(true);
    expect(useSelectionStore.getState().selectedIds.size).toBe(3);

    // Navigate to anime detail
    const navButton = container.querySelector(
      "[data-testid='nav-to-search']",
    ) as HTMLButtonElement;
    act(() => {
      navButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // Selection should be reset
    expect(useSelectionStore.getState().selectMode).toBe(false);
    expect(useSelectionStore.getState().selectedIds.size).toBe(0);

    unmount();
  });

  test("does NOT reset selection when navigating from search to /images/edit", () => {
    const routes = [
      {
        element: <AppShell />,
        children: [
          {
            path: "search",
            element: (
              <TestPage id="search" navigateTo="/images/edit" />
            ),
          },
          {
            path: "images/edit",
            element: <TestPage id="editor" />,
          },
        ],
      },
    ];

    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/search"],
    });

    // Enter select mode with items selected
    enterSelectModeWithItems();
    expect(useSelectionStore.getState().selectMode).toBe(true);

    // Navigate to editor
    const navButton = container.querySelector(
      "[data-testid='nav-to-search']",
    ) as HTMLButtonElement;
    act(() => {
      navButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // Selection should be preserved (navigating TO editor)
    expect(useSelectionStore.getState().selectMode).toBe(true);
    expect(useSelectionStore.getState().selectedIds.size).toBe(3);

    unmount();
  });

  test("does NOT reset selection when navigating from /images/edit back to search (cancel)", () => {
    const routes = [
      {
        element: <AppShell />,
        children: [
          {
            path: "search",
            element: <TestPage id="search" />,
          },
          {
            path: "images/edit",
            element: (
              <TestPage id="editor" navigateTo="/search" />
            ),
          },
        ],
      },
    ];

    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/images/edit"],
    });

    // Verify we are on the editor page
    expect(
      container.querySelector("[data-testid='page-editor']"),
    ).not.toBeNull();

    // Enter select mode with items selected
    enterSelectModeWithItems();
    expect(useSelectionStore.getState().selectMode).toBe(true);

    // Navigate back to search (simulates cancel)
    const navButton = container.querySelector(
      "[data-testid='nav-to-editor']",
    ) as HTMLButtonElement;
    act(() => {
      navButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // Selection should be preserved (coming BACK from editor)
    expect(useSelectionStore.getState().selectMode).toBe(true);
    expect(useSelectionStore.getState().selectedIds.size).toBe(3);

    unmount();
  });

  test("does NOT reset selection when navigating from /images/edit/tags back to search", () => {
    const routes = [
      {
        element: <AppShell />,
        children: [
          {
            path: "search",
            element: <TestPage id="search" />,
          },
          {
            path: "images/edit/tags",
            element: (
              <TestPage id="editor-tags" navigateTo="/search" />
            ),
          },
        ],
      },
    ];

    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/images/edit/tags"],
    });

    // Verify we are on the editor-tags page
    expect(
      container.querySelector("[data-testid='page-editor-tags']"),
    ).not.toBeNull();

    // Enter select mode with items selected
    enterSelectModeWithItems();
    expect(useSelectionStore.getState().selectMode).toBe(true);

    // Navigate back to search (simulates cancel)
    const navButton = container.querySelector(
      "[data-testid='nav-to-editor-tags']",
    ) as HTMLButtonElement;
    act(() => {
      navButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // Selection should be preserved (coming BACK from editor)
    expect(useSelectionStore.getState().selectMode).toBe(true);
    expect(useSelectionStore.getState().selectedIds.size).toBe(3);

    unmount();
  });

  test("resets selection when navigating from one anime detail to another", () => {
    const routes = [
      {
        element: <AppShell />,
        children: [
          {
            path: "anime/:animeId/images",
            element: (
              <TestPage id="anime-detail" navigateTo="/anime/99/images" />
            ),
          },
        ],
      },
    ];

    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/anime/1/images"],
    });

    // Verify we are on the anime detail page
    expect(
      container.querySelector("[data-testid='page-anime-detail']"),
    ).not.toBeNull();

    // Enter select mode with items selected
    enterSelectModeWithItems();
    expect(useSelectionStore.getState().selectMode).toBe(true);
    expect(useSelectionStore.getState().selectedIds.size).toBe(3);

    // Navigate to a different anime detail page
    const navButton = container.querySelector(
      "[data-testid='nav-to-anime-detail']",
    ) as HTMLButtonElement;
    act(() => {
      navButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // Selection should be reset (different anime)
    expect(useSelectionStore.getState().selectMode).toBe(false);
    expect(useSelectionStore.getState().selectedIds.size).toBe(0);

    unmount();
  });

  test("does NOT reset selection when navigating to /images/edit/tags", () => {
    const routes = [
      {
        element: <AppShell />,
        children: [
          {
            path: "search",
            element: (
              <TestPage id="search" navigateTo="/images/edit/tags" />
            ),
          },
          {
            path: "images/edit/tags",
            element: <TestPage id="editor-tags" />,
          },
        ],
      },
    ];

    const { container, unmount } = renderRoutes(routes, {
      initialEntries: ["/search"],
    });

    // Enter select mode with items selected
    enterSelectModeWithItems();
    expect(useSelectionStore.getState().selectMode).toBe(true);

    // Navigate to editor tags page
    const navButton = container.querySelector(
      "[data-testid='nav-to-search']",
    ) as HTMLButtonElement;
    act(() => {
      navButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // Selection should be preserved (navigating TO editor)
    expect(useSelectionStore.getState().selectMode).toBe(true);
    expect(useSelectionStore.getState().selectedIds.size).toBe(3);

    unmount();
  });
});
