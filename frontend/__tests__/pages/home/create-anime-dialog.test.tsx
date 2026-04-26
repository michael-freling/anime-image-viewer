/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * Tests for `CreateAnimeDialog`.
 *
 * The dialog:
 *   1. Lets the user type a name and search AniList.
 *   2. Optionally select an AniList result (fills in the name field).
 *   3. Calls `AnimeService.CreateAnime(name)` on submit.
 *   4. If an AniList result was selected, also calls
 *      `AnimeService.ImportFromAniList(animeId, aniListId)`.
 *   5. On success: invalidates the anime list cache, shows a toast,
 *      navigates to `/anime/:id`, and closes the dialog.
 *   6. On error: shows the error inline in the dialog body.
 *
 * We stub `@chakra-ui/react` + `lucide-react` via the shared chakra-stub
 * factory, and mock the `useAniListSearch` hook directly for predictable
 * test control of search results.
 */

jest.mock("@chakra-ui/react", () =>
  require("../../components/chakra-stub").chakraStubFactory(),
);
jest.mock("lucide-react", () =>
  require("../../components/chakra-stub").lucideStubFactory(),
);

const createAnimeMock = jest.fn();
const importFromAniListMock = jest.fn();

jest.mock("../../../src/lib/api", () => ({
  __esModule: true,
  AnimeService: {
    CreateAnime: (...args: unknown[]) => createAnimeMock(...args),
    ImportFromAniList: (...args: unknown[]) => importFromAniListMock(...args),
  },
}));

const toastSuccess = jest.fn();
const toastError = jest.fn();
const toastWarning = jest.fn();
jest.mock("../../../src/components/ui/toaster", () => ({
  __esModule: true,
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
    warning: (...args: unknown[]) => toastWarning(...args),
  },
}));

const navigateMock = jest.fn();
jest.mock("react-router", () => {
  const actual = jest.requireActual<typeof import("react-router")>(
    "react-router",
  );
  return {
    __esModule: true,
    ...actual,
    useNavigate: () => navigateMock,
  };
});

// Mock the useAniListSearch hook directly so we can control search results
// without relying on the async React Query pipeline.
const useAniListSearchMock = jest.fn();
jest.mock("../../../src/hooks/use-anilist-search", () => ({
  __esModule: true,
  useAniListSearch: (...args: unknown[]) => useAniListSearchMock(...args),
}));

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";

import { CreateAnimeDialog } from "../../../src/pages/home/create-anime-dialog";
import { qk } from "../../../src/lib/query-keys";

interface Rendered {
  container: HTMLDivElement;
  root: Root;
  client: QueryClient;
  unmount: () => void;
  rerender: (el: React.ReactElement) => void;
}

function render(el: React.ReactElement, client?: QueryClient): Rendered {
  const queryClient =
    client ??
    new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Infinity, gcTime: Infinity },
        mutations: { retry: false },
      },
    });
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root!: Root;
  act(() => {
    root = createRoot(container);
    root.render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(MemoryRouter, null, el),
      ),
    );
  });
  return {
    container,
    root,
    client: queryClient,
    rerender(next) {
      act(() => {
        root.render(
          createElement(
            QueryClientProvider,
            { client: queryClient },
            createElement(MemoryRouter, null, next),
          ),
        );
      });
    },
    unmount() {
      act(() => {
        root.unmount();
      });
      container.parentNode?.removeChild(container);
    },
  };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const ANILIST_RESULTS = [
  {
    id: 101,
    titleRomaji: "Shingeki no Kyojin",
    titleEnglish: "Attack on Titan",
    titleNative: "\u9032\u6483\u306e\u5de8\u4eba",
    format: "TV",
    status: "FINISHED",
    season: "SPRING",
    seasonYear: 2013,
    episodes: 25,
    coverImageUrl: "https://example.com/aot.jpg",
  },
  {
    id: 102,
    titleRomaji: "Shingeki no Bahamut",
    titleEnglish: "Rage of Bahamut",
    titleNative: "\u795e\u6483\u306e\u30d0\u30cf\u30e0\u30fc\u30c8",
    format: "TV",
    status: "FINISHED",
    season: "FALL",
    seasonYear: 2014,
    episodes: 12,
    coverImageUrl: "https://example.com/bahamut.jpg",
  },
];

