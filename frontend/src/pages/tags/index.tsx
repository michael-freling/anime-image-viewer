/**
 * TagManagementPage — global tag management (ui-design.md §3.5).
 *
 * Spec: wireframe `05-tag-management-desktop.svg`.
 *   - Sticky PageHeader with title "Tags" and "+ New tag" primary action.
 *   - Optional SearchBar filters the visible tags by name (client-side,
 *     substring, case-insensitive). Empty query matches every tag.
 *   - `CategoryPanel` per category (scene / nature / location / mood /
 *     uncategorized). Each panel header shows the tag count and a
 *     chevron; empty categories render a "No tags yet" stub with an
 *     inline + add button that opens the create-tag dialog pre-seeded with
 *     the category.
 *   - `+ New tag` and each tag chip open the `TagDialog` (create vs edit).
 *   - Edit pencil / delete X on each chip trigger the same dialog or a
 *     `ConfirmDialog` respectively; stopPropagation prevents the chip body
 *     click from firing.
 *   - On create / update / delete we invalidate `qk.tags.list()` via
 *     `useQueryClient` and show a toast.
 *
 * Phase D4 scope — see frontend-design.md §2 (pages/tags directory).
 */
import { Box, Button, Stack } from "@chakra-ui/react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, TagIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";

import { PageHeader } from "../../components/layout/page-header";
import { EmptyState } from "../../components/shared/empty-state";
import { ErrorAlert } from "../../components/shared/error-alert";
import { RowSkeleton } from "../../components/shared/loading-skeleton";
import { SearchBar } from "../../components/shared/search-bar";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { toast } from "../../components/ui/toaster";
import { useTags } from "../../hooks/use-tags";
import { TAG_ONLY_CATEGORY_ORDER, tagCategoryKey } from "../../lib/constants";
import { formatCount } from "../../lib/format";
import { qk } from "../../lib/query-keys";
import type { Tag, TagCategoryKey } from "../../types";

import { CategoryPanel } from "./category-panel";
import { TagDialog } from "./tag-dialog";
import { type TagFormValues } from "./tag-form";
import {
  createTag,
  deleteTag,
  getTagFileCount,
  updateTag,
} from "./tag-mutations";

const SKELETON_COUNT = 3;

interface DialogState {
  mode: "closed" | "create" | "edit";
  editing?: Tag;
  values: TagFormValues;
  error: string | null;
  submitting: boolean;
}

interface DeleteState {
  open: boolean;
  target: Tag | null;
  fileCount: number | null;
  submitting: boolean;
}

const INITIAL_VALUES: TagFormValues = {
  name: "",
  category: "uncategorized",
  parentId: null,
};

/** Case-insensitive substring filter. Empty query returns the full list. */
function filterTags(tags: Tag[], query: string): Tag[] {
  const trimmed = query.trim().toLowerCase();
  if (trimmed === "") return tags;
  return tags.filter((tag) => tag.name.toLowerCase().includes(trimmed));
}

/** Bucket filtered tags by normalised category key. */
function bucketByCategory(tags: Tag[]): Map<TagCategoryKey, Tag[]> {
  const out = new Map<TagCategoryKey, Tag[]>();
  for (const key of TAG_ONLY_CATEGORY_ORDER) {
    out.set(key, []);
  }
  for (const tag of tags) {
    const key = tagCategoryKey(tag.category);
    out.get(key)!.push(tag);
  }
  // Sort alphabetically within each bucket so the UI is stable.
  for (const list of out.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }
  return out;
}

