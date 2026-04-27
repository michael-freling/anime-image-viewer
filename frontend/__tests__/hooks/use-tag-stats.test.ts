/**
 * Tests for `useTagStats`.
 *
 * Asserts the disabled state (no fetch for an empty selection) and the
 * transform that shapes the Wails `tagStats` record into an array of entries.
 */
const readTagsByFileIDsMock = jest.fn();
jest.mock("../../src/lib/api", () => ({
  __esModule: true,
  TagService: {
    ReadTagsByFileIDs: (...args: unknown[]) => readTagsByFileIDsMock(...args),
  },
}));

import { useTagStats } from "../../src/hooks/use-tag-stats";
import { renderHookWithClient, flushPromises, waitFor } from "../test-utils";

describe("useTagStats", () => {
  beforeEach(() => {
    readTagsByFileIDsMock.mockReset();
  });

  test("is disabled when fileIds is empty", async () => {
    const { result, unmount } = renderHookWithClient(() => useTagStats([]));
    await flushPromises();
    expect(readTagsByFileIDsMock).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe("idle");
    unmount();
  });

  test("fetches when fileIds are provided", async () => {
    readTagsByFileIDsMock.mockResolvedValue({
      tagStats: {
        5: { fileCount: 2, isAddedBySelectedFiles: true },
        7: { fileCount: 1, isAddedBySelectedFiles: false },
      },
    });
    const { result, unmount } = renderHookWithClient(() =>
      useTagStats([10, 11]),
    );
    await waitFor(() => result.current.isSuccess);
    expect(readTagsByFileIDsMock).toHaveBeenCalledWith([10, 11]);
    expect(result.current.data).toEqual(
      expect.arrayContaining([
        { tagId: 5, fileCount: 2, isAddedBySelectedFiles: true },
        { tagId: 7, fileCount: 1, isAddedBySelectedFiles: false },
      ]),
    );
    expect(result.current.data).toHaveLength(2);
    unmount();
  });

  test("returns empty array when backend returns a null tagStats", async () => {
    readTagsByFileIDsMock.mockResolvedValue({ tagStats: null });
    const { result, unmount } = renderHookWithClient(() =>
      useTagStats([1]),
    );
    await waitFor(() => result.current.isSuccess);
    expect(result.current.data).toEqual([]);
    unmount();
  });
});
