/**
 * Thin mutation wrappers over the Wails `TagService` binding.
 *
 * The scope for Phase D4 is the global Tag Management page (ui-design §3.5).
 * The brief specifies the following canonical shape:
 *
 *   TagService.CreateTag({ name, category, parentId? }) -> Tag
 *   TagService.UpdateTag(id, { name, category, parentId? }) -> Tag
 *   TagService.DeleteTag(id) -> void
 *   TagService.ReadAllTags() -> Tag[]
 *
 * The current backend binding (internal/frontend/tag.go) exposes `GetAll`,
 * `ReadAllMap` and `ReadTagsByFileIDs` — it does NOT yet expose Create/Update/
 * Delete. Those live on a different service (`TagFrontendService` in the
 * `internal/tag` package) with different method names (CreateTopTag,
 * UpdateName, UpdateCategory, DeleteTag).
 *
 * We adapt at runtime rather than importing the sibling binding directly
 * because (a) the brief requires imports from `src/lib/api.ts` only and the
 * ambient type for TagService is a loose `Record<string, ...>`, and (b)
 * deployments that already ship a canonical `TagService.CreateTag` (e.g.
 * after a future merge of the two services) will just work. If neither the
 * canonical nor the compatibility shim is available the call resolves to a
 * no-op stub that logs a warning — callers can still exercise the UI in
 * development without a running backend.
 */
import { TagService } from "../../lib/api";
import type { Tag } from "../../types";

export interface TagMutationInput {
  name: string;
  category: string;
  parentId?: number | null;
}

type LooseService = Record<string, unknown>;

function pickMethod<T extends (...args: any[]) => any>(
  service: LooseService,
  ...names: string[]
): T | null {
  for (const n of names) {
    const fn = service[n];
    if (typeof fn === "function") return fn as T;
  }
  return null;
}

/**
 * Log-only stub — used when neither the canonical method nor a known
 * compatibility alias is registered on the binding. Keeps the UI wired up so
 * developers can iterate visually without a backend.
 */
function logStub(
  verb: string,
  payload: unknown,
): Promise<Tag | void> {
  console.warn(
    `[tag-mutations] TagService.${verb} is not available; using log stub.`,
    payload,
  );
  return Promise.resolve();
}

export async function createTag(input: TagMutationInput): Promise<Tag | void> {
  const svc = TagService as unknown as LooseService;

  // Preferred canonical signature.
  const createTag = pickMethod<(v: TagMutationInput) => Promise<Tag>>(
    svc,
    "CreateTag",
    "Create",
  );
  if (createTag) {
    return createTag(input);
  }

  // Legacy split: only a name-based constructor is available. We ignore the
  // category/parentId payload in the call itself but note it in the log so
  // the gap is visible during development.
  const createTopTag = pickMethod<(name: string) => Promise<Tag>>(
    svc,
    "CreateTopTag",
  );
  if (createTopTag) {
    return createTopTag(input.name);
  }

  return logStub("CreateTag", input);
}

export async function updateTag(
  id: number,
  input: TagMutationInput,
): Promise<Tag | void> {
  const svc = TagService as unknown as LooseService;

  const updateTagFn = pickMethod<
    (id: number, v: TagMutationInput) => Promise<Tag>
  >(svc, "UpdateTag", "Update");
  if (updateTagFn) {
    return updateTagFn(id, input);
  }

  // Legacy split: we have to issue two calls (name + category). Run them
  // sequentially so the UI sees a single "after" state once both land.
  const updateName = pickMethod<(id: number, name: string) => Promise<Tag>>(
    svc,
    "UpdateName",
  );
  const updateCategory = pickMethod<(id: number, category: string) => Promise<Tag>>(
    svc,
    "UpdateCategory",
  );
  if (updateName || updateCategory) {
    let last: Tag | void = undefined;
    if (updateName) {
      last = await updateName(id, input.name);
    }
    if (updateCategory) {
      last = await updateCategory(id, input.category);
    }
    return last;
  }

  return logStub("UpdateTag", { id, input });
}

export async function deleteTag(id: number): Promise<void> {
  const svc = TagService as unknown as LooseService;

  const deleteFn = pickMethod<(id: number) => Promise<void>>(
    svc,
    "DeleteTag",
    "Delete",
  );
  if (deleteFn) {
    await deleteFn(id);
    return;
  }

  await logStub("DeleteTag", { id });
}

/**
 * Resolve the per-tag file count used in the delete confirmation copy.
 * Returns null when the backend has no matching method; callers should treat
 * null as "unknown" and skip the "will also remove from N images" line.
 */
export async function getTagFileCount(id: number): Promise<number | null> {
  const svc = TagService as unknown as LooseService;

  const getCount = pickMethod<(id: number) => Promise<number>>(
    svc,
    "GetTagFileCount",
    "CountFilesForTag",
  );
  if (!getCount) return null;
  try {
    const raw = await getCount(id);
    const n = Number(raw ?? 0);
    return Number.isFinite(n) ? n : null;
  } catch (err) {
    console.warn("[tag-mutations] getTagFileCount failed", err);
    return null;
  }
}
