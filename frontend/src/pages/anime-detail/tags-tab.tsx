/**
 * TagsTab — tags applied to this anime, grouped by category.
 *
 * Spec: ui-design.md §3.2.4 "Tags tab".
 *
 * Data source: the anime detail payload already includes a `tags` array with
 * each tag's id/name/category/imageCount. We group those by category using
 * the same TAG_CATEGORY_ORDER + tagCategoryKey helpers as the tag management
 * page so categories render in a consistent order.
 *
 * "Add tag" opens a picker dialog in a later phase; for Phase D2 the button
 * is wired to call `onAddTag?.()` which consumers can pass in.
 */
import { Box, Button, Flex, IconButton, Stack, Text } from "@chakra-ui/react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Pencil, Plus, Search, Tag as TagIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";

import { CategorySection } from "../../components/shared/category-section";
import { EmptyState } from "../../components/shared/empty-state";
import { ErrorAlert } from "../../components/shared/error-alert";
import { TagChipSkeleton } from "../../components/shared/loading-skeleton";
import { TagChip } from "../../components/shared/tag-chip";
import { toast } from "../../components/ui/toaster";
import { useAnimeDetail } from "../../hooks/use-anime-detail";
import {
  TAG_CATEGORY_ORDER,
  tagCategoryKey,
} from "../../lib/constants";
import { qk } from "../../lib/query-keys";
import type { AnimeDerivedTag, Tag, TagCategoryKey } from "../../types";
import { TagDialog } from "../tags/tag-dialog";
import type { TagFormValues } from "../tags/tag-form";
import { updateTag } from "../tags/tag-mutations";

