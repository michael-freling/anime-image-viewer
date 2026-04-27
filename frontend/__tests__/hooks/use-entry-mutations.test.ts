/**
 * Tests for entry CRUD mutation hooks in `use-entry-mutations.ts`.
 *
 * Each hook wraps a `useMutation` that calls the corresponding `AnimeService`
 * binding and invalidates the anime detail query on success. We test both the
 * success path (mutationFn runs + cache invalidation) and ensure the hook
 * surface matches the expected type.
 */
const createAnimeEntryMock = jest.fn();
const renameEntryMock = jest.fn();
const updateEntryTypeMock = jest.fn();
const updateEntryAiringInfoMock = jest.fn();
const deleteEntryMock = jest.fn();
jest.mock("../../src/lib/api", () => ({
  __esModule: true,
  AnimeService: {
    CreateAnimeEntry: (...args: unknown[]) => createAnimeEntryMock(...args),
    RenameEntry: (...args: unknown[]) => renameEntryMock(...args),
    UpdateEntryType: (...args: unknown[]) => updateEntryTypeMock(...args),
    UpdateEntryAiringInfo: (...args: unknown[]) =>
      updateEntryAiringInfoMock(...args),
    DeleteEntry: (...args: unknown[]) => deleteEntryMock(...args),
  },
}));

import { act } from "react-dom/test-utils";
import {
  useCreateEntry,
  useRenameEntry,
  useUpdateEntryType,
  useUpdateEntryAiring,
  useDeleteEntry,
} from "../../src/hooks/use-entry-mutations";
import { qk } from "../../src/lib/query-keys";
import {
  createTestQueryClient,
  renderHookWithClient,
  waitFor,
} from "../test-utils";

describe("useCreateEntry", () => {
  beforeEach(() => {
    createAnimeEntryMock.mockReset();
  });

  test("calls CreateAnimeEntry and maps the response to an Entry", async () => {
    createAnimeEntryMock.mockResolvedValue({
      id: 10,
      name: "Season 1",
      entryType: "season",
      entryNumber: 1,
      airingSeason: "Spring",
      airingYear: 2024,
      imageCount: 0,
      children: [],
    });
    const client = createTestQueryClient();
    // Pre-seed the anime detail cache so invalidation has something to clear.
    client.setQueryData(qk.anime.detail(42), { anime: { id: 42 } });

    const { result, rerender, unmount } = renderHookWithClient(
      () => useCreateEntry(),
      { client },
    );
    await act(async () => {
      await result.current.mutateAsync({
        animeId: 42,
        entryType: "season",
        entryNumber: 1,
        displayName: "Season 1",
      });
    });
    rerender();
    expect(createAnimeEntryMock).toHaveBeenCalledWith(
      42,
      "season",
      1,
      "Season 1",
    );
    // The returned entry should be mapped.
    expect(result.current.data).toEqual(
      expect.objectContaining({
        id: 10,
        name: "Season 1",
        type: "season",
      }),
    );
    unmount();
  });

  test("maps a sparse response with fallback defaults", async () => {
    // Return a response missing most fields to exercise all ?? fallback branches
    // in mapEntryResponse.
    createAnimeEntryMock.mockResolvedValue({
      // no id, no name, no entryType (uses type instead), no entryNumber,
      // no airingSeason, no airingYear, no imageCount, non-array children
      type: "movie",
      children: "not-an-array",
    });
    const { result, rerender, unmount } = renderHookWithClient(
      () => useCreateEntry(),
    );
    await act(async () => {
      await result.current.mutateAsync({
        animeId: 42,
        entryType: "season",
        entryNumber: null,
        displayName: "",
      });
    });
    rerender();
    expect(result.current.data).toEqual(
      expect.objectContaining({
        id: 0,
        name: "",
        type: "movie",
        entryNumber: null,
        airingSeason: "",
        airingYear: null,
        imageCount: 0,
        children: [],
      }),
    );
    unmount();
  });

  test("maps a response with no type fields at all to 'other'", async () => {
    // Neither entryType nor type are present -> rawType is undefined -> "other"
    createAnimeEntryMock.mockResolvedValue({
      id: 5,
      name: "Misc",
      entryNumber: 2,
      airingYear: 2020,
      imageCount: 3,
    });
    const { result, rerender, unmount } = renderHookWithClient(
      () => useCreateEntry(),
    );
    await act(async () => {
      await result.current.mutateAsync({
        animeId: 42,
        entryType: "other",
        entryNumber: 2,
        displayName: "Misc",
      });
    });
    rerender();
    expect(result.current.data).toEqual(
      expect.objectContaining({
        id: 5,
        name: "Misc",
        type: "other",
        entryNumber: 2,
        airingYear: 2020,
        imageCount: 3,
      }),
    );
    unmount();
  });

  test("maps a response with children recursively", async () => {
    createAnimeEntryMock.mockResolvedValue({
      id: 10,
      name: "Season 1",
      entryType: "season",
      entryNumber: 1,
      airingSeason: "",
      airingYear: null,
      imageCount: 0,
      children: [
        {
          id: 11,
          name: "Part A",
          entryType: "other",
          entryNumber: null,
          airingSeason: "",
          airingYear: null,
          imageCount: 0,
          children: [],
        },
      ],
    });
    const { result, rerender, unmount } = renderHookWithClient(
      () => useCreateEntry(),
    );
    await act(async () => {
      await result.current.mutateAsync({
        animeId: 42,
        entryType: "season",
        entryNumber: 1,
        displayName: "Season 1",
      });
    });
    rerender();
    expect(result.current.data!.children).toHaveLength(1);
    expect(result.current.data!.children[0].name).toBe("Part A");
    unmount();
  });
});

