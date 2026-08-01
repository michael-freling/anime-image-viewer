/**
 * Tests for the `tag-mutations` adapters.
 *
 * Unlike a typical unit test, these DO NOT mock `lib/api`. They import the
 * genuine generated `TagFrontendService` binding and mock only the layer
 * underneath it — the Wails transport (`@wailsio/runtime`'s `Call.ByID`, swapped
 * in via `moduleNameMapper`). This means the test exercises the real binding
 * surface: if `tag-mutations.ts` calls a method the binding doesn't export, the
 * call is a `TypeError` and the test fails.
 *
 * That is deliberate. The bug this guards against was `tag-mutations.ts`
 * calling `CreateTag`/`UpdateName`/… on the wrong service — methods that never
 * existed at runtime. The previous test mocked `lib/api` and hung those methods
 * onto the mock, so it validated a shape that can't occur in the app and stayed
 * green while the feature was fully broken. Testing against the real binding +
 * a transport seam removes the ability for the mock to lie.
 *
 * The binding dispatches by opaque numeric method id, so assertions target the
 * business arguments forwarded to the transport (everything after the id).
 */

// Swap the Wails transport for a controllable stand-in. jest.mock() is hoisted
// above the imports below, so when `tag-mutations` -> `lib/api` -> the generated
// bindings require "@wailsio/runtime", they get this fake. (A moduleNameMapper
// entry does not work here: the package's `exports` map wins in jest's resolver.)
jest.mock("@wailsio/runtime", () => require("../../support/wailsio-runtime-mock"));

import { Call } from "../../support/wailsio-runtime-mock";
import {
  createTag,
  deleteTag,
  getTagFileCount,
  updateTag,
} from "../../../src/pages/tags/tag-mutations";

const byID = Call.ByID as jest.Mock;

/** Business args forwarded to the transport for the Nth call (drop method id). */
function argsOf(callIndex: number): unknown[] {
  return byID.mock.calls[callIndex].slice(1);
}

describe("tag-mutations (against the real TagFrontendService binding)", () => {
  beforeEach(() => {
    byID.mockReset();
  });

  test("createTag with a category calls CreateTopTag then UpdateCategory", async () => {
    byID
      .mockResolvedValueOnce({ id: 7, name: "Sunset", category: "" }) // CreateTopTag
      .mockResolvedValueOnce({ id: 7, name: "Sunset", category: "scene" }); // UpdateCategory

    const result = await createTag({ name: "Sunset", category: "scene" });

    expect(byID).toHaveBeenCalledTimes(2);
    expect(argsOf(0)).toEqual(["Sunset"]); // CreateTopTag(name)
    expect(argsOf(1)).toEqual([7, "scene"]); // UpdateCategory(createdId, category)
    expect(result).toEqual({ id: 7, name: "Sunset", category: "scene" });
  });

  test("createTag for an uncategorized tag skips the UpdateCategory round-trip", async () => {
    byID.mockResolvedValueOnce({ id: 3, name: "z", category: "" });

    const result = await createTag({ name: "z", category: "uncategorized", parentId: 99 });

    expect(byID).toHaveBeenCalledTimes(1);
    expect(argsOf(0)).toEqual(["z"]); // only CreateTopTag(name); parentId is not persisted
    expect(result).toEqual({ id: 3, name: "z", category: "" });
  });

  test("updateTag calls UpdateName then UpdateCategory in order", async () => {
    byID
      .mockResolvedValueOnce({ id: 1, name: "Rain", category: "nature" }) // UpdateName
      .mockResolvedValueOnce({ id: 1, name: "Rain", category: "nature" }); // UpdateCategory

    const result = await updateTag(1, { name: "Rain", category: "nature" });

    expect(byID).toHaveBeenCalledTimes(2);
    expect(argsOf(0)).toEqual([1, "Rain"]); // UpdateName(id, name)
    expect(argsOf(1)).toEqual([1, "nature"]); // UpdateCategory(id, category)
    // The category call's result is what surfaces back to the caller.
    expect(result).toEqual({ id: 1, name: "Rain", category: "nature" });
  });

  test("updateTag maps the uncategorized sentinel to an empty category string", async () => {
    byID
      .mockResolvedValueOnce({ id: 2, name: "x", category: "" })
      .mockResolvedValueOnce({ id: 2, name: "x", category: "" });

    await updateTag(2, { name: "x", category: "uncategorized" });

    expect(argsOf(0)).toEqual([2, "x"]);
    expect(argsOf(1)).toEqual([2, ""]);
  });

  test("deleteTag forwards the tag id to DeleteTag", async () => {
    byID.mockResolvedValueOnce(undefined);

    await deleteTag(55);

    expect(byID).toHaveBeenCalledTimes(1);
    expect(argsOf(0)).toEqual([55]);
  });

  test("deleteTag surfaces backend errors instead of swallowing them", async () => {
    byID.mockRejectedValueOnce(new Error("boom"));

    await expect(deleteTag(1)).rejects.toThrow("boom");
  });

  test("getTagFileCount returns the numeric value from GetTagFileCount", async () => {
    byID.mockResolvedValueOnce(42);

    const n = await getTagFileCount(3);

    expect(argsOf(0)).toEqual([3]);
    expect(n).toBe(42);
  });

  test("getTagFileCount swallows errors and returns null", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    byID.mockRejectedValueOnce(new Error("boom"));

    const n = await getTagFileCount(4);

    expect(n).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  test("getTagFileCount coerces a falsy backend response to 0", async () => {
    byID.mockResolvedValueOnce(undefined);

    const n = await getTagFileCount(4);

    expect(n).toBe(0);
  });
});
