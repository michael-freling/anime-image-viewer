/**
 * Tests for the URL <-> filter-state helpers used by the Search page.
 */
import {
  addExcludeId,
  addIncludeId,
  cycleTagId,
  EMPTY_FILTER_STATE,
  filterStateFromSearchParams,
  filterStateToSearchParams,
  isEmptyFilterState,
  removeTagId,
  type SearchFilterState,
} from "../../../src/pages/search/filter-state";

describe("filterStateFromSearchParams", () => {
  test("returns an empty state when params are absent", () => {
    const params = new URLSearchParams();
    expect(filterStateFromSearchParams(params)).toEqual(EMPTY_FILTER_STATE);
  });

  test("parses ?q=term&tag=1,2&exclude=3,4", () => {
    const params = new URLSearchParams("q=%20hello%20&tag=2,1,2&exclude=4,3");
    const state = filterStateFromSearchParams(params);
    expect(state.query).toBe("hello");
    // Sorted + de-duped.
    expect(state.includeIds).toEqual([1, 2]);
    expect(state.excludeIds).toEqual([3, 4]);
  });

  test("drops non-numeric and non-positive ids silently", () => {
    const params = new URLSearchParams("tag=a,0,-3,7");
    const state = filterStateFromSearchParams(params);
    expect(state.includeIds).toEqual([7]);
  });
});

describe("filterStateToSearchParams", () => {
  test("omits empty fields", () => {
    expect(filterStateToSearchParams(EMPTY_FILTER_STATE)).toEqual({});
  });

  test("serialises non-empty state", () => {
    const state: SearchFilterState = {
      query: "hello",
      includeIds: [1, 2],
      excludeIds: [3],
      animeId: null,
    };
    expect(filterStateToSearchParams(state)).toEqual({
      q: "hello",
      tag: "1,2",
      exclude: "3",
    });
  });

  test("round-trip keeps meaning even though params reorder", () => {
    const state: SearchFilterState = {
      query: "foo",
      includeIds: [5, 3, 7],
      excludeIds: [2],
      animeId: null,
    };
    const encoded = filterStateToSearchParams(state);
    const params = new URLSearchParams(encoded);
    const decoded = filterStateFromSearchParams(params);
    expect(decoded.query).toBe("foo");
    expect(decoded.includeIds).toEqual([3, 5, 7]);
    expect(decoded.excludeIds).toEqual([2]);
  });

  test("anime param round-trips through URL serialization", () => {
    const state: SearchFilterState = {
      query: "",
      includeIds: [],
      excludeIds: [],
      animeId: 42,
    };
    const encoded = filterStateToSearchParams(state);
    expect(encoded).toEqual({ anime: "42" });
    const params = new URLSearchParams(encoded);
    const decoded = filterStateFromSearchParams(params);
    expect(decoded.animeId).toBe(42);
  });
});

describe("isEmptyFilterState", () => {
  test("reports the empty state as empty", () => {
    expect(isEmptyFilterState(EMPTY_FILTER_STATE)).toBe(true);
  });
  test("whitespace-only query counts as empty", () => {
    expect(
      isEmptyFilterState({ ...EMPTY_FILTER_STATE, query: "   " }),
    ).toBe(true);
  });
  test("any active filter reports non-empty", () => {
    expect(
      isEmptyFilterState({ ...EMPTY_FILTER_STATE, query: "x" }),
    ).toBe(false);
    expect(
      isEmptyFilterState({ ...EMPTY_FILTER_STATE, includeIds: [1] }),
    ).toBe(false);
    expect(
      isEmptyFilterState({ ...EMPTY_FILTER_STATE, excludeIds: [1] }),
    ).toBe(false);
  });
  test("active anime filter reports non-empty", () => {
    expect(
      isEmptyFilterState({ ...EMPTY_FILTER_STATE, animeId: 5 }),
    ).toBe(false);
  });
});

describe("addIncludeId / addExcludeId / removeTagId", () => {
  test("addIncludeId moves a tag from exclude to include", () => {
    const state: SearchFilterState = {
      ...EMPTY_FILTER_STATE,
      excludeIds: [7],
    };
    const next = addIncludeId(state, 7);
    expect(next.includeIds).toEqual([7]);
    expect(next.excludeIds).toEqual([]);
  });

  test("addExcludeId moves a tag from include to exclude", () => {
    const state: SearchFilterState = {
      ...EMPTY_FILTER_STATE,
      includeIds: [7, 9],
    };
    const next = addExcludeId(state, 7);
    expect(next.includeIds).toEqual([9]);
    expect(next.excludeIds).toEqual([7]);
  });

  test("addIncludeId is a no-op if the id is already included", () => {
    const state: SearchFilterState = {
      ...EMPTY_FILTER_STATE,
      includeIds: [1, 2],
    };
    const next = addIncludeId(state, 1);
    expect(next).toBe(state);
  });

  test("removeTagId removes from both sets", () => {
    const state: SearchFilterState = {
      query: "x",
      includeIds: [1, 2],
      excludeIds: [3, 1],
      animeId: null,
    };
    const next = removeTagId(state, 1);
    expect(next.includeIds).toEqual([2]);
    expect(next.excludeIds).toEqual([3]);
    // Doesn't touch the query.
    expect(next.query).toBe("x");
  });
});

describe("cycleTagId", () => {
  test("unset -> include -> exclude -> unset", () => {
    let state: SearchFilterState = EMPTY_FILTER_STATE;
    state = cycleTagId(state, 5);
    expect(state.includeIds).toEqual([5]);
    state = cycleTagId(state, 5);
    expect(state.excludeIds).toEqual([5]);
    expect(state.includeIds).toEqual([]);
    state = cycleTagId(state, 5);
    expect(state.includeIds).toEqual([]);
    expect(state.excludeIds).toEqual([]);
  });
});
