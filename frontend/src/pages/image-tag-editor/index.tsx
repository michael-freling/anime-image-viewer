/**
 * Image Tag Editor page entry point.
 *
 * The canonical consumer is `src/app/routes.tsx`, which imports the named
 * export. The default export exists so route-level `React.lazy` can consume
 * this module if we introduce code-splitting later.
 */
export { ImageTagEditorPage, default } from "./image-tag-editor-page";
export { usePendingTagChanges, deriveBaselineState } from "./use-pending-tag-changes";
export type {
  BaselineState,
  PendingState,
  PendingTagChanges,
} from "./use-pending-tag-changes";
