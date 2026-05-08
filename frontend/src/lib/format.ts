/**
 * Plain formatters shared across the app.
 *
 * Keep pure — no Intl locale side-effects, no date libraries. The app runs
 * inside a single Wails WebView, so we always know we have ICU available,
 * but avoid capturing locale at module load so tests stay deterministic.
 */

/**
 * Format a positive integer with a pluralised label.
 *
 *   formatCount(0, "image")     -> "0 images"
 *   formatCount(1, "image")     -> "1 image"
 *   formatCount(5, "entry")     -> "5 entries"
 */
export function formatCount(
  n: number,
  singular: string,
  plural?: string,
): string {
  const label =
    n === 1 ? singular : plural ?? defaultPlural(singular);
  return `${n} ${label}`;
}

/**
 * Default English pluralisation. Handles the short list of suffixes we need:
 * `y → ies`, `s/x/z/sh/ch → es`, otherwise append `s`.
 */
function defaultPlural(word: string): string {
  if (word.endsWith("y") && !/[aeiou]y$/.test(word)) {
    return `${word.slice(0, -1)}ies`;
  }
  if (/(s|x|z|sh|ch)$/.test(word)) {
    return `${word}es`;
  }
  return `${word}s`;
}

/**
 * Normalise a season string returned from AniList (`SPRING`, `FALL`, ...)
 * into Title Case. Ported from AnimeListPage.tsx.
 *
 *   formatSeason("SPRING")  -> "Spring"
 *   formatSeason("fall")    -> "Fall"
 *   formatSeason("")        -> ""
 */
export function formatSeason(season: string): string {
  if (!season) return "";
  return season.charAt(0).toUpperCase() + season.slice(1).toLowerCase();
}

/**
 * Format an ISO 8601 date string to a short locale-aware date, e.g.
 * "2024-03-15T10:20:00Z" -> "Mar 15, 2024".
 *
 * Invalid inputs fall back to the raw value so the UI never renders the
 * string "Invalid Date".
 */
export function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
