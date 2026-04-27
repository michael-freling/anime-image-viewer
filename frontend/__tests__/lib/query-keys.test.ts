import { qk } from "../../src/lib/query-keys";

describe("query-keys", () => {
  describe("anime", () => {
    test("detail is namespaced under anime.all", () => {
      const detail = qk.anime.detail(42);
      expect(detail[0]).toBe(qk.anime.all[0]);
      expect(detail).toEqual(["anime", "detail", 42]);
    });

    test("list is stable across calls", () => {
      expect(qk.anime.list()).toEqual(qk.anime.list());
      expect(qk.anime.list()).toEqual(["anime", "list"]);
    });

    test("images without entryId omits the entry segment", () => {
      expect(qk.anime.images(7)).toEqual(["anime", "images", 7]);
    });

    test("images with null entryId omits the entry segment", () => {
      expect(qk.anime.images(7, null)).toEqual(["anime", "images", 7]);
    });

    test("images with entryId includes it", () => {
      expect(qk.anime.images(7, 3)).toEqual([
        "anime",
        "images",
        7,
        "entry",
        3,
      ]);
    });

    test("entries and characters keys are anime-scoped", () => {
      expect(qk.anime.entries(1)).toEqual(["anime", "entries", 1]);
      expect(qk.anime.characters(1)).toEqual(["anime", "characters", 1]);
    });
  });

  describe("tags", () => {
    test("stats sort file ids for cache stability", () => {
      const a = qk.tags.stats([3, 1, 2]);
      const b = qk.tags.stats([1, 2, 3]);
      expect(a).toEqual(b);
      expect(a).toEqual(["tags", "stats", [1, 2, 3]]);
    });

    test("list and all share the prefix", () => {
      expect(qk.tags.list()[0]).toBe(qk.tags.all[0]);
    });
  });

  describe("search", () => {
    test("search keys normalise missing optional fields", () => {
      const key = qk.search({ animeId: 1 });
      expect(key).toEqual([
        "search",
        {
          animeId: 1,
          includeTagIds: [],
          excludeTagIds: [],
          sort: null,
        },
      ]);
    });

    test("tag arrays are sorted for cache stability", () => {
      const a = qk.search({ includeTagIds: [3, 1], excludeTagIds: [5, 2] });
      const b = qk.search({ includeTagIds: [1, 3], excludeTagIds: [2, 5] });
      expect(a).toEqual(b);
    });

    test("no animeId normalises to null", () => {
      const key = qk.search({});
      expect(key[1]).toEqual({
        animeId: null,
        includeTagIds: [],
        excludeTagIds: [],
        sort: null,
      });
    });
  });

  describe("backup / config", () => {
    test("backup list and config share the all prefix", () => {
      expect(qk.backup.list()[0]).toBe(qk.backup.all[0]);
      expect(qk.backup.config()[0]).toBe(qk.backup.all[0]);
    });

    test("config key is a flat tuple", () => {
      expect(qk.config()).toEqual(["config"]);
    });
  });

  describe("aniList", () => {
    test("search includes the query string verbatim", () => {
      expect(qk.aniList.search("naruto")).toEqual([
        "aniList",
        "search",
        "naruto",
      ]);
    });
  });
});
