/**
 * Tests for the `tag-mutations` adapters.
 *
 * Unlike a typical unit test, these DO NOT mock `lib/api`. They import the
 * genuine generated `TagFrontendService` binding and mock only the layer
 * underneath it — the Wails transport (`@wailsio/runtime`'s `Call.ByID`, swapped
 * in via jest.mock). This exercises the real binding surface: if
 * `tag-mutations.ts` calls a method the binding doesn't export, the call is a
 * `TypeError` and the test fails.
 *
 * That is deliberate. The bug this guards against was `tag-mutations.ts`
 * calling `CreateTag`/`UpdateName`/… on the wrong service — methods that never
 * existed at runtime. The previous test mocked `lib/api` and hung those methods
 * onto the mock, so it validated a shape that can't occur in the app and stayed
 * green while the feature was fully broken.
 *
 * The binding dispatches by opaque numeric method id (`$Call.ByID(2613658866,
 * …)`). To keep assertions readable, `transportCalls()` resolves those ids back
 * to method names — probed once from the real binding — so a test can assert
 * `{ method: "CreateTopTag", args: ["Sunset"] }` instead of a magic number.
 */

// Hoisted above the imports below: the generated bindings pulled in transitively
// by `lib/api` get this fake when they require "@wailsio/runtime". (A
// moduleNameMapper entry does not work here — the package's `exports` map wins
// in jest's resolver.)
jest.mock("@wailsio/runtime", () => require("../../support/wailsio-runtime-mock"));

import {
  Call,
  nextRejects,
  nextResolves,
  resetTransport,
} from "../../support/wailsio-runtime-mock";
import { TagFrontendService } from "../../../src/lib/api";
import {
  createTag,
  deleteTag,
  getTagFileCount,
  updateTag,
} from "../../../src/pages/tags/tag-mutations";

const byID = Call.ByID as jest.Mock;

// Resolve each binding method's opaque numeric id -> its name, by probing the
// real binding once. This is what lets assertions read in terms of method names.
const idToName = new Map<number, string>();
beforeAll(() => {
  for (const [name, fn] of Object.entries(TagFrontendService)) {
    if (typeof fn !== "function") continue;
    byID.mockClear();
    // arg arity is irrelevant; we only want the dispatched id.
    (fn as (...args: unknown[]) => unknown)(0, 0, 0);
    const id = byID.mock.calls[0]?.[0];
    if (typeof id === "number") idToName.set(id, name);
  }
  resetTransport();
});

/** The transport calls made so far, as readable `{ method, args }` records. */
function transportCalls(): Array<{ method: string; args: unknown[] }> {
  return byID.mock.calls.map((call) => ({
    method: idToName.get(call[0] as number) ?? `#${call[0]}`,
    args: call.slice(1),
  }));
}

describe("tag-mutations (against the real TagFrontendService binding)", () => {
  beforeEach(() => {
    resetTransport();
  });

  test("createTag with a category calls CreateTopTag then UpdateCategory", async () => {
    nextResolves({ id: 7, name: "Sunset", category: "" }); // CreateTopTag
    nextResolves({ id: 7, name: "Sunset", category: "scene" }); // UpdateCategory

    const result = await createTag({ name: "Sunset", category: "scene" });

    expect(transportCalls()).toEqual([
      { method: "CreateTopTag", args: ["Sunset"] },
      { method: "UpdateCategory", args: [7, "scene"] }, // (createdId, category)
    ]);
    expect(result).toEqual({ id: 7, name: "Sunset", category: "scene" });
  });

  test("createTag for an uncategorized tag skips the UpdateCategory round-trip", async () => {
    nextResolves({ id: 3, name: "z", category: "" });

    const result = await createTag({ name: "z", category: "uncategorized", parentId: 99 });

    // Only CreateTopTag; parentId is intentionally not persisted.
    expect(transportCalls()).toEqual([{ method: "CreateTopTag", args: ["z"] }]);
    expect(result).toEqual({ id: 3, name: "z", category: "" });
  });

  test("updateTag calls UpdateName then UpdateCategory in order", async () => {
    nextResolves({ id: 1, name: "Rain", category: "nature" }); // UpdateName
    nextResolves({ id: 1, name: "Rain", category: "nature" }); // UpdateCategory

    const result = await updateTag(1, { name: "Rain", category: "nature" });

    expect(transportCalls()).toEqual([
      { method: "UpdateName", args: [1, "Rain"] },
      { method: "UpdateCategory", args: [1, "nature"] },
    ]);
    // The category call's result is what surfaces back to the caller.
    expect(result).toEqual({ id: 1, name: "Rain", category: "nature" });
  });

  test("updateTag maps the uncategorized sentinel to an empty category string", async () => {
    nextResolves({ id: 2, name: "x", category: "" });
    nextResolves({ id: 2, name: "x", category: "" });

    await updateTag(2, { name: "x", category: "uncategorized" });

    expect(transportCalls()).toEqual([
      { method: "UpdateName", args: [2, "x"] },
      { method: "UpdateCategory", args: [2, ""] },
    ]);
  });

  test("deleteTag forwards the tag id to DeleteTag", async () => {
    nextResolves(undefined);

    await deleteTag(55);

    expect(transportCalls()).toEqual([{ method: "DeleteTag", args: [55] }]);
  });

  test("deleteTag surfaces backend errors instead of swallowing them", async () => {
    nextRejects(new Error("boom"));

    await expect(deleteTag(1)).rejects.toThrow("boom");
  });

  test("getTagFileCount returns the numeric value from GetTagFileCount", async () => {
    nextResolves(42);

    const n = await getTagFileCount(3);

    expect(transportCalls()).toEqual([{ method: "GetTagFileCount", args: [3] }]);
    expect(n).toBe(42);
  });

  test("getTagFileCount swallows errors and returns null", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    nextRejects(new Error("boom"));

    const n = await getTagFileCount(4);

    expect(n).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  test("getTagFileCount coerces a falsy backend response to 0", async () => {
    nextResolves(undefined);

    const n = await getTagFileCount(4);

    expect(n).toBe(0);
  });
});
