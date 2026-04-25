/**
 * Shared TypeScript interfaces for the app layer.
 *
 * These are stubs derived from the Go Wails services in `internal/frontend/*.go`
 * and `internal/anilist/types.go`. They intentionally only cover what the
 * redesigned UI needs; fields are added as pages consume them.
 *
 * Where the backend exposes a type directly (e.g. `AnimeListItem`), we keep
 * field names identical so the value can be passed through without a mapper.
 */

/** Tag category keys used for color-coding chips. */
export type TagCategoryKey =
  | "scene"
  | "nature"
  | "location"
  | "mood"
  | "character"
  | "uncategorized";

/** Entry kind, matching db.EntryType{Season,Movie,Other}. */
export type EntryType = "season" | "movie" | "other";

/**
 * Home list row. Mirrors `frontend.AnimeListItem`.
 */
export interface AnimeSummary {
  id: number;
  name: string;
  /** Count of images across the anime's folder tree. */
  imageCount: number;
}

/**
 * Bare anime record. Mirrors `frontend.Anime`.
 */
export interface Anime {
  id: number;
  name: string;
  aniListId: number | null;
}

/**
 * Derived tag on an anime's images. Mirrors `frontend.AnimeTagInfo`.
 */
export interface AnimeDerivedTag {
  id: number;
  name: string;
  category: string;
  imageCount: number;
}

/**
 * Folder under an anime's folder tree. Mirrors `frontend.AnimeFolderInfo`.
 */
export interface AnimeFolder {
  id: number;
  name: string;
  path: string;
  imageCount: number;
  inherited: boolean;
}

/**
 * Tree node. Mirrors `frontend.AnimeFolderTreeNode`.
 */
export interface AnimeFolderTreeNode {
  id: number;
  name: string;
  imageCount: number;
  children: AnimeFolderTreeNode[];
}

/**
 * Structured entry under an anime (season/movie/other). Mirrors
 * `frontend.AnimeEntryInfo`.
 */
export interface Entry {
  id: number;
  name: string;
  /** Narrowed to the valid entry-type keys we consume in the UI. */
  type: EntryType;
  /** Season number or release year, depending on `type`. */
  entryNumber: number | null;
  airingSeason: string;
  airingYear: number | null;
  imageCount: number;
  children: Entry[];
}

/**
 * Full anime detail payload. Mirrors `frontend.AnimeDetailsResponse`.
 */
export interface AnimeDetail {
  anime: Anime;
  tags: AnimeDerivedTag[];
  folders: AnimeFolder[];
  folderTree: AnimeFolderTreeNode | null;
  entries: Entry[];
}

/**
 * Image file served by the Wails static-file service. Mirrors
 * `frontend.Image`.
 */
export interface ImageFile {
  id: number;
  name: string;
  /** Path relative to the image root — append to `/files/` to build a URL. */
  path: string;
}

/**
 * Global tag. Mirrors `frontend.Tag`.
 */
export interface Tag {
  id: number;
  name: string;
  category: string;
}

/**
 * A category grouping of tags (e.g. "Scene/Action"). The UI composes
 * categories client-side by bucketing `Tag.category`; this shape is what the
 * grouped tag management view renders.
 */
export interface TagCategory {
  key: TagCategoryKey;
  label: string;
  tags: Tag[];
}

/**
 * Per-tag statistics for a selected image set. Mirrors
 * `frontend.TagStat`.
 */
export interface TagStat {
  fileCount: number;
  isAddedBySelectedFiles: boolean;
}

/**
 * Character linked to an anime. Mirrors `anilist.Character` (the backend has
 * not yet exposed a dedicated frontend DTO, so we track the fields the UI
 * will render on the Characters tab).
 */
export interface Character {
  id: number;
  name: string;
  nativeName: string;
  /** AniList role: MAIN / SUPPORTING / BACKGROUND. */
  role: string;
  /** Images tagged with this character. */
  imageCount: number;
}

/** Anime-scoped search filters posted to the search endpoints. */
export interface SearchFilters {
  animeId?: number;
  includeTagIds?: number[];
  excludeTagIds?: number[];
  sort?: "recent" | "oldest" | "name";
}
