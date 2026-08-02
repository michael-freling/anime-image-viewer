/**
 * Mutation wrappers for the global Tag Management page (ui-design §3.5).
 *
 * Create / rename / recategorise / delete are exposed by the
 * `TagFrontendService` binding (internal/tag package) — NOT by the read-only
 * `TagService` binding (internal/frontend), which only offers GetAll /
 * ReadAllMap / ReadTagsByFileIDs. An earlier version of this module probed
 * `TagService` for the mutation methods and silently fell back to a no-op log
 * stub when they were absent — which they always were — so add/update/delete
 * appeared to do nothing. We call `TagFrontendService` directly instead.
 *
 * The backend has no single "create tag with category" primitive for global
 * tags (CreateTagForAnime requires an anime id), so create/update are composed
 * from the name + category building blocks:
 *   CreateTopTag(name)            -> Tag   (category defaults to "")
 *   UpdateName(id, name)          -> Tag
 *   UpdateCategory(id, category)  -> Tag
 *   DeleteTag(id)                 -> void
 *   GetTagFileCount(id)           -> number
 *
 * There is no nested-tag support on the backend, so `parentId` is accepted for
 * forward-compatibility with the form but is not persisted.
 */
import { TagFrontendService } from "../../lib/api";
import type { Tag } from "../../types";

export interface TagMutationInput {
  name: string;
  category: string;
  parentId?: number | null;
}

/**
 * The UI models "uncategorized" as an explicit category key, but the backend
 * represents it as an empty category string — that is the default for tags
 * created elsewhere in the app, and the reader maps "" back to the
 * uncategorized bucket. Map the sentinel to "" so a tag saved as uncategorized
 * round-trips to the same bucket it was read from.
 */
const UNCATEGORIZED = "uncategorized";
function toStoredCategory(category: string): string {
  return category === UNCATEGORIZED ? "" : category;
}

export async function createTag(input: TagMutationInput): Promise<Tag> {
  const created = await TagFrontendService.CreateTopTag(input.name);
  const category = toStoredCategory(input.category);
  if (category === "") {
    // New tags are created with an empty category — nothing more to do.
    return created as Tag;
  }
  return (await TagFrontendService.UpdateCategory(created.id, category)) as Tag;
}

export async function updateTag(
  id: number,
  input: TagMutationInput,
): Promise<Tag> {
  // Name and category live behind separate backend methods. Run them
  // sequentially so the UI observes a single "after" state once both land.
  await TagFrontendService.UpdateName(id, input.name);
  return (await TagFrontendService.UpdateCategory(
    id,
    toStoredCategory(input.category),
  )) as Tag;
}

export async function deleteTag(id: number): Promise<void> {
  await TagFrontendService.DeleteTag(id);
}

/**
 * Resolve the per-tag file count used in the delete confirmation copy.
 * Returns null when the count can't be resolved; callers treat null as
 * "unknown" and skip the "will also remove from N images" line.
 */
export async function getTagFileCount(id: number): Promise<number | null> {
  try {
    const raw = await TagFrontendService.GetTagFileCount(id);
    const n = Number(raw ?? 0);
    return Number.isFinite(n) ? n : null;
  } catch (err) {
    console.warn("[tag-mutations] getTagFileCount failed", err);
    return null;
  }
}