export function TagManagementPage(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const tagsQuery = useTags();

  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<DialogState>({
    mode: "closed",
    values: INITIAL_VALUES,
    error: null,
    submitting: false,
  });
  const [confirm, setConfirm] = useState<DeleteState>({
    open: false,
    target: null,
    fileCount: null,
    submitting: false,
  });

  const tags = tagsQuery.data ?? [];
  const filteredTags = useMemo(() => filterTags(tags, search), [tags, search]);
  const bucketed = useMemo(() => bucketByCategory(filteredTags), [filteredTags]);
  // No per-tag usage counts are cached globally; the map is kept empty but
  // the shape is preserved in case a future hook can populate it.
  const usageByTagId = useMemo(() => new Map<number, number>(), []);

  /* ----------------------------- dialog flow ----------------------------- */

  const openCreate = (category?: TagCategoryKey) => {
    setDialog({
      mode: "create",
      values: {
        ...INITIAL_VALUES,
        category: category ?? "uncategorized",
      },
      error: null,
      submitting: false,
    });
  };

  const openEdit = (tag: Tag) => {
    setDialog({
      mode: "edit",
      editing: tag,
      values: {
        name: tag.name,
        category: tagCategoryKey(tag.category),
        parentId: null,
      },
      error: null,
      submitting: false,
    });
  };

  const closeDialog = () => {
    setDialog({
      mode: "closed",
      values: INITIAL_VALUES,
      error: null,
      submitting: false,
    });
  };

  const setDialogValues = (values: TagFormValues) => {
    setDialog((s) => ({ ...s, values }));
  };

  const submitDialog = async () => {
    const values = dialog.values;
    if (values.name.trim() === "") {
      setDialog((s) => ({ ...s, error: "Tag name is required." }));
      return;
    }
    setDialog((s) => ({ ...s, submitting: true, error: null }));
    try {
      if (dialog.mode === "create") {
        await createTag({
          name: values.name.trim(),
          category: values.category,
          parentId: values.parentId ?? undefined,
        });
        toast.success("Tag created", `“${values.name.trim()}” added.`);
      } else if (dialog.mode === "edit" && dialog.editing) {
        await updateTag(dialog.editing.id, {
          name: values.name.trim(),
          category: values.category,
          parentId: values.parentId ?? undefined,
        });
        toast.success("Tag updated", `“${values.name.trim()}” saved.`);
      }
      await queryClient.invalidateQueries({ queryKey: qk.tags.list() });
      closeDialog();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setDialog((s) => ({ ...s, submitting: false, error: message }));
      toast.error("Could not save tag", message);
    }
  };

  /* ----------------------------- delete flow ----------------------------- */

  const openDelete = async (tag: Tag) => {
    setConfirm({
      open: true,
      target: tag,
      fileCount: null,
      submitting: false,
    });
    const count = await getTagFileCount(tag.id);
    // Only update if the same tag is still under confirmation (user may have
    // cancelled during the fetch).
    setConfirm((s) => (s.target?.id === tag.id ? { ...s, fileCount: count } : s));
  };

  const closeDelete = () => {
    setConfirm({
      open: false,
      target: null,
      fileCount: null,
      submitting: false,
    });
  };

  const submitDelete = async () => {
    const target = confirm.target;
    if (!target) return;
    setConfirm((s) => ({ ...s, submitting: true }));
    try {
      await deleteTag(target.id);
      toast.success("Tag deleted", `“${target.name}” removed.`);
      await queryClient.invalidateQueries({ queryKey: qk.tags.list() });
      closeDelete();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error("Could not delete tag", message);
      setConfirm((s) => ({ ...s, submitting: false }));
    }
  };

  /* ------------------------------ page body ------------------------------ */

  const subtitle = useMemo(() => {
    if (tagsQuery.isLoading || tagsQuery.isError) return undefined;
    return `${formatCount(tags.length, "tag")} across ${formatCount(
      TAG_ONLY_CATEGORY_ORDER.length,
      "category",
      "categories",
    )}`;
  }, [tagsQuery.isLoading, tagsQuery.isError, tags.length]);

  let body: JSX.Element;
  if (tagsQuery.isLoading) {
    body = (
      <Stack data-testid="tag-management-loading" gap="3" px={{ base: "4", md: "6" }}>
        {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
          <RowSkeleton key={i} lines={3} />
        ))}
      </Stack>
    );
  } else if (tagsQuery.isError) {
    body = (
      <Box px={{ base: "4", md: "6" }} pb="8">
        <ErrorAlert
          title="Couldn't load tags"
          message={
            tagsQuery.error instanceof Error
              ? tagsQuery.error.message
              : "Unknown error"
          }
          onRetry={() => {
            tagsQuery.refetch();
          }}
        />
      </Box>
    );
  } else if (tags.length === 0) {
    body = (
      <Box px={{ base: "4", md: "6" }} py="8">
        <EmptyState
          icon={TagIcon}
          title="No tags yet"
          description="Create your first tag to start organising your images."
          action={
            <Button
              type="button"
              size="sm"
              bg="primary"
              color="bg.surface"
              _hover={{ bg: "primary.hover" }}
              onClick={() => openCreate()}
              data-testid="tag-management-empty-create"
            >
              <Plus size={14} aria-hidden="true" />
              New tag
            </Button>
          }
        />
      </Box>
    );
  } else if (filteredTags.length === 0) {
    body = (
      <Box px={{ base: "4", md: "6" }} py="8">
        <EmptyState
          title="No matches"
          description={`Nothing matches “${search.trim()}”. Try a different search or clear the filter.`}
        />
      </Box>
    );
  } else {
    body = (
      <Stack
        data-testid="tag-management-categories"
        gap="3"
        px={{ base: "4", md: "6" }}
        pb="8"
      >
        {TAG_ONLY_CATEGORY_ORDER.map((key) => (
          <CategoryPanel
            key={key}
            categoryKey={key}
            tags={bucketed.get(key) ?? []}
            usageByTagId={usageByTagId}
            onAddInCategory={openCreate}
            onEditTag={openEdit}
            onDeleteTag={openDelete}
            onSearchTag={(tag) => navigate(`/search?tag=${tag.id}`)}
          />
        ))}
      </Stack>
    );
  }

  const dialogTitle = dialog.mode === "edit"
    ? `Edit tag${dialog.editing ? ` — ${dialog.editing.name}` : ""}`
    : "New tag";
  const submitLabel = dialog.mode === "edit" ? "Save" : "Create";

  const confirmDescription = confirm.target
    ? confirm.fileCount == null
      ? `Delete tag “${confirm.target.name}”?`
      : `Delete tag “${confirm.target.name}”? This will also remove it from ${formatCount(
          confirm.fileCount,
          "image",
        )}.`
    : "";

  return (
    <Box data-testid="tag-management-page" position="relative" minHeight="100%">
      <PageHeader
        title="Tags"
        subtitle={subtitle}
        actions={
          <Button
            type="button"
            size="sm"
            bg="primary"
            color="bg.surface"
            _hover={{ bg: "primary.hover" }}
            onClick={() => openCreate()}
            data-testid="tag-management-new"
          >
            <Plus size={16} aria-hidden="true" />
            New tag
          </Button>
        }
      />

      <Stack gap="4" pt="4">
        <Box px={{ base: "4", md: "6" }}>
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search tags"
            size="md"
          />
        </Box>
        {body}
      </Stack>

      <TagDialog
        open={dialog.mode !== "closed"}
        onClose={closeDialog}
        title={dialogTitle}
        values={dialog.values}
        onChange={setDialogValues}
        parentOptions={tags.filter((tag) => tag.id !== dialog.editing?.id)}
        submitLabel={submitLabel}
        onSubmit={submitDialog}
        submitting={dialog.submitting}
        error={dialog.error}
      />

      <ConfirmDialog
        open={confirm.open}
        onClose={closeDelete}
        onConfirm={submitDelete}
        title={
          confirm.target ? `Delete tag “${confirm.target.name}”?` : "Delete tag?"
        }
        description={confirmDescription}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
      />
    </Box>
  );
}

// Re-export helpers so peer modules / tests can import via the page namespace.
export { CategoryPanel } from "./category-panel";
export { TagDialog } from "./tag-dialog";
export { TagForm, CATEGORY_LABELS } from "./tag-form";
export { TagRow } from "./tag-row";
export {
  createTag,
  deleteTag,
  getTagFileCount,
  updateTag,
} from "./tag-mutations";

export default TagManagementPage;
