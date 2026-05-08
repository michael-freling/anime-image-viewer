/**
 * Tests for `useTags` and `useTagMap`.
 *
 * Verifies the flat-list fetch behavior and the `select`-derived map shape.
 */
const getAllMock = jest.fn();
jest.mock("../../src/lib/api", () => ({
  __esModule: true,
  TagService: {
    GetAll: (...args: unknown[]) => getAllMock(...args),
  },
}));

import { useTagMap, useTags } from "../../src/hooks/use-tags";
import { renderHookWithClient, waitFor } from "../test-utils";

describe("useTags", () => {
  beforeEach(() => {
    getAllMock.mockReset();
  });

  test("returns the list from TagService.GetAll", async () => {
    const tags = [
      { id: 1, name: "Sunset", category: "scene" },
      { id: 2, name: "Forest", category: "nature" },
    ];
    getAllMock.mockResolvedValue(tags);
    const { result, unmount } = renderHookWithClient(() => useTags());
    await waitFor(() => result.current.isSuccess);
    expect(result.current.data).toEqual(tags);
    unmount();
  });

  test("coerces null to empty array", async () => {
    getAllMock.mockResolvedValue(null);
    const { result, unmount } = renderHookWithClient(() => useTags());
    await waitFor(() => result.current.isSuccess);
    expect(result.current.data).toEqual([]);
    unmount();
  });
});

describe("useTagMap", () => {
  beforeEach(() => {
    getAllMock.mockReset();
  });

  test("derives a Map<id, Tag> from the cached list", async () => {
    const tags = [
      { id: 10, name: "Rain", category: "nature" },
      { id: 11, name: "Beach", category: "location" },
    ];
    getAllMock.mockResolvedValue(tags);
    const { result, unmount } = renderHookWithClient(() => useTagMap());
    await waitFor(() => result.current.isSuccess);
    const map = result.current.data!;
    expect(map).toBeInstanceOf(Map);
    expect(map.get(10)?.name).toBe("Rain");
    expect(map.get(11)?.category).toBe("location");
    expect(map.size).toBe(2);
    unmount();
  });

  test("empty list yields an empty map", async () => {
    getAllMock.mockResolvedValue([]);
    const { result, unmount } = renderHookWithClient(() => useTagMap());
    await waitFor(() => result.current.isSuccess);
    expect(result.current.data?.size).toBe(0);
    unmount();
  });
});
