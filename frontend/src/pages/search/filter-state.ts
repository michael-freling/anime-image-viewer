/**
 * URL-sync helpers for the Search page.
 *
 * Spec: ui-design.md §3.4 (search with inline filters) + task brief:
 *   "URL sync: filter state syncs to query params (?q=foo&tag=1,2,3&type=scene)
 *    via useSearchParams so deep-link + back button work".
 *
 * Filter shape:
 *   - `query`     : free text, substring match on image filename (client-side)
 *   - `includeIds`: tag ids the image MUST have (ANY-MATCH via useSearchImages)
 *   - `excludeIds`: tag ids the image must NOT have
 *
 * URL encoding:
 *   q=<trimmed text>         — omitted when empty
 *   tag=1,2,3                — comma-joined include ids, omitted when empty
 *   exclude=4,5              — comma-joined exclude ids, omitted when empty
 *
 * The helpers are pure functions so tests can exercise them without mounting
 * a router.
 */

export interface SearchFilterState {
  /** Free text filter; trimmed of leading/trailing whitespace before use. */
  query: string;
  /** Tag ids that must be on the image (inclusion set). Stable-sorted. */
  includeIds: number[];
  /** Tag ids that must NOT be on the image (exclusion set). Stable-sorted. */
  excludeIds: number[];
}

export const EMPTY_FILTER_STATE: SearchFilterState = Object.freeze({
  query: "",
  includeIds: [],
  excludeIds: [],
}) as SearchFilterState;

const QUERY_KEY = "q";
const INCLUDE_KEY = "tag";
const EXCLUDE_KEY = "exclude";

function parseIdList(raw: string | null): number[] {
  if (!raw) return [];
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const ids: number[] = [];
  for (const part of parts) {
    const n = Number(part);
    if (Number.isFinite(n) && Number.isInteger(n) && n > 0) {
      ids.push(n);
    }
  }
  // Stable-sort so equivalent URL forms produce the same state and React
  // Query's key stays stable (useSearchImages also sorts internally but we
  // do it here too so UI diffs are predictable).
  ids.sort((a, b) => a - b);
  // De-dupe while preserving order.
  return Array.from(new Set(ids));
}

/**
 * Decode a `URLSearchParams` instance (from react-router's `useSearchParams`)
 * into a structured `SearchFilterState`. Unknown keys are ignored.
 */
export function filterStateFromSearchParams(
  params: URLSearchParams,
): SearchFilterState {
  return {
    query: params.get(QUERY_KEY)?.trim() ?? "",
    includeIds: parseIdList(params.get(INCLUDE_KEY)),
    excludeIds: parseIdList(params.get(EXCLUDE_KEY)),
  };
}

/**
 * Encode a `SearchFilterState` into a plain object suitable for
 * `setSearchParams(next)`. Empty fields are omitted so the URL stays tidy.
 */
export function filterStateToSearchParams(
  state: SearchFilterState,
): Record<string, string> {
  const out: Record<string, string> = {};
  const q = state.query.trim();
  if (q.length > 0) out[QUERY_KEY] = q;
  if (state.includeIds.length > 0)
    out[INCLUDE_KEY] = state.includeIds.join(",");
  if (state.excludeIds.length > 0)
    out[EXCLUDE_KEY] = state.excludeIds.join(",");
  return out;
}

/** True when no search, no include tags, and no exclude tags are active. */
export function isEmptyFilterState(state: SearchFilterState): boolean {
  return (
    state.query.trim().length === 0 &&
    state.includeIds.length === 0 &&
    state.excludeIds.length === 0
  );
}

/** Add a tag id to the inclusion set (no-op if already present). */
export function addIncludeId(
  state: SearchFilterState,
  id: number,
): SearchFilterState {
  if (state.includeIds.includes(id)) return state;
  // Also drop from excludes — a tag can only be in one set at a time.
  const nextExclude = state.excludeIds.filter((x) => x !== id);
  const nextInclude = [...state.includeIds, id].sort((a, b) => a - b);
  return { ...state, includeIds: nextInclude, excludeIds: nextExclude };
}

/** Add a tag id to the exclusion set (no-op if already present). */
export function addExcludeId(
  state: SearchFilterState,
  id: number,
): SearchFilterState {
  if (state.excludeIds.includes(id)) return state;
  const nextInclude = state.includeIds.filter((x) => x !== id);
  const nextExclude = [...state.excludeIds, id].sort((a, b) => a - b);
  return { ...state, includeIds: nextInclude, excludeIds: nextExclude };
}

/** Remove a tag id from BOTH sets. */
export function removeTagId(
  state: SearchFilterState,
  id: number,
): SearchFilterState {
  return {
    ...state,
    includeIds: state.includeIds.filter((x) => x !== id),
    excludeIds: state.excludeIds.filter((x) => x !== id),
  };
}

/**
 * Toggle a tag id between unset/include/exclude. The progression is:
 *
 *   unset -> include -> exclude -> unset
 *
 * This matches the wireframe behaviour where the user alt/right-clicks to
 * flip a chip from "include" to "exclude"; we use click to advance.
 *
 * Currently unused in the UI (we use `addIncludeId` from the tag picker and
 * `removeTagId` from the active chip X button), but exported so tests can
 * exercise the rotation and future UI work can reuse it.
 */
export function cycleTagId(
  state: SearchFilterState,
  id: number,
): SearchFilterState {
  if (state.includeIds.includes(id)) {
    return addExcludeId(state, id);
  }
  if (state.excludeIds.includes(id)) {
    return removeTagId(state, id);
  }
  return addIncludeId(state, id);
}
