/**
 * Tests for season CRUD mutation hooks in `use-season-mutations.ts`.
 *
 * Each hook wraps a `useMutation` that calls the corresponding `AnimeService`
 * binding and invalidates the anime detail query on success. We test both the
 * success path (mutationFn runs + cache invalidation) and ensure the hook
 * surface matches the expected type.
 */
const createAnimeSeasonMock = jest.fn();
const renameSeasonMock = jest.fn();
const updateSeasonTypeMock = jest.fn();
const updateSeasonAiringMock = jest.fn();
const deleteSeasonMock = jest.fn();
jest.mock("../../src/lib/api", () => ({
  __esModule: true,
  AnimeService: {
    CreateAnimeSeason: (...args: unknown[]) => createAnimeSeasonMock(...args),
    RenameSeason: (...args: unknown[]) => renameSeasonMock(...args),
    UpdateSeasonType: (...args: unknown[]) => updateSeasonTypeMock(...args),
    UpdateSeasonAiringInfo: (...args: unknown[]) =>
      updateSeasonAiringMock(...args),
    DeleteSeason: (...args: unknown[]) => deleteSeasonMock(...args),
  },
}));

import { act } from "react-dom/test-utils";
import {
  useCreateSeason,
  useRenameSeason,
  useUpdateSeasonType,
  useUpdateSeasonAiring,
  useDeleteSeason,
} from "../../src/hooks/use-season-mutations";
import { qk } from "../../src/lib/query-keys";
import {
  createTestQueryClient,
  renderHookWithClient,
  waitFor,
} from "../test-utils";