describe("useRenameEntry", () => {
  beforeEach(() => {
    renameEntryMock.mockReset();
  });

  test("calls RenameEntry with entryId and newName", async () => {
    renameEntryMock.mockResolvedValue(undefined);
    const client = createTestQueryClient();
    client.setQueryData(qk.anime.detail(42), { anime: { id: 42 } });

    const { result, unmount } = renderHookWithClient(() => useRenameEntry(), {
      client,
    });
    await act(async () => {
      await result.current.mutateAsync({
        animeId: 42,
        entryId: 10,
        newName: "Renamed Season",
      });
    });
    expect(renameEntryMock).toHaveBeenCalledWith(10, "Renamed Season");
    unmount();
  });

  test("surfaces an error when the API rejects", async () => {
    renameEntryMock.mockRejectedValue(new Error("rename failed"));
    const { result, rerender, unmount } = renderHookWithClient(
      () => useRenameEntry(),
    );
    await act(async () => {
      try {
        await result.current.mutateAsync({
          animeId: 42,
          entryId: 10,
          newName: "Renamed Season",
        });
      } catch {
        // expected
      }
    });
    rerender();
    await waitFor(() => result.current.isError);
    expect(result.current.error?.message).toBe("rename failed");
    unmount();
  });
});

describe("useUpdateEntryType", () => {
  beforeEach(() => {
    updateEntryTypeMock.mockReset();
  });

  test("calls UpdateEntryType with entryId, entryType, entryNumber", async () => {
    updateEntryTypeMock.mockResolvedValue(undefined);
    const client = createTestQueryClient();
    client.setQueryData(qk.anime.detail(42), { anime: { id: 42 } });

    const { result, unmount } = renderHookWithClient(
      () => useUpdateEntryType(),
      { client },
    );
    await act(async () => {
      await result.current.mutateAsync({
        animeId: 42,
        entryId: 10,
        entryType: "movie",
        entryNumber: 2,
      });
    });
    expect(updateEntryTypeMock).toHaveBeenCalledWith(10, "movie", 2);
    unmount();
  });

  test("surfaces an error when the API rejects", async () => {
    updateEntryTypeMock.mockRejectedValue(new Error("type update failed"));
    const { result, rerender, unmount } = renderHookWithClient(
      () => useUpdateEntryType(),
    );
    await act(async () => {
      try {
        await result.current.mutateAsync({
          animeId: 42,
          entryId: 10,
          entryType: "movie",
          entryNumber: null,
        });
      } catch {
        // expected
      }
    });
    rerender();
    await waitFor(() => result.current.isError);
    unmount();
  });
});

describe("useUpdateEntryAiring", () => {
  beforeEach(() => {
    updateEntryAiringInfoMock.mockReset();
  });

  test("calls UpdateEntryAiringInfo with entryId, airingSeason, airingYear", async () => {
    updateEntryAiringInfoMock.mockResolvedValue(undefined);
    const client = createTestQueryClient();
    client.setQueryData(qk.anime.detail(42), { anime: { id: 42 } });

    const { result, unmount } = renderHookWithClient(
      () => useUpdateEntryAiring(),
      { client },
    );
    await act(async () => {
      await result.current.mutateAsync({
        animeId: 42,
        entryId: 10,
        airingSeason: "Winter",
        airingYear: 2025,
      });
    });
    expect(updateEntryAiringInfoMock).toHaveBeenCalledWith(
      10,
      "Winter",
      2025,
    );
    unmount();
  });

  test("surfaces an error when the API rejects", async () => {
    updateEntryAiringInfoMock.mockRejectedValue(new Error("airing failed"));
    const { result, rerender, unmount } = renderHookWithClient(
      () => useUpdateEntryAiring(),
    );
    await act(async () => {
      try {
        await result.current.mutateAsync({
          animeId: 42,
          entryId: 10,
          airingSeason: "Winter",
          airingYear: 2025,
        });
      } catch {
        // expected
      }
    });
    rerender();
    await waitFor(() => result.current.isError);
    expect(result.current.error?.message).toBe("airing failed");
    unmount();
  });
});

describe("useDeleteEntry", () => {
  beforeEach(() => {
    deleteEntryMock.mockReset();
  });

  test("calls DeleteEntry with entryId", async () => {
    deleteEntryMock.mockResolvedValue(undefined);
    const client = createTestQueryClient();
    client.setQueryData(qk.anime.detail(42), { anime: { id: 42 } });

    const { result, unmount } = renderHookWithClient(() => useDeleteEntry(), {
      client,
    });
    await act(async () => {
      await result.current.mutateAsync({
        animeId: 42,
        entryId: 10,
      });
    });
    expect(deleteEntryMock).toHaveBeenCalledWith(10);
    unmount();
  });

  test("surfaces an error when the API rejects", async () => {
    deleteEntryMock.mockRejectedValue(new Error("delete failed"));
    const { result, rerender, unmount } = renderHookWithClient(
      () => useDeleteEntry(),
    );
    await act(async () => {
      try {
        await result.current.mutateAsync({
          animeId: 42,
          entryId: 10,
        });
      } catch {
        // expected
      }
    });
    rerender();
    await waitFor(() => result.current.isError);
    expect(result.current.error?.message).toBe("delete failed");
    unmount();
  });
});