function parseAnimeId(raw: string | undefined): number {
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function asTag(derived: AnimeDerivedTag): Tag {
  return { id: derived.id, name: derived.name, category: derived.category };
}

const CATEGORY_LABELS: Record<TagCategoryKey, string> = {
  scene: "Scene/Action",
  nature: "Nature/Weather",
  location: "Location",
  mood: "Mood/Genre",
  character: "Character",
  uncategorized: "Uncategorized",
};

interface GroupedTags {
  key: TagCategoryKey;
  label: string;
  tags: AnimeDerivedTag[];
}

function groupTags(tags: readonly AnimeDerivedTag[]): GroupedTags[] {
  const buckets = new Map<TagCategoryKey, AnimeDerivedTag[]>();
  for (const tag of tags) {
    const key = tagCategoryKey(tag.category);
    const bucket = buckets.get(key) ?? [];
    bucket.push(tag);
    buckets.set(key, bucket);
  }
  // Preserve canonical category ordering; only yield non-empty buckets.
  const out: GroupedTags[] = [];
  for (const key of TAG_CATEGORY_ORDER) {
    const bucket = buckets.get(key);
    if (bucket && bucket.length > 0) {
      out.push({ key, label: CATEGORY_LABELS[key], tags: bucket });
    }
  }
  return out;
}

export interface TagsTabProps {
  /** Called when the user clicks "Add tag". A picker dialog opens in a
   * future phase; the callback is the integration point consumers wire up.
   */
  onAddTag?: () => void;
}

interface EditDialogState {
  open: boolean;
  editing: AnimeDerivedTag | null;
  values: TagFormValues;
  error: string | null;
  submitting: boolean;
}

const INITIAL_EDIT: EditDialogState = {
  open: false,
  editing: null,
  values: { name: "", category: "uncategorized", parentId: null },
  error: null,
  submitting: false,
};

export function TagsTab({ onAddTag }: TagsTabProps = {}): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { animeId: rawId } = useParams<{ animeId: string }>();
  const animeId = parseAnimeId(rawId);
  const { data, isLoading, isError, error, refetch } = useAnimeDetail(animeId);

  const grouped = useMemo(() => groupTags(data?.tags ?? []), [data]);

  const [dialog, setDialog] = useState<EditDialogState>(INITIAL_EDIT);

  const openEdit = (t: AnimeDerivedTag) => {
    setDialog({
      open: true,
      editing: t,
      values: {
        name: t.name,
        category: tagCategoryKey(t.category),
        parentId: null,
      },
      error: null,
      submitting: false,
    });
  };

  const closeEdit = () => setDialog(INITIAL_EDIT);

  const convertCategory = async (t: AnimeDerivedTag) => {
    const isCharacter = tagCategoryKey(t.category) === "character";
    const newCategory = isCharacter ? "uncategorized" : "character";
    const label = isCharacter ? "tag" : "character";
    try {
      await updateTag(t.id, { name: t.name, category: newCategory });
      toast.success("Category changed", `"${t.name}" converted to ${label}.`);
      await queryClient.invalidateQueries({ queryKey: qk.tags.list() });
      await queryClient.invalidateQueries({
        queryKey: qk.anime.detail(animeId),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error("Could not convert tag", message);
    }
  };

  const submitEdit = async () => {
    if (!dialog.editing) return;
    const values = dialog.values;
    if (values.name.trim() === "") {
      setDialog((s) => ({ ...s, error: "Tag name is required." }));
      return;
    }
    setDialog((s) => ({ ...s, submitting: true, error: null }));
    try {
      await updateTag(dialog.editing.id, {
        name: values.name.trim(),
        category: values.category,
        parentId: values.parentId ?? undefined,
      });
      toast.success("Tag updated", `"${values.name.trim()}" saved.`);
      await queryClient.invalidateQueries({ queryKey: qk.tags.list() });
      await queryClient.invalidateQueries({
        queryKey: qk.anime.detail(animeId),
      });
      closeEdit();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setDialog((s) => ({ ...s, submitting: false, error: message }));
      toast.error("Could not save tag", message);
    }
  };

  if (isError) {
    return (
      <Box p="4" data-testid="tags-tab">
        <ErrorAlert
          title="Could not load tags"
          message={error instanceof Error ? error.message : String(error ?? "")}
          onRetry={() => {
            void refetch();
          }}
        />
      </Box>
    );
  }

  if (isLoading) {
    return (
      <Box p="4" data-testid="tags-tab-loading">
        <Flex gap="2" wrap="wrap">
          {Array.from({ length: 6 }).map((_, i) => (
            <TagChipSkeleton key={i} />
          ))}
        </Flex>
      </Box>
    );
  }

  const tags = data?.tags ?? [];
  if (tags.length === 0) {
    return (
      <Box p="4" data-testid="tags-tab">
        <EmptyState
          icon={TagIcon}
          title="No tags assigned"
          description="Add tags to describe scenes, locations, and moods for this anime."
          action={
            <Button
              type="button"
              size="sm"
              variant="solid"
              onClick={onAddTag}
              data-testid="tags-tab-add-action"
            >
              <Box as="span" aria-hidden="true" display="inline-flex" mr="2">
                <Plus size={14} />
              </Box>
              Add tag
            </Button>
          }
        />
      </Box>
    );
  }

  return (
    <Box data-testid="tags-tab" p={{ base: "3", md: "4" }}>
      <Flex justify="flex-end" mb="3">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onAddTag}
          data-testid="tags-tab-add-action"
        >
          <Box as="span" aria-hidden="true" display="inline-flex" mr="2">
            <Plus size={14} />
          </Box>
          Add tag
        </Button>
      </Flex>
      <Stack gap="3">
        {grouped.map((group) => (
          <CategorySection
            key={group.key}
            category={{
              key: group.key,
              label: group.label,
              tagCount: group.tags.length,
              color: `tag.${group.key}.fg`,
            }}
          >
            <Flex gap="2" wrap="wrap">
              {group.tags.map((t) => (
                <Flex
                  key={t.id}
                  align="center"
                  gap="8px"
                  px="2"
                  py="1"
                  borderRadius="md"
                  bg="bg.surface"
                  borderWidth="1px"
                  borderColor="border"
                  _hover={{ borderColor: "primary" }}
                  data-testid="tags-tab-tag-row"
                >
                  <TagChip tag={asTag(t)} active />
                  <Text fontSize="xs" color="fg.muted">
                    {t.imageCount}
                  </Text>
                  <IconButton
                    type="button"
                    size="xs"
                    variant="ghost"
                    aria-label={`Edit tag ${t.name}`}
                    data-testid="tags-tab-tag-edit"
                    onClick={() => openEdit(t)}
                    color="fg.secondary"
                    _hover={{ color: "fg", bg: "bg.surfaceAlt" }}
                  >
                    <Pencil size={12} aria-hidden="true" />
                  </IconButton>
                  <IconButton
                    type="button"
                    size="xs"
                    variant="ghost"
                    aria-label={
                      tagCategoryKey(t.category) === "character"
                        ? `Convert ${t.name} to tag`
                        : `Convert ${t.name} to character`
                    }
                    data-testid="tags-tab-tag-convert"
                    onClick={() => void convertCategory(t)}
                    color="fg.secondary"
                    _hover={{ color: "fg", bg: "bg.surfaceAlt" }}
                  >
                    <ArrowLeftRight size={12} aria-hidden="true" />
                  </IconButton>
                  <IconButton
                    type="button"
                    size="xs"
                    variant="ghost"
                    aria-label={`Search images with tag ${t.name}`}
                    data-testid="tags-tab-tag-search"
                    onClick={() => navigate(`/search?tag=${t.id}&anime=${animeId}`)}
                    color="fg.secondary"
                    _hover={{ color: "fg", bg: "bg.surfaceAlt" }}
                  >
                    <Search size={12} aria-hidden="true" />
                  </IconButton>
                </Flex>
              ))}
            </Flex>
          </CategorySection>
        ))}
      </Stack>

      <TagDialog
        open={dialog.open}
        onClose={closeEdit}
        title={
          dialog.editing
            ? `Edit tag — ${dialog.editing.name}`
            : "Edit tag"
        }
        values={dialog.values}
        onChange={(values) => setDialog((s) => ({ ...s, values }))}
        parentOptions={[]}
        submitLabel="Save"
        onSubmit={submitEdit}
        submitting={dialog.submitting}
        error={dialog.error}
      />
    </Box>
  );
}

export default TagsTab;
