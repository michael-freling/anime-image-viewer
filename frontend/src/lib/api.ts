/**
 * Typed re-exports of the Wails bindings.
 *
 * The Go side generates TypeScript service stubs into
 *   frontend/bindings/github.com/michael-freling/anime-image-viewer/internal/frontend/
 *
 * These modules are created by `task generate:bindings` (wails3) and are
 * NOT checked in — they regenerate on every build. This module is the
 * single place the rest of the app imports Wails services from, so if the
 * binding path moves we only update it here.
 *
 * Existing callers (e.g. src/pages/anime/AnimeListPage.tsx) use the raw
 * relative import. This wrapper mirrors those paths so new code can write
 *   import { AnimeService } from "@/lib/api";
 * (path alias is introduced in Phase B when we add vite/tsconfig aliases;
 * until then, consume via relative `../lib/api` imports.)
 */

// Re-export everything from each service binding. Named re-exports are used
// (rather than `export *`) so TypeScript can surface unresolved symbols at
// build time if a service is renamed on the Go side.
export {
  AnimeService,
  type AnimeListItem,
  type Anime as BindingAnime,
  type AnimeDetailsResponse,
  type AnimeTagInfo,
  type AnimeFolderInfo,
  type AnimeFolderTreeNode,
  type AnimeEntryInfo,
  type UnassignedFolder,
  type FolderAnimeStatus,
  type AniListSearchResult,
  type AniListImportResult,
  type SearchImagesResponse,
} from "../../bindings/github.com/michael-freling/anime-image-viewer/internal/frontend";

export {
  TagService,
  type Tag as BindingTag,
  type TagStat as BindingTagStat,
  type ReadTagsByFileIDsResponse,
} from "../../bindings/github.com/michael-freling/anime-image-viewer/internal/frontend";

export {
  ImageService,
  type Image as BindingImage,
} from "../../bindings/github.com/michael-freling/anime-image-viewer/internal/frontend";

export {
  SearchService,
  type SearchImagesRequest,
} from "../../bindings/github.com/michael-freling/anime-image-viewer/internal/frontend";

export {
  BackupFrontendService,
  type BackupInfo,
  type BackupConfig,
} from "../../bindings/github.com/michael-freling/anime-image-viewer/internal/frontend";

export {
  ConfigFrontendService,
  type ConfigSettings,
} from "../../bindings/github.com/michael-freling/anime-image-viewer/internal/frontend";

export {
  BatchImportImageService,
  type ImportProgressEvent,
  type ImportProgressEventFailure,
} from "../../bindings/github.com/michael-freling/anime-image-viewer/internal/frontend";

export {
  DirectoryService,
  type Directory as BindingDirectory,
  type ReadDirectoryTreeResponse,
} from "../../bindings/github.com/michael-freling/anime-image-viewer/internal/frontend";
