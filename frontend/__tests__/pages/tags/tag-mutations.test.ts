/**
 * Tests for the `tag-mutations` adapters.
 *
 * The adapters call the `TagFrontendService` binding (internal/tag package),
 * which is where the tag create/update/delete methods actually live. The
 * read-only `TagService` binding (internal/frontend) has none of them, so a
 * prior implementation that probed `TagService` silently no-op'd every
 * mutation. These tests pin the adapters to the real backend method names so
 * that regression can't come back.
 *
 * We use `jest.resetModules()` between tests because `tag-mutations` imports
 * the binding at module load time; resetting lets each case install a fresh
 * mock shape.
 */

/* eslint-disable @typescript-eslint/no-var-requires */

describe("tag-mutations", () => {
  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  function mockTagFrontendService(shape: Record<string, unknown>): void {
    jest.doMock("../../../src/lib/api", () => ({
      __esModule: true,
      TagFrontendService: shape,
    }));
  }

  test("createTag creates the tag then applies the chosen category", async () => {
    const order: string[] = [];
    const CreateTopTag = jest.fn().mockImplementation(async () => {
      order.push("create");
      return { id: 7, name: "Sunset", category: "" };
    });
    const UpdateCategory = jest.fn().mockImplementation(async () => {
      order.push("category");
      return { id: 7, name: "Sunset", category: "scene" };
    });
    mockTagFrontendService({ CreateTopTag, UpdateCategory });

    const { createTag } = require("../../../src/pages/tags/tag-mutations");
    const result = await createTag({ name: "Sunset", category: "scene" });

    expect(CreateTopTag).toHaveBeenCalledWith("Sunset");
    expect(UpdateCategory).toHaveBeenCalledWith(7, "scene");
    expect(order).toEqual(["create", "category"]);
    expect(result).toEqual({ id: 7, name: "Sunset", category: "scene" });
  });

  test("createTag skips the category call for uncategorized tags", async () => {
    const CreateTopTag = jest
      .fn()
      .mockResolvedValue({ id: 3, name: "z", category: "" });
    const UpdateCategory = jest.fn();
    mockTagFrontendService({ CreateTopTag, UpdateCategory });

    const { createTag } = require("../../../src/pages/tags/tag-mutations");
    const result = await createTag({
      name: "z",
      category: "uncategorized",
      parentId: 99,
    });

    expect(CreateTopTag).toHaveBeenCalledWith("z");
    expect(UpdateCategory).not.toHaveBeenCalled();
    expect(result).toEqual({ id: 3, name: "z", category: "" });
  });

  test("updateTag runs UpdateName then UpdateCategory", async () => {
    const order: string[] = [];
    const UpdateName = jest.fn().mockImplementation(async () => {
      order.push("name");
      return { id: 1, name: "Rain", category: "nature" };
    });
    const UpdateCategory = jest.fn().mockImplementation(async () => {
      order.push("category");
      return { id: 1, name: "Rain", category: "nature" };
    });
    mockTagFrontendService({ UpdateName, UpdateCategory });

    const { updateTag } = require("../../../src/pages/tags/tag-mutations");
    const result = await updateTag(1, { name: "Rain", category: "nature" });

    expect(UpdateName).toHaveBeenCalledWith(1, "Rain");
    expect(UpdateCategory).toHaveBeenCalledWith(1, "nature");
    expect(order).toEqual(["name", "category"]);
    // The category call's return value surfaces back to the caller.
    expect(result).toEqual({ id: 1, name: "Rain", category: "nature" });
  });

  test("updateTag maps uncategorized to an empty category string", async () => {
    const UpdateName = jest.fn().mockResolvedValue({ id: 2 });
    const UpdateCategory = jest
      .fn()
      .mockResolvedValue({ id: 2, name: "x", category: "" });
    mockTagFrontendService({ UpdateName, UpdateCategory });

    const { updateTag } = require("../../../src/pages/tags/tag-mutations");
    await updateTag(2, { name: "x", category: "uncategorized" });

    expect(UpdateName).toHaveBeenCalledWith(2, "x");
    expect(UpdateCategory).toHaveBeenCalledWith(2, "");
  });

  test("deleteTag delegates to TagFrontendService.DeleteTag", async () => {
    const DeleteTag = jest.fn().mockResolvedValue(undefined);
    mockTagFrontendService({ DeleteTag });

    const { deleteTag } = require("../../../src/pages/tags/tag-mutations");
    await deleteTag(55);
    expect(DeleteTag).toHaveBeenCalledWith(55);
  });

  test("deleteTag surfaces backend errors instead of swallowing them", async () => {
    const DeleteTag = jest.fn().mockRejectedValue(new Error("boom"));
    mockTagFrontendService({ DeleteTag });

    const { deleteTag } = require("../../../src/pages/tags/tag-mutations");
    await expect(deleteTag(1)).rejects.toThrow("boom");
  });

  test("getTagFileCount returns the numeric value from GetTagFileCount", async () => {
    const GetTagFileCount = jest.fn().mockResolvedValue(42);
    mockTagFrontendService({ GetTagFileCount });

    const { getTagFileCount } = require("../../../src/pages/tags/tag-mutations");
    const n = await getTagFileCount(3);
    expect(GetTagFileCount).toHaveBeenCalledWith(3);
    expect(n).toBe(42);
  });

  test("getTagFileCount swallows errors and returns null", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const GetTagFileCount = jest.fn().mockRejectedValue(new Error("boom"));
    mockTagFrontendService({ GetTagFileCount });

    const { getTagFileCount } = require("../../../src/pages/tags/tag-mutations");
    const n = await getTagFileCount(4);
    expect(n).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  test("getTagFileCount coerces falsy backend responses to 0", async () => {
    const GetTagFileCount = jest.fn().mockResolvedValue(undefined);
    mockTagFrontendService({ GetTagFileCount });

    const { getTagFileCount } = require("../../../src/pages/tags/tag-mutations");
    const n = await getTagFileCount(4);
    expect(n).toBe(0);
  });
});
