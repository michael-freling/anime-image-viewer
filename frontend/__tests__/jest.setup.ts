/**
 * Global jest setup.
 *
 * jsdom does not polyfill TextEncoder/TextDecoder, but react-router v7's
 * internal streaming helpers reach for them at module import time, which
 * crashes every component test that imports a router hook. We supply the
 * Node polyfills here so the import doesn't throw.
 *
 * matchMedia is likewise absent in jsdom; Chakra v3's responsive style
 * props query it during render. A no-op shim is enough for our tests —
 * we assert on layout behavior via DOM structure, not computed styles.
 */
import { TextDecoder, TextEncoder } from "util";

// React 18 emits "not wrapped in act(...)" warnings whenever an async state
// update fires outside an act boundary unless this global flag is set. The
// QueryClient dispatches background notifications through microtasks that
// jsdom delivers after our act scope closes, so we opt the entire test
// runtime into React's concurrent act environment.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

if (typeof globalThis.TextEncoder === "undefined") {
  // Node's util TextEncoder matches the Web API shape for our needs.
  globalThis.TextEncoder = TextEncoder as unknown as typeof globalThis.TextEncoder;
}
if (typeof globalThis.TextDecoder === "undefined") {
  globalThis.TextDecoder = TextDecoder as unknown as typeof globalThis.TextDecoder;
}

// Chakra v3's style system uses structuredClone when resolving recipes.
// Node 17+ has it natively; fall back to a recursive clone for jsdom's
// global shim which strips it on some jest setups. JSON round-tripping
// would fail on `undefined`, functions, Maps, and Sets.
if (typeof globalThis.structuredClone === "undefined") {
  const clone = <T>(value: T, seen = new WeakMap<object, unknown>()): T => {
    if (value === null || typeof value !== "object") return value;
    const obj = value as unknown as object;
    if (seen.has(obj)) return seen.get(obj) as T;
    if (Array.isArray(value)) {
      const arr: unknown[] = [];
      seen.set(obj, arr);
      for (const item of value) arr.push(clone(item, seen));
      return arr as unknown as T;
    }
    if (value instanceof Map) {
      const m = new Map();
      seen.set(obj, m);
      for (const [k, v] of value) m.set(clone(k, seen), clone(v, seen));
      return m as unknown as T;
    }
    if (value instanceof Set) {
      const s = new Set();
      seen.set(obj, s);
      for (const v of value) s.add(clone(v, seen));
      return s as unknown as T;
    }
    const out: Record<string, unknown> = {};
    seen.set(obj, out);
    for (const key of Object.keys(value as Record<string, unknown>)) {
      out[key] = clone((value as Record<string, unknown>)[key], seen);
    }
    return out as unknown as T;
  };
  (
    globalThis as unknown as {
      structuredClone: <T>(value: T) => T;
    }
  ).structuredClone = clone;
}

// jsdom 20 strips Node's built-in Fetch API primitives (Request/Response/
// Headers) from its globalThis. react-router v7's `createMemoryRouter` +
// RouterProvider constructs a `new Request(...)` on every navigation, so
// we install minimal stubs sufficient for the router's use case. The stubs
// don't implement body streaming, signals, or other browser-only behavior
// that our layout/route tests don't exercise.
{
  // `any` here because we assign stub constructors of different shapes
  // depending on what's missing in jsdom.
  const g = globalThis as any;

  if (typeof g.Headers === "undefined") {
    class HeadersStub {
      private readonly entries: Map<string, string>;
      constructor(init?: Record<string, string> | [string, string][]) {
        this.entries = new Map();
        if (Array.isArray(init)) {
          for (const [k, v] of init) this.entries.set(k.toLowerCase(), v);
        } else if (init && typeof init === "object") {
          for (const [k, v] of Object.entries(init)) {
            this.entries.set(k.toLowerCase(), String(v));
          }
        }
      }
      get(name: string): string | null {
        return this.entries.get(name.toLowerCase()) ?? null;
      }
      set(name: string, value: string): void {
        this.entries.set(name.toLowerCase(), value);
      }
      has(name: string): boolean {
        return this.entries.has(name.toLowerCase());
      }
      delete(name: string): void {
        this.entries.delete(name.toLowerCase());
      }
      forEach(cb: (value: string, key: string) => void): void {
        this.entries.forEach((v, k) => cb(v, k));
      }
    }
    g.Headers = HeadersStub;
  }

  if (typeof g.Request === "undefined") {
    class RequestStub {
      readonly url: string;
      readonly method: string;
      readonly headers: InstanceType<typeof g.Headers>;
      readonly signal: AbortSignal | undefined;
      readonly body: unknown;
      constructor(
        input: string | { url: string },
        init: {
          method?: string;
          headers?: unknown;
          body?: unknown;
          signal?: AbortSignal;
        } = {},
      ) {
        this.url = typeof input === "string" ? input : input.url;
        this.method = (init.method ?? "GET").toUpperCase();
        this.headers = new g.Headers(init.headers ?? {});
        this.signal = init.signal;
        this.body = init.body;
      }
    }
    g.Request = RequestStub;
  }

  if (typeof g.Response === "undefined") {
    class ResponseStub {
      readonly status: number;
      readonly statusText: string;
      readonly headers: InstanceType<typeof g.Headers>;
      readonly body: unknown;
      constructor(
        body?: unknown,
        init: { status?: number; statusText?: string; headers?: unknown } = {},
      ) {
        this.body = body;
        this.status = init.status ?? 200;
        this.statusText = init.statusText ?? "";
        this.headers = new g.Headers(init.headers ?? {});
      }
    }
    g.Response = ResponseStub;
  }
}

if (typeof window !== "undefined" && typeof window.matchMedia === "undefined") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

// jsdom lacks `ResizeObserver`; `react-photo-album` uses it to measure the
// grid container. A no-op stub is sufficient because component tests assert
// on rendered DOM rather than computed pixel layout.
if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverStub {
    observe(): void {
      /* no-op */
    }
    unobserve(): void {
      /* no-op */
    }
    disconnect(): void {
      /* no-op */
    }
  }
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserver })
    .ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}

// jsdom lacks `Element.prototype.scrollIntoView`; cmdk's keyboard handlers
// call it when focus moves between command items. Install a no-op so the
// command palette tests can exercise selection without crashing.
if (
  typeof Element !== "undefined" &&
  typeof Element.prototype.scrollIntoView === "undefined"
) {
  Element.prototype.scrollIntoView = function scrollIntoView(): void {
    /* no-op */
  };
}
