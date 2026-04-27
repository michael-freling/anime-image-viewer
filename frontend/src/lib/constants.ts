/**
 * Static app-wide constants.
 *
 * Values come from the design docs and should change in one place when the
 * specs update:
 *   - Thumbnail widths: frontend-design.md §4
 *   - Entry type configs: ui-design.md §3.2.2 / service.go entry types
 *   - Tag category colors: ui-design.md §4.3
 */

import type { EntryType, TagCategoryKey } from "../types";

/**
 * Thumbnail width tiers served by the resize endpoint.
 * grid / grid@2x / viewer preview, in pixels.
 */
export const THUMBNAIL_WIDTHS = [520, 1040, 1920] as const;

export type ThumbnailWidth = (typeof THUMBNAIL_WIDTHS)[number];

/**
 * Entry type UI config. The backend stores entry types as lowercase strings
 * (`db.EntryTypeSeason`/`Movie`/`Other`), which we narrow into the UI-facing
 * `EntryType` union.
 *
 * `label` is the long form ("Season"); `badge` is the single-letter badge
 * shown on Entry tabs and the Entries table (S/M/O).
 * `colorKey` maps to a semantic token in theme.ts.
 */
export interface EntryTypeConfig {
  type: EntryType;
  label: string;
  badge: string;
  colorKey: TagCategoryKey;
}

export const ENTRY_TYPE_CONFIGS: Record<EntryType, EntryTypeConfig> = {
  season: {
    type: "season",
    label: "Season",
    badge: "S",
    colorKey: "scene",
  },
  movie: {
    type: "movie",
    label: "Movie",
    badge: "M",
    colorKey: "mood",
  },
  other: {
    type: "other",
    label: "Other",
    badge: "O",
    colorKey: "uncategorized",
  },
};

/**
 * Map raw category strings (as stored on `Tag.category` / `AnimeTagInfo.category`)
 * to a normalised `TagCategoryKey` used by theme.ts semantic tokens.
 *
 * The backend does not constrain the category string today, so we accept both
 * the literal keys ("scene", "nature", ...) and the human labels from
 * ui-design ("Scene/Action", "Nature/Weather", ...).
 */
export const TAG_CATEGORY_KEY_MAP: Record<string, TagCategoryKey> = {
  scene: "scene",
  "scene/action": "scene",
  action: "scene",
  nature: "nature",
  "nature/weather": "nature",
  weather: "nature",
  location: "location",
  mood: "mood",
  "mood/genre": "mood",
  genre: "mood",
  uncategorized: "uncategorized",
  "": "uncategorized",
};

/**
 * Semantic token names for each tag category. Values align with theme.ts's
 * semanticTokens so consumers can do e.g. `bg="tag.scene.bg"`.
 */
export const TAG_CATEGORY_TOKENS: Record<
  TagCategoryKey,
  { bg: string; fg: string }
> = {
  scene: { bg: "tag.scene.bg", fg: "tag.scene.fg" },
  nature: { bg: "tag.nature.bg", fg: "tag.nature.fg" },
  location: { bg: "tag.location.bg", fg: "tag.location.fg" },
  mood: { bg: "tag.mood.bg", fg: "tag.mood.fg" },
  uncategorized: {
    bg: "tag.uncategorized.bg",
    fg: "tag.uncategorized.fg",
  },
};

/**
 * Order used when rendering grouped tag categories (ui-design §3.5).
 */
export const TAG_CATEGORY_ORDER: readonly TagCategoryKey[] = [
  "scene",
  "nature",
  "location",
  "mood",
  "uncategorized",
];

/**
 * Normalise a raw category string into a `TagCategoryKey`. Unknown values
 * fall back to "uncategorized".
 */
export function tagCategoryKey(raw: string | null | undefined): TagCategoryKey {
  if (!raw) return "uncategorized";
  return TAG_CATEGORY_KEY_MAP[raw.toLowerCase()] ?? "uncategorized";
}
