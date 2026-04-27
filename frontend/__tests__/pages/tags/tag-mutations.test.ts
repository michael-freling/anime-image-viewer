/**
 * Tests for the dynamic `tag-mutations` adapters.
 *
 * The adapters probe `TagService` for canonical method names first
 * (`CreateTag`, `UpdateTag`, `DeleteTag`, `GetTagFileCount`) and fall back
 * to legacy shapes (`CreateTopTag`, `UpdateName` + `UpdateCategory`) when the
 * canonical methods are missing. When nothing is available we log a warning
 * but never throw — the UI still works against a stub backend.
 *
 * We use `jest.resetModules()` between tests because `tag-mutations` imports
 * TagService at module load time; resetting lets each case install a fresh
 * mock shape.
 */

/* eslint-disable @typescript-eslint/no-var-requires */

describe("tag-mutations", () => {
  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  function mockTagService(shape: Record<string, unknown>): void {
    jest.doMock("../../../src/lib/api", () => ({
      __esModule: true,
      TagService: shape,
    }));
  }

  test("createTag calls TagService.CreateTag with the full payload when available", async () => {
    const CreateTag = jest.fn().mockResolvedValue({ id: 1, name: "x", category: "scene" });
    mockTagService({ CreateTag });

    const { createTag } = require("../../../src/pages/tags/tag-mutations");
    const result = await createTag({ name: "x", category: "scene" });
    expect(CreateTag).toHaveBeenCalledWith({ name: "x", category: "scene" });
    expect(result).toEqual({ id: 1, name: "x", category: "scene" });
  });

  test("createTag falls back to Create alias when CreateTag is missing", async () => {
    const Create = jest.fn().mockResolvedValue({ id: 2 });
    mockTagService({ Create });

    const { createTag } = require("../../../src/pages/tags/tag-mutations");
    await createTag({ name: "y", category: "mood" });
    expect(Create).toHaveBeenCalledWith({ name: "y", category: "mood" });
  });

  test("createTag falls back to CreateTopTag with name-only when canonical methods are missing", async () => {
    const CreateTopTag = jest.fn().mockResolvedValue({ id: 3 });
    mockTagService({ CreateTopTag });

    const { createTag } = require("../../../src/pages/tags/tag-mutations");
    await createTag({ name: "z", category: "nature", parentId: 99 });
    expect(CreateTopTag).toHaveBeenCalledWith("z");
  });

  test("createTag logs a warning and resolves when no method is available", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    mockTagService({});

    const { createTag } = require("../../../src/pages/tags/tag-mutations");
    const result = await createTag({ name: "z", category: "nature" });
    expect(result).toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });

  test("updateTag calls TagService.UpdateTag when the canonical method exists", async () => {
    const UpdateTag = jest.fn().mockResolvedValue({ id: 9 });
    mockTagService({ UpdateTag });

    const { updateTag } = require("../../../src/pages/tags/tag-mutations");
    await updateTag(9, { name: "new", category: "scene" });
    expect(UpdateTag).toHaveBeenCalledWith(9, { name: "new", category: "scene" });
  });

  test("updateTag runs sequential UpdateName + UpdateCategory when only legacy methods exist", async () => {
    const order: string[] = [];
    const UpdateName = jest.fn().mockImplementation(async () => {
      order.push("name");
      return { id: 1 };
    });
    const UpdateCategory = jest.fn().mockImplementation(async () => {
      order.push("category");
      return { id: 1, category: "nature" };
    });
    mockTagService({ UpdateName, UpdateCategory });

    const { updateTag } = require("../../../src/pages/tags/tag-mutations");
    const result = await updateTag(1, { name: "Rain", category: "nature" });
    expect(UpdateName).toHaveBeenCalledWith(1, "Rain");
    expect(UpdateCategory).toHaveBeenCalledWith(1, "nature");
    expect(order).toEqual(["name", "category"]);
    // The last call's return value surfaces back to the caller.
    expect(result).toEqual({ id: 1, category: "nature" });
  });

  test("updateTag logs a warning and resolves when no compatible method exists", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    mockTagService({});

    const { updateTag } = require("../../../src/pages/tags/tag-mutations");
    const result = await updateTag(1, { name: "x", category: "scene" });
    expect(result).toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });

  test("deleteTag delegates to TagService.DeleteTag", async () => {
    const DeleteTag = jest.fn().mockResolvedValue(undefined);
    mockTagService({ DeleteTag });

    const { deleteTag } = require("../../../src/pages/tags/tag-mutations");
    await deleteTag(55);
    expect(DeleteTag).toHaveBeenCalledWith(55);
  });

  test("deleteTag falls back to Delete alias", async () => {
    const Delete = jest.fn().mockResolvedValue(undefined);
    mockTagService({ Delete });

    const { deleteTag } = require("../../../src/pages/tags/tag-mutations");
    await deleteTag(66);
    expect(Delete).toHaveBeenCalledWith(66);
  });

  test("deleteTag logs a warning when no method is available (no throw)", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    mockTagService({});

    const { deleteTag } = require("../../../src/pages/tags/tag-mutations");
    await expect(deleteTag(1)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });

  test("getTagFileCount returns the numeric value when the backend has GetTagFileCount", async () => {
    const GetTagFileCount = jest.fn().mockResolvedValue(42);
    mockTagService({ GetTagFileCount });

    const { getTagFileCount } = require("../../../src/pages/tags/tag-mutations");
    const n = await getTagFileCount(3);
    expect(GetTagFileCount).toHaveBeenCalledWith(3);
    expect(n).toBe(42);
  });

  test("getTagFileCount returns null when the backend lacks the method", async () => {
    mockTagService({});

    const { getTagFileCount } = require("../../../src/pages/tags/tag-mutations");
    const n = await getTagFileCount(3);
    expect(n).toBeNull();
  });

  test("getTagFileCount swallows errors and returns null", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const GetTagFileCount = jest.fn().mockRejectedValue(new Error("boom"));
    mockTagService({ GetTagFileCount });

    const { getTagFileCount } = require("../../../src/pages/tags/tag-mutations");
    const n = await getTagFileCount(4);
    expect(n).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  test("getTagFileCount coerces falsy backend responses to 0", async () => {
    const GetTagFileCount = jest.fn().mockResolvedValue(undefined);
    mockTagService({ GetTagFileCount });

    const { getTagFileCount } = require("../../../src/pages/tags/tag-mutations");
    const n = await getTagFileCount(4);
    expect(n).toBe(0);
  });
});
