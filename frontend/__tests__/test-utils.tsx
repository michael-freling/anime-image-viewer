/**
 * Shared test helpers for Phase E2 (component + hook tests).
 *
 * We do NOT have `@testing-library/react` / `@testing-library/user-event`
 * installed in this workspace, so rather than wire them in (the task forbids
 * touching package.json), we compose minimal equivalents on top of React DOM
 * and react-dom/test-utils.
 *
 * - `renderWithClient` mounts a component into a real DOM node wrapped by a
 *   fresh `QueryClientProvider` + `MemoryRouter` so every test starts with an
 *   isolated query cache and router state.
 * - `renderHookWithClient` mirrors `@testing-library/react`'s `renderHook`
 *   for hooks that need providers around them; it captures the hook's return
 *   value on every render via a `HookProbe` helper component.
 * - `waitFor` polls a predicate with `act` until it resolves truthy or a
 *   timeout fires — used for async React Query assertions.
 * - `flushPromises` awaits a microtask turn so queued fetch promises resolve
 *   before assertions run.
 */

import { ChakraProvider } from "@chakra-ui/react";
import { ReactNode } from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import {
  createMemoryRouter,
  MemoryRouter,
  RouterProvider,
  type RouteObject,
} from "react-router";
import system from "../src/styles/theme";

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Disable retries so failing queries surface the error immediately.
        retry: false,
        // Use Infinity staleTime so cache reads don't trigger background
        // refetches in tests that share a client across hook mounts.
        // Tests that need invalidation drive it explicitly.
        staleTime: Infinity,
        refetchOnWindowFocus: false,
        // Infinite gcTime keeps entries around for cross-mount cache tests;
        // tests that care about cleanup can unmount and create a new client.
        gcTime: Infinity,
      },
      mutations: {
        retry: false,
      },
    },
    // Silence the verbose React Query error logs so test output stays readable.
    // (React Query v5 no longer supports `logger` — errors flow through
    // `onError` callbacks instead; this is fine for our purposes.)
  });
}

export interface RenderResult {
  container: HTMLElement;
  root: Root;
  client: QueryClient;
  unmount: () => void;
}

export interface RenderOptions {
  client?: QueryClient;
  routerInitialEntries?: string[];
}

/**
 * Mounts the given element inside a fresh DOM node + QueryClient + MemoryRouter
 * and returns handles the caller can use to inspect or unmount.
 */
export function renderWithClient(
  ui: ReactNode,
  options: RenderOptions = {},
): RenderResult {
  const client = options.client ?? createTestQueryClient();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <ChakraProvider value={system}>
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={options.routerInitialEntries ?? ["/"]}>
            {ui}
          </MemoryRouter>
        </QueryClientProvider>
      </ChakraProvider>,
    );
  });
  return {
    container,
    root,
    client,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

export interface HookResult<T> {
  /** The most recent return value from the hook. */
  current: T;
}

export interface RenderHookResult<T> {
  result: HookResult<T>;
  client: QueryClient;
  rerender: (newProps?: unknown) => void;
  unmount: () => void;
}

interface HookProbeProps<T> {
  hook: () => T;
  result: HookResult<T>;
}

function HookProbe<T>({ hook, result }: HookProbeProps<T>): null {
  result.current = hook();
  return null;
}

/**
 * Minimal `renderHook` substitute. Caller provides a thunk that invokes the
 * hook under test; the returned `result.current` captures the latest return
 * value. `rerender` re-renders the probe (useful when props change).
 */
export function renderHookWithClient<T>(
  callback: () => T,
  options: RenderOptions = {},
): RenderHookResult<T> {
  const client = options.client ?? createTestQueryClient();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const result: HookResult<T> = { current: undefined as unknown as T };

  const renderProbe = (cb: () => T) => {
    act(() => {
      root.render(
        <ChakraProvider value={system}>
          <QueryClientProvider client={client}>
            <MemoryRouter initialEntries={options.routerInitialEntries ?? ["/"]}>
              <HookProbe hook={cb} result={result} />
            </MemoryRouter>
          </QueryClientProvider>
        </ChakraProvider>,
      );
    });
  };

  renderProbe(callback);

  return {
    result,
    client,
    rerender: () => {
      renderProbe(callback);
    },
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

export interface WaitForOptions {
  timeout?: number;
  interval?: number;
}

/**
 * Polls `predicate` until it returns truthy or the timeout expires. Each poll
 * is wrapped in `act` so React's effect flush has a chance to run.
 */
export async function waitFor(
  predicate: () => boolean,
  { timeout = 1000, interval = 10 }: WaitForOptions = {},
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    await act(async () => {
      await Promise.resolve();
    });
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error("waitFor: timed out waiting for predicate");
}

/** Await a microtask turn inside `act` so pending promises resolve. */
export async function flushPromises(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

/**
 * Render a react-router route tree under a MemoryRouter using the provided
 * initial URL. Uses `createMemoryRouter` + `RouterProvider` so nested routes,
 * loaders, and `<Navigate>` redirects behave exactly like in production.
 */
export interface RenderRoutesOptions {
  client?: QueryClient;
  initialEntries?: string[];
  initialIndex?: number;
}

export function renderRoutes(
  routes: RouteObject[],
  options: RenderRoutesOptions = {},
): RenderResult {
  const client = options.client ?? createTestQueryClient();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const memoryRouter = createMemoryRouter(routes, {
    initialEntries: options.initialEntries ?? ["/"],
    initialIndex: options.initialIndex,
  });
  act(() => {
    root.render(
      <ChakraProvider value={system}>
        <QueryClientProvider client={client}>
          <RouterProvider router={memoryRouter} />
        </QueryClientProvider>
      </ChakraProvider>,
    );
  });
  return {
    container,
    root,
    client,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}