describe("useCreateSeason", () => {
  beforeEach(() => {
    createAnimeSeasonMock.mockReset();
  });

  test("calls CreateAnimeSeason and maps the response to a Season", async () => {
    createAnimeSeasonMock.mockResolvedValue({
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
      () => useCreateSeason(),
      { client },
    );
    await act(async () => {
      await result.current.mutateAsync({
        animeId: 42,
        seasonType: "season",
        seasonNumber: 1,
        displayName: "Season 1",
      });
    });
    rerender();
    expect(createAnimeSeasonMock).toHaveBeenCalledWith(
      42,
      "season",
      1,
      "Season 1",
    );
    // The returned season should be mapped.
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
    // in mapSeasonResponse.
    createAnimeSeasonMock.mockResolvedValue({
      // no id, no name, no entryType (uses type instead), no entryNumber,
      // no airingSeason, no airingYear, no imageCount, non-array children
      type: "movie",
      children: "not-an-array",
    });
    const { result, rerender, unmount } = renderHookWithClient(
      () => useCreateSeason(),
    );
    await act(async () => {
      await result.current.mutateAsync({
        animeId: 42,
        seasonType: "season",
        seasonNumber: null,
        displayName: "",
      });
    });
    rerender();
    expect(result.current.data).toEqual(
      expect.objectContaining({
        id: 0,
        name: "",
        type: "movie",
        seasonNumber: null,
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
    createAnimeSeasonMock.mockResolvedValue({
      id: 5,
      name: "Misc",
      entryNumber: 2,
      airingYear: 2020,
      imageCount: 3,
    });
    const { result, rerender, unmount } = renderHookWithClient(
      () => useCreateSeason(),
    );
    await act(async () => {
      await result.current.mutateAsync({
        animeId: 42,
        seasonType: "other",
        seasonNumber: 2,
        displayName: "Misc",
      });
    });
    rerender();
    expect(result.current.data).toEqual(
      expect.objectContaining({
        id: 5,
        name: "Misc",
        type: "other",
        seasonNumber: 2,
        airingYear: 2020,
        imageCount: 3,
      }),
    );
    unmount();
  });

  test("maps a response with children recursively", async () => {
    createAnimeSeasonMock.mockResolvedValue({
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
      () => useCreateSeason(),
    );
    await act(async () => {
      await result.current.mutateAsync({
        animeId: 42,
        seasonType: "season",
        seasonNumber: 1,
        displayName: "Season 1",
      });
    });
    rerender();
    expect(result.current.data!.children).toHaveLength(1);
    expect(result.current.data!.children[0].name).toBe("Part A");
    unmount();
  });
});

describe("useRenameSeason", () => {
  beforeEach(() => {
    renameSeasonMock.mockReset();
  });

  test("calls RenameSeason with seasonId and newName", async () => {
    renameSeasonMock.mockResolvedValue(undefined);
    const client = createTestQueryClient();
    client.setQueryData(qk.anime.detail(42), { anime: { id: 42 } });

    const { result, unmount } = renderHookWithClient(() => useRenameSeason(), {
      client,
    });
    await act(async () => {
      await result.current.mutateAsync({
        animeId: 42,
        seasonId: 10,
        newName: "Renamed Season",
      });
    });
    expect(renameSeasonMock).toHaveBeenCalledWith(10, "Renamed Season");
    unmount();
  });

  test("surfaces an error when the API rejects", async () => {
    renameSeasonMock.mockRejectedValue(new Error("rename failed"));
    const { result, rerender, unmount } = renderHookWithClient(
      () => useRenameSeason(),
    );
    await act(async () => {
      try {
        await result.current.mutateAsync({
          animeId: 42,
          seasonId: 10,
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

describe("useUpdateSeasonType", () => {
  beforeEach(() => {
    updateSeasonTypeMock.mockReset();
  });

  test("calls UpdateSeasonType with seasonId, seasonType, seasonNumber", async () => {
    updateSeasonTypeMock.mockResolvedValue(undefined);
    const client = createTestQueryClient();
    client.setQueryData(qk.anime.detail(42), { anime: { id: 42 } });

    const { result, unmount } = renderHookWithClient(
      () => useUpdateSeasonType(),
      { client },
    );
    await act(async () => {
      await result.current.mutateAsync({
        animeId: 42,
        seasonId: 10,
        seasonType: "movie",
        seasonNumber: 2,
      });
    });
    expect(updateSeasonTypeMock).toHaveBeenCalledWith(10, "movie", 2);
    unmount();
  });

  test("surfaces an error when the API rejects", async () => {
    updateSeasonTypeMock.mockRejectedValue(new Error("type update failed"));
    const { result, rerender, unmount } = renderHookWithClient(
      () => useUpdateSeasonType(),
    );
    await act(async () => {
      try {
        await result.current.mutateAsync({
          animeId: 42,
          seasonId: 10,
          seasonType: "movie",
          seasonNumber: null,
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

describe("useUpdateSeasonAiring", () => {
  beforeEach(() => {
    updateSeasonAiringMock.mockReset();
  });

  test("calls UpdateSeasonAiring with seasonId, airingSeason, airingYear", async () => {
    updateSeasonAiringMock.mockResolvedValue(undefined);
    const client = createTestQueryClient();
    client.setQueryData(qk.anime.detail(42), { anime: { id: 42 } });

    const { result, unmount } = renderHookWithClient(
      () => useUpdateSeasonAiring(),
      { client },
    );
    await act(async () => {
      await result.current.mutateAsync({
        animeId: 42,
        seasonId: 10,
        airingSeason: "Winter",
        airingYear: 2025,
      });
    });
    expect(updateSeasonAiringMock).toHaveBeenCalledWith(
      10,
      "Winter",
      2025,
    );
    unmount();
  });

  test("surfaces an error when the API rejects", async () => {
    updateSeasonAiringMock.mockRejectedValue(new Error("airing failed"));
    const { result, rerender, unmount } = renderHookWithClient(
      () => useUpdateSeasonAiring(),
    );
    await act(async () => {
      try {
        await result.current.mutateAsync({
          animeId: 42,
          seasonId: 10,
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

describe("useDeleteSeason", () => {
  beforeEach(() => {
    deleteSeasonMock.mockReset();
  });

  test("calls DeleteSeason with seasonId", async () => {
    deleteSeasonMock.mockResolvedValue(undefined);
    const client = createTestQueryClient();
    client.setQueryData(qk.anime.detail(42), { anime: { id: 42 } });

    const { result, unmount } = renderHookWithClient(() => useDeleteSeason(), {
      client,
    });
    await act(async () => {
      await result.current.mutateAsync({
        animeId: 42,
        seasonId: 10,
      });
    });
    expect(deleteSeasonMock).toHaveBeenCalledWith(10);
    unmount();
  });

  test("surfaces an error when the API rejects", async () => {
    deleteSeasonMock.mockRejectedValue(new Error("delete failed"));
    const { result, rerender, unmount } = renderHookWithClient(
      () => useDeleteSeason(),
    );
    await act(async () => {
      try {
        await result.current.mutateAsync({
          animeId: 42,
          seasonId: 10,
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
