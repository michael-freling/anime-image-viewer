/**
 * Test stand-in for `@wailsio/runtime`.
 *
 * The real runtime is ESM that reaches for `window._wails` / `window.location`
 * and posts messages to the native Wails bridge at import time — none of which
 * exists under jsdom, and it lives in `node_modules` which jest does not
 * transform. Wiring it up in `moduleNameMapper` lets tests import the REAL
 * generated bindings (`internal/tag/tagfrontendservice.ts`, …) and exercise the
 * genuine binding surface, while intercepting only the transport call
 * (`Call.ByID`).
 *
 * Because the binding modules dispatch by opaque numeric method id
 * (`$Call.ByID(2613658866, name)`), tests assert on the forwarded *arguments*
 * and let a missing method throw (a call to a method the binding doesn't export
 * is a `TypeError`, which is exactly the class of bug this replaces). See
 * `__tests__/pages/tags/tag-mutations.test.ts`.
 */

/** The single transport seam. Tests drive/inspect this jest mock. */
export const Call = {
  // jest.fn records the arguments the binding forwards regardless of this impl.
  ByID: jest.fn(() => Promise.resolve(undefined as unknown)),
  ByName: jest.fn(() => Promise.resolve(undefined as unknown)),
};

/** Bindings annotate return types with this; only used as a value in imports. */
export class CancellablePromise<T> extends Promise<T> {}

// Generated model modules build field decoders at import time, e.g.
//   const $$createType0 = $Create.Array($Create.Any)
// so `Create.*` must exist and return callable decoders. The implementations
// mirror the real runtime closely enough that, if ever executed on data, they
// behave. Bindings only import the `Create` namespace (never the members by
// name), so everything is defined inline here to avoid export-ordering games.
type Decoder = (source: unknown) => unknown;

export const Create = {
  Any: (source: unknown): unknown => source,
  ByteSlice: (source: unknown): string => (source == null ? "" : (source as string)),
  Array: (element: Decoder) => (source: unknown): unknown[] =>
    source == null ? [] : (source as unknown[]).map(element),
  Map: (_key: Decoder, value: Decoder) => (source: unknown): Record<string, unknown> => {
    if (source == null) return {};
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(source as Record<string, unknown>)) {
      out[k] = value(v);
    }
    return out;
  },
  Nullable: (element: Decoder) => (source: unknown): unknown =>
    source == null ? null : element(source),
  Struct: (createField: Decoder) => (source: unknown): unknown => createField(source),
};