/** Helper to build a mock return value for useAniListSearch. */
function mockAniListResult(data: typeof ANILIST_RESULTS | null = null) {
  return {
    data: data ?? [],
    isLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
  };
}

describe("CreateAnimeDialog", () => {
  beforeEach(() => {
    createAnimeMock.mockReset();
    importFromAniListMock.mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();
    toastWarning.mockReset();
    navigateMock.mockReset();
    useAniListSearchMock.mockReset();
    // Default: no search results.
    useAniListSearchMock.mockReturnValue(mockAniListResult());
  });

  test("renders name input and Create button when open", () => {
    const r = render(
      createElement(CreateAnimeDialog, { open: true, onClose: jest.fn() }),
    );
    try {
      const input = r.container.querySelector(
        "[data-testid='create-anime-name']",
      );
      expect(input).not.toBeNull();
      const submit = r.container.querySelector(
        "[data-testid='create-anime-submit']",
      );
      expect(submit).not.toBeNull();
      expect(r.container.textContent).toContain("Create anime");
    } finally {
      r.unmount();
    }
  });

  test("does not render dialog content when open=false", () => {
    const r = render(
      createElement(CreateAnimeDialog, { open: false, onClose: jest.fn() }),
    );
    try {
      const dialog = r.container.querySelector(
        "[data-testid='create-anime-dialog']",
      );
      expect(dialog).toBeNull();
    } finally {
      r.unmount();
    }
  });

  test("Create button is disabled when name is empty", () => {
    const r = render(
      createElement(CreateAnimeDialog, { open: true, onClose: jest.fn() }),
    );
    try {
      const submit = r.container.querySelector<HTMLButtonElement>(
        "[data-testid='create-anime-submit']",
      );
      expect(submit).not.toBeNull();
      expect(submit!.disabled).toBe(true);
    } finally {
      r.unmount();
    }
  });

  test("Create button is enabled when name is non-empty", async () => {
    const r = render(
      createElement(CreateAnimeDialog, { open: true, onClose: jest.fn() }),
    );
    try {
      const input = r.container.querySelector<HTMLInputElement>(
        "[data-testid='create-anime-name']",
      );
      setInputValue(input!, "My Anime");
      await flush();
      const submit = r.container.querySelector<HTMLButtonElement>(
        "[data-testid='create-anime-submit']",
      );
      expect(submit!.disabled).toBe(false);
    } finally {
      r.unmount();
    }
  });

  test("successful creation calls CreateAnime, shows toast, closes dialog, and navigates", async () => {
    createAnimeMock.mockResolvedValue({ id: 42, name: "My Anime" });
    const onClose = jest.fn();
    const r = render(
      createElement(CreateAnimeDialog, { open: true, onClose }),
    );
    // Prime the cache so we can observe invalidation.
    r.client.setQueryData(qk.anime.list(), [
      { id: 5, name: "Existing", imageCount: 0 },
    ]);
    try {
      const input = r.container.querySelector<HTMLInputElement>(
        "[data-testid='create-anime-name']",
      );
      setInputValue(input!, "My Anime");
      await flush();

      const submit = r.container.querySelector<HTMLButtonElement>(
        "[data-testid='create-anime-submit']",
      );
      await act(async () => {
        submit!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(createAnimeMock).toHaveBeenCalledWith("My Anime");
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(toastSuccess).toHaveBeenCalled();
      expect(navigateMock).toHaveBeenCalledWith("/anime/42");

      // Cache was invalidated.
      const state = r.client.getQueryState(qk.anime.list());
      expect(state?.isInvalidated).toBe(true);
    } finally {
      r.unmount();
    }
  });

  test("AniList search results appear when typing", async () => {
    // Return results when the hook is called with a non-empty query.
    useAniListSearchMock.mockImplementation((query: string) => {
      if (query.trim().length > 0) {
        return mockAniListResult(ANILIST_RESULTS);
      }
      return mockAniListResult();
    });

    const r = render(
      createElement(CreateAnimeDialog, { open: true, onClose: jest.fn() }),
    );
    try {
      const input = r.container.querySelector<HTMLInputElement>(
        "[data-testid='create-anime-name']",
      );
      setInputValue(input!, "Shingeki");
      await flush();

      const resultItems = r.container.querySelectorAll(
        "[data-testid='anilist-result-item']",
      );
      expect(resultItems.length).toBe(2);
      expect(resultItems[0].textContent).toContain("Shingeki no Kyojin");
      expect(resultItems[0].textContent).toContain("AniList ID: 101");
      expect(resultItems[1].textContent).toContain("Shingeki no Bahamut");
    } finally {
      r.unmount();
    }
  });

  test("selecting an AniList result fills in name field", async () => {
    useAniListSearchMock.mockImplementation((query: string) => {
      if (query.trim().length > 0) {
        return mockAniListResult(ANILIST_RESULTS);
      }
      return mockAniListResult();
    });

    const r = render(
      createElement(CreateAnimeDialog, { open: true, onClose: jest.fn() }),
    );
    try {
      const input = r.container.querySelector<HTMLInputElement>(
        "[data-testid='create-anime-name']",
      );
      setInputValue(input!, "Shingeki");
      await flush();

      const resultItems = r.container.querySelectorAll<HTMLElement>(
        "[data-testid='anilist-result-item']",
      );
      expect(resultItems.length).toBeGreaterThan(0);

      // Click the first result
      act(() => {
        resultItems[0].dispatchEvent(
          new MouseEvent("click", { bubbles: true }),
        );
      });
      await flush();

      // The input should now be filled with the romaji title
      const updatedInput = r.container.querySelector<HTMLInputElement>(
        "[data-testid='create-anime-name']",
      );
      expect(updatedInput!.value).toBe("Shingeki no Kyojin");
    } finally {
      r.unmount();
    }
  });

  test("creating with AniList selection calls both CreateAnime and ImportFromAniList", async () => {
    useAniListSearchMock.mockImplementation((query: string) => {
      if (query.trim().length > 0) {
        return mockAniListResult(ANILIST_RESULTS);
      }
      return mockAniListResult();
    });
    createAnimeMock.mockResolvedValue({ id: 99, name: "Shingeki no Kyojin" });
    importFromAniListMock.mockResolvedValue({
      entriesCreated: 3,
      charactersCreated: 10,
    });

    const onClose = jest.fn();
    const r = render(
      createElement(CreateAnimeDialog, { open: true, onClose }),
    );
    try {
      const input = r.container.querySelector<HTMLInputElement>(
        "[data-testid='create-anime-name']",
      );
      setInputValue(input!, "Shingeki");
      await flush();

      // Select an AniList result
      const resultItems = r.container.querySelectorAll<HTMLElement>(
        "[data-testid='anilist-result-item']",
      );
      act(() => {
        resultItems[0].dispatchEvent(
          new MouseEvent("click", { bubbles: true }),
        );
      });
      await flush();

      // Submit
      const submit = r.container.querySelector<HTMLButtonElement>(
        "[data-testid='create-anime-submit']",
      );
      await act(async () => {
        submit!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(createAnimeMock).toHaveBeenCalledWith("Shingeki no Kyojin");
      expect(importFromAniListMock).toHaveBeenCalledWith(99, 101);
      expect(toastSuccess).toHaveBeenCalled();
      expect(navigateMock).toHaveBeenCalledWith("/anime/99");
      expect(onClose).toHaveBeenCalledTimes(1);
    } finally {
      r.unmount();
    }
  });

  test("error from CreateAnime shows error inline in dialog", async () => {
    createAnimeMock.mockRejectedValue(new Error("Name already taken"));
    const onClose = jest.fn();
    const r = render(
      createElement(CreateAnimeDialog, { open: true, onClose }),
    );
    try {
      const input = r.container.querySelector<HTMLInputElement>(
        "[data-testid='create-anime-name']",
      );
      setInputValue(input!, "Existing Anime");
      await flush();

      const submit = r.container.querySelector<HTMLButtonElement>(
        "[data-testid='create-anime-submit']",
      );
      await act(async () => {
        submit!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(createAnimeMock).toHaveBeenCalledWith("Existing Anime");
      expect(onClose).not.toHaveBeenCalled();
      const errorEl = r.container.querySelector(
        "[data-testid='create-anime-error']",
      );
      expect(errorEl).not.toBeNull();
      expect(errorEl!.textContent).toContain("Name already taken");
    } finally {
      r.unmount();
    }
  });

  test("AniList import failure after successful create still navigates but warns", async () => {
    useAniListSearchMock.mockImplementation((query: string) => {
      if (query.trim().length > 0) {
        return mockAniListResult(ANILIST_RESULTS);
      }
      return mockAniListResult();
    });
    createAnimeMock.mockResolvedValue({ id: 77, name: "Test Anime" });
    importFromAniListMock.mockRejectedValue(new Error("AniList API down"));

    const onClose = jest.fn();
    const r = render(
      createElement(CreateAnimeDialog, { open: true, onClose }),
    );
    try {
      const input = r.container.querySelector<HTMLInputElement>(
        "[data-testid='create-anime-name']",
      );
      setInputValue(input!, "Shingeki");
      await flush();

      // Select an AniList result
      const resultItems = r.container.querySelectorAll<HTMLElement>(
        "[data-testid='anilist-result-item']",
      );
      act(() => {
        resultItems[0].dispatchEvent(
          new MouseEvent("click", { bubbles: true }),
        );
      });
      await flush();

      const submit = r.container.querySelector<HTMLButtonElement>(
        "[data-testid='create-anime-submit']",
      );
      await act(async () => {
        submit!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
        await Promise.resolve();
      });

      // Anime was still created and we navigate
      expect(createAnimeMock).toHaveBeenCalled();
      expect(importFromAniListMock).toHaveBeenCalled();
      expect(toastWarning).toHaveBeenCalled();
      expect(toastSuccess).toHaveBeenCalled();
      expect(navigateMock).toHaveBeenCalledWith("/anime/77");
      expect(onClose).toHaveBeenCalledTimes(1);
    } finally {
      r.unmount();
    }
  });

  test("Cancel button closes the dialog and resets state", async () => {
    const onClose = jest.fn();
    const r = render(
      createElement(CreateAnimeDialog, { open: true, onClose }),
    );
    try {
      const input = r.container.querySelector<HTMLInputElement>(
        "[data-testid='create-anime-name']",
      );
      setInputValue(input!, "Partial entry");
      await flush();

      const cancel = r.container.querySelector<HTMLButtonElement>(
        "[data-testid='create-anime-cancel']",
      );
      expect(cancel).not.toBeNull();
      act(() => {
        cancel!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });

      expect(onClose).toHaveBeenCalledTimes(1);
    } finally {
      r.unmount();
    }
  });

  test("trims whitespace from the name before creating", async () => {
    createAnimeMock.mockResolvedValue({ id: 50, name: "Trimmed Name" });
    const onClose = jest.fn();
    const r = render(
      createElement(CreateAnimeDialog, { open: true, onClose }),
    );
    try {
      const input = r.container.querySelector<HTMLInputElement>(
        "[data-testid='create-anime-name']",
      );
      setInputValue(input!, "  Trimmed Name  ");
      await flush();

      const submit = r.container.querySelector<HTMLButtonElement>(
        "[data-testid='create-anime-submit']",
      );
      await act(async () => {
        submit!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(createAnimeMock).toHaveBeenCalledWith("Trimmed Name");
    } finally {
      r.unmount();
    }
  });
});
