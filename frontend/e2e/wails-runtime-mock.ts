/**
 * Mock implementation of `@wailsio/runtime` for E2E tests.
 *
 * The real Wails runtime uses `Call.ByID(methodId, ...args)` to RPC into the
 * Go backend. This mock intercepts those calls and returns canned responses
 * keyed by method ID. The mock data is designed to exercise the image URL
 * rendering path so the E2E tests can verify that `/files/files/` doubling
 * never happens.
 *
 * Method IDs are extracted from the generated binding files:
 *   - 865956209  = AnimeService.ListAnime
 *   - 1879922067 = AnimeService.GetAnimeDetails
 *   - 4280109956 = AnimeService.SearchImagesByAnime
 *   - 3080806311 = AnimeService.GetFolderImages
 *   - 2622912256 = AnimeService.GetImageTagIDs
 */

/* ---------- Mock data --------------------------------------------------- */

const MOCK_ANIME_LIST = [
  {
    id: 1,
    name: "Cowboy Bebop",
    imageCount: 3,
  },
];

const MOCK_ANIME_DETAILS = {
  anime: { id: 1, name: "Cowboy Bebop", aniListId: null },
  tags: [],
  folders: [{ id: 10, name: "bebop-images", path: "/bebop", imageCount: 3, inherited: false }],
  folderTree: { id: 10, name: "bebop-images", imageCount: 3, children: [] },
  entries: [
    {
      id: 100,
      name: "Session 1",
      type: "season",
      entryNumber: 1,
      airingSeason: "",
      airingYear: null,
      imageCount: 2,
      children: [],
    },
  ],
};

/**
 * Image paths intentionally include paths that start with `/files/` to test
 * the guard in `fileResizeUrl`. If the guard is missing, these would produce
 * `/files/files/...` in the rendered `<img>` elements.
 */
const MOCK_IMAGES = {
  images: [
    { id: 1, name: "spike-spiegel.png", path: "/files/bebop/spike-spiegel.png" },
    { id: 2, name: "faye-valentine.png", path: "/files/bebop/faye-valentine.png" },
    // Windows-style backslash path — Go's strings.TrimPrefix on Windows
    // produces "/files\dir\img.png" because path separators are backslashes.
    { id: 3, name: "jet-black.png", path: "/files\\bebop\\jet-black.png" },
  ],
};

const MOCK_ENTRY_IMAGES = {
  images: [
    { id: 1, name: "spike-spiegel.png", path: "/files/bebop/spike-spiegel.png" },
    { id: 2, name: "faye-valentine.png", path: "/files/bebop/faye-valentine.png" },
  ],
};

/* ---------- Method ID -> response map ----------------------------------- */

type MockHandler = (...args: unknown[]) => unknown;

const METHOD_HANDLERS: Record<number, MockHandler> = {
  // AnimeService.ListAnime
  865956209: () => MOCK_ANIME_LIST,
  // AnimeService.GetAnimeDetails
  1879922067: () => MOCK_ANIME_DETAILS,
  // AnimeService.SearchImagesByAnime
  4280109956: () => MOCK_IMAGES,
  // AnimeService.GetFolderImages
  3080806311: () => MOCK_ENTRY_IMAGES,
  // AnimeService.GetImageTagIDs
  2622912256: () => ({}),
  // AnimeService.GetAnimeEntries
  2287165393: () => MOCK_ANIME_DETAILS.entries,
  // TagService.GetAll
  3891498849: () => [],
  // SearchService.SearchImages
  2245933281: () => MOCK_IMAGES,
  // ConfigFrontendService.GetConfig
  2615979430: () => ({ imageRootDirectory: "/mock/images" }),
  // BackupFrontendService.ListBackups
  2293902011: () => [],
  // DirectoryService.ReadDirectoryTree
  3891498850: () => ({ directories: [] }),
};

/* ---------- Mock Call / Create / CancellablePromise --------------------- */

/**
 * Minimal CancellablePromise that just wraps a native Promise. The real
 * Wails runtime adds `.cancel()` — we provide a no-op implementation.
 */
class MockCancellablePromise<T> extends Promise<T> {
  cancel(): void {
    /* no-op */
  }
}

const Call = {
  ByID(methodId: number, ...args: unknown[]): MockCancellablePromise<unknown> {
    const handler = METHOD_HANDLERS[methodId];
    if (handler) {
      return MockCancellablePromise.resolve(handler(...args));
    }
    console.warn(
      `[wails-runtime-mock] Unhandled Call.ByID(${methodId}, ${JSON.stringify(args)}). Returning empty object.`,
    );
    return MockCancellablePromise.resolve({});
  },
};

const Create = {
  Any: (source: unknown) => source,
  Array:
    (elementCreator: (s: unknown) => unknown) =>
    (source: unknown): unknown[] => {
      if (!Array.isArray(source)) return [];
      return source.map(elementCreator);
    },
  Map:
    (_keyCreator: unknown, valueCreator: (s: unknown) => unknown) =>
    (source: unknown): Record<string, unknown> => {
      if (!source || typeof source !== "object") return {};
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(source as Record<string, unknown>)) {
        result[k] = valueCreator(v);
      }
      return result;
    },
  Nullable:
    (creator: (s: unknown) => unknown) =>
    (source: unknown): unknown => {
      if (source == null) return null;
      return creator(source);
    },
  Struct: (creator: new (s: unknown) => unknown) => (source: unknown) =>
    new creator(source),
};

/* ---------- Additional runtime exports ---------------------------------- */

/**
 * No-op event subscription. The real runtime provides Events.On/Off for
 * Wails event bus; E2E tests don't exercise real-time events.
 */
const Events = {
  On: () => () => {
    /* unsubscribe no-op */
  },
  Off: () => {
    /* no-op */
  },
  Emit: () => {
    /* no-op */
  },
};

export { Call, Create, MockCancellablePromise as CancellablePromise, Events };
