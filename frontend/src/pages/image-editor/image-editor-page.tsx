/**
 * ImageEditorPage — unified editor for seasons, characters, and tags on a set
 * of selected images.
 *
 * Layout:
 *   - Left panel: Thumbnails of selected images (scrollable strip)
 *   - Right panel: Three collapsible sections:
 *     1. Season — single-select radio-style to move images to a folder
 *     2. Characters — multi-select with "Show from other anime" toggle
 *     3. Tags — multi-select tag tree (reuses existing tag editor logic)
 *
 * The "current anime" is determined from the `?anime=` query param passed when
 * navigating from the SelectionActionBar.
 */
import { Box, Button, Flex, Stack, Text } from "@chakra-ui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  FolderOpen,
  ImageOff,
  Tag as TagIcon,
  Users,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { PageHeader } from "../../components/layout/page-header";
import { CategorySection } from "../../components/shared/category-section";
import { EmptyState } from "../../components/shared/empty-state";
import { ErrorAlert } from "../../components/shared/error-alert";
import { RowSkeleton } from "../../components/shared/loading-skeleton";
import { SearchBar } from "../../components/shared/search-bar";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { toast } from "../../components/ui/toaster";
import { TriStateCheckbox } from "../../components/ui/tri-state-checkbox";
import { useAnimeDetail } from "../../hooks/use-anime-detail";
import { useTagStats } from "../../hooks/use-tag-stats";
import { useTags } from "../../hooks/use-tags";
import { AnimeService, CharacterService, TagFrontendService } from "../../lib/api";
import {
  TAG_CATEGORY_ORDER,
  TAG_CATEGORY_TOKENS,
  tagCategoryKey,
} from "../../lib/constants";
import { formatCount } from "../../lib/format";
import { qk } from "../../lib/query-keys";
import { useSelectionStore } from "../../stores/selection-store";
import type { AnimeCharacter, Season, Tag, TagCategoryKey } from "../../types";
import {
  deriveBaselineState,
  usePendingTagChanges,
} from "../image-tag-editor/use-pending-tag-changes";
import {
  deriveCharacterBaselineState,
  usePendingCharacterChanges,
} from "./use-pending-character-changes";

/* ─── constants ─────────────────────────────────────────────────────── */

const CATEGORY_LABELS: Record<TagCategoryKey, string> = {
  scene: "Scenes",
  nature: "Nature / Weather",
  location: "Locations",
  mood: "Mood / Genre",
  character: "Characters",
  uncategorized: "Uncategorized",
};

/* ─── helpers ────────────────────────────────────────────────────────── */

function parseIdsParam(raw: string | null): number[] {
  if (!raw) return [];
  const out = new Set<number>();
  for (const chunk of raw.split(",")) {
    const n = Number(chunk.trim());
    if (Number.isInteger(n) && n > 0) out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}

function parseAnimeParam(raw: string | null): number {
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/** Flatten a season tree into a list of { id, name, depth } entries. */
function flattenSeasons(
  seasons: Season[],
  depth = 0,
): Array<{ id: number; name: string; depth: number }> {
  const result: Array<{ id: number; name: string; depth: number }> = [];
  for (const season of seasons) {
    result.push({ id: season.id, name: season.name, depth });
    if (season.children.length > 0) {
      result.push(...flattenSeasons(season.children, depth + 1));
    }
  }
  return result;
}

/* ─── Tag mutation ───────────────────────────────────────────────────── */

async function dispatchTagMutation(
  imageIds: readonly number[],
  addIds: readonly number[],
  removeIds: readonly number[],
): Promise<void> {
  if (addIds.length === 0 && removeIds.length === 0) return;
  await TagFrontendService.BatchUpdateTagsForFiles(
    [...imageIds],
    [...addIds],
    [...removeIds],
  );
}

/* ─── Character mutation ─────────────────────────────────────────────── */

async function dispatchCharacterMutation(
  imageIds: readonly number[],
  addIds: readonly number[],
  removeIds: readonly number[],
): Promise<void> {
  if (addIds.length === 0 && removeIds.length === 0) return;
  await CharacterService.BatchUpdateCharactersForFiles(
    [...imageIds],
    [...addIds],
    [...removeIds],
  );
}

/* ─── Main component ─────────────────────────────────────────────────── */

export function ImageEditorPage(): JSX.Element {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Selection source
  const idsFromUrl = useMemo(
    () => parseIdsParam(searchParams.get("ids")),
    [searchParams],
  );
  const storeIds = useSelectionStore((s) => s.selectedIds);
  const selectedImageIds = useMemo(() => {
    if (idsFromUrl.length > 0) return idsFromUrl;
    return [...storeIds].sort((a, b) => a - b);
  }, [idsFromUrl, storeIds]);

  // Anime context from URL param
  const animeId = useMemo(
    () => parseAnimeParam(searchParams.get("anime")),
    [searchParams],
  );

  // Fetch anime details (seasons, characters)
  const animeDetailQuery = useAnimeDetail(animeId);

  // Section collapse state
  const [seasonOpen, setSeasonOpen] = useState(true);
  const [charactersOpen, setCharactersOpen] = useState(true);
  const [tagsOpen, setTagsOpen] = useState(true);
  const [showOtherAnimeCharacters, setShowOtherAnimeCharacters] =
    useState(false);

  // Season selection (single-select)
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null);

  // Character pending changes
  const characterPending = usePendingCharacterChanges();

  // Tag state
  const [search, setSearch] = useState("");
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const tagsQuery = useTags();
  const statsQuery = useTagStats(selectedImageIds);
  const tagPending = usePendingTagChanges();

  // Fetch character assignments for selected images
  const characterStatsQuery = useQuery<Record<string, number[]>>({
    queryKey: ["characters", "stats", selectedImageIds],
    queryFn: async () => {
      const result = await CharacterService.GetImageCharacterIDs(
        selectedImageIds,
      );
      return result as unknown as Record<string, number[]>;
    },
    enabled: selectedImageIds.length > 0 && animeId > 0,
  });

  const totalSelected = selectedImageIds.length;

  // Characters sorted by image count desc, then alphabetically
  const animeCharacters = useMemo(() => {
    const chars = animeDetailQuery.data?.characters ?? [];
    return [...chars].sort((a, b) => {
      if (b.imageCount !== a.imageCount) return b.imageCount - a.imageCount;
      return a.name.localeCompare(b.name);
    });
  }, [animeDetailQuery.data?.characters]);

  // Seasons from the anime
  const seasons = useMemo(
    () => animeDetailQuery.data?.seasons ?? [],
    [animeDetailQuery.data?.seasons],
  );
  const flatSeasons = useMemo(() => flattenSeasons(seasons), [seasons]);

  // Character stats: for each character, count how many selected images have it
  const characterFileCountMap = useMemo(() => {
    const map = new Map<number, number>();
    if (!characterStatsQuery.data) return map;
    const rawData = characterStatsQuery.data;
    for (const imageIdStr of Object.keys(rawData)) {
      const characterIds = rawData[imageIdStr] ?? [];
      for (const charId of characterIds) {
        map.set(charId, (map.get(charId) ?? 0) + 1);
      }
    }
    return map;
  }, [characterStatsQuery.data]);

  // Tag stats
  const statsById = useMemo(() => {
    const map = new Map<number, number>();
    for (const stat of statsQuery.data ?? []) {
      map.set(stat.tagId, stat.fileCount);
    }
    return map;
  }, [statsQuery.data]);

  // Group tags by category
  const tagsByCategory = useMemo(() => {
    const buckets = new Map<TagCategoryKey, Tag[]>();
    for (const key of TAG_CATEGORY_ORDER) buckets.set(key, []);
    const allTags = tagsQuery.data ?? [];
    for (const tag of allTags) {
      const key = tagCategoryKey(tag.category);
      const list = buckets.get(key);
      if (list) list.push(tag);
    }
    for (const [key, tags] of buckets) {
      buckets.set(
        key,
        [...tags].sort((a, b) => a.name.localeCompare(b.name)),
      );
    }
    return buckets;
  }, [tagsQuery.data]);

  // Search filter for tags
  const filteredByCategory = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (needle === "") return tagsByCategory;
    const result = new Map<TagCategoryKey, Tag[]>();
    for (const key of TAG_CATEGORY_ORDER) {
      const tags = tagsByCategory.get(key) ?? [];
      const matching = tags.filter((t) =>
        t.name.toLowerCase().includes(needle),
      );
      if (matching.length > 0) result.set(key, matching);
    }
    return result;
  }, [search, tagsByCategory]);

  // Total pending changes across all sections
  const totalPendingChanges =
    tagPending.count +
    characterPending.count +
    (selectedSeasonId !== null ? 1 : 0);
  const hasAnyChanges =
    tagPending.hasChanges ||
    characterPending.hasChanges ||
    selectedSeasonId !== null;

  /* ─── Save mutations ─────────────────────────────────────────────────── */

  const saveTagsMutation = useMutation({
    mutationFn: async () => {
      await dispatchTagMutation(
        selectedImageIds,
        [...tagPending.adding],
        [...tagPending.removing],
      );
    },
    onSuccess: () => {
      toast.success(
        "Tags updated",
        tagPending.count === 1
          ? "1 tag change applied."
          : `${tagPending.count} tag changes applied.`,
      );
      queryClient.invalidateQueries({
        queryKey: qk.tags.stats(selectedImageIds),
      });
      queryClient.invalidateQueries({ queryKey: qk.tags.list() });
      if (animeId > 0) {
        queryClient.invalidateQueries({
          queryKey: qk.anime.detail(animeId),
        });
      }
      tagPending.clear();
    },
    onError: (err: unknown) => {
      const message =
        err instanceof Error ? err.message : "Unable to save tag changes.";
      toast.error("Couldn't save tags", message);
    },
  });

  const saveCharactersMutation = useMutation({
    mutationFn: async () => {
      await dispatchCharacterMutation(
        selectedImageIds,
        [...characterPending.adding],
        [...characterPending.removing],
      );
    },
    onSuccess: () => {
      toast.success(
        "Characters updated",
        characterPending.count === 1
          ? "1 character change applied."
          : `${characterPending.count} character changes applied.`,
      );
      queryClient.invalidateQueries({
        queryKey: ["characters", "stats", selectedImageIds],
      });
      if (animeId > 0) {
        queryClient.invalidateQueries({
          queryKey: qk.anime.detail(animeId),
        });
      }
      characterPending.clear();
    },
    onError: (err: unknown) => {
      const message =
        err instanceof Error
          ? err.message
          : "Unable to save character changes.";
      toast.error("Couldn't save characters", message);
    },
  });

  const saveSeasonMutation = useMutation({
    mutationFn: async () => {
      if (selectedSeasonId === null) return;
      await AnimeService.MoveFilesToSeason(selectedImageIds, selectedSeasonId);
    },
    onSuccess: () => {
      toast.success(
        "Images moved",
        `${selectedImageIds.length} image${selectedImageIds.length === 1 ? "" : "s"} moved to the selected season.`,
      );
      if (animeId > 0) {
        queryClient.invalidateQueries({
          queryKey: qk.anime.detail(animeId),
        });
      }
      setSelectedSeasonId(null);
    },
    onError: (err: unknown) => {
      const message =
        err instanceof Error ? err.message : "Unable to move files.";
      toast.error("Couldn't move files", message);
    },
  });

  /* ─── Handlers ─────────────────────────────────────────────────────── */

  const handleSaveTags = useCallback(() => {
    if (!tagPending.hasChanges || selectedImageIds.length === 0) return;
    saveTagsMutation.mutate();
  }, [tagPending.hasChanges, selectedImageIds.length, saveTagsMutation]);

  const handleSaveCharacters = useCallback(() => {
    if (!characterPending.hasChanges || selectedImageIds.length === 0) return;
    saveCharactersMutation.mutate();
  }, [
    characterPending.hasChanges,
    selectedImageIds.length,
    saveCharactersMutation,
  ]);

  const handleSaveSeason = useCallback(() => {
    if (selectedSeasonId === null || selectedImageIds.length === 0) return;
    saveSeasonMutation.mutate();
  }, [selectedSeasonId, selectedImageIds.length, saveSeasonMutation]);

  const handleCancel = useCallback(() => {
    if (hasAnyChanges) {
      setCancelConfirmOpen(true);
      return;
    }
    navigate(-1);
  }, [hasAnyChanges, navigate]);

  const handleConfirmDiscard = useCallback(() => {
    tagPending.clear();
    characterPending.clear();
    setSelectedSeasonId(null);
    setCancelConfirmOpen(false);
    navigate(-1);
  }, [tagPending, characterPending, navigate]);

  /* ─── Render ───────────────────────────────────────────────────────── */

  const headerSubtitle =
    totalSelected > 0
      ? `${formatCount(totalSelected, "image")} selected`
      : "No images selected";

  const headerActions = (
    <Flex gap="2" align="center">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={handleCancel}
        data-testid="image-editor-cancel"
      >
        Cancel
      </Button>
    </Flex>
  );

  // Empty state
  if (totalSelected === 0) {
    return (
      <Box data-testid="image-editor-page">
        <PageHeader title="Edit Images" subtitle="No images selected" />
        <Box px={{ base: "4", md: "6" }} py="8">
          <EmptyState
            icon={ImageOff}
            title="Nothing to edit"
            description="Select at least one image, then choose Edit from the action bar."
            action={
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => navigate(-1)}
                data-testid="image-editor-empty-back"
              >
                Go back
              </Button>
            }
          />
        </Box>
      </Box>
    );
  }

  const isLoading =
    tagsQuery.isLoading ||
    statsQuery.isLoading ||
    animeDetailQuery.isLoading ||
    characterStatsQuery.isLoading;
  const hasError =
    tagsQuery.isError || statsQuery.isError || animeDetailQuery.isError;
  const errorMessage = (() => {
    if (animeDetailQuery.error instanceof Error)
      return animeDetailQuery.error.message;
    if (tagsQuery.error instanceof Error) return tagsQuery.error.message;
    if (statsQuery.error instanceof Error) return statsQuery.error.message;
    return "Unable to load data.";
  })();

  const categoriesToRender = Array.from(filteredByCategory.entries()).filter(
    ([, tags]) => tags.length > 0,
  );

  return (
    <Box data-testid="image-editor-page" position="relative">
      <PageHeader
        title="Edit Images"
        subtitle={headerSubtitle}
        actions={headerActions}
      />

      {/* Selected images strip */}
      <Box
        as="section"
        aria-label="Selected images"
        data-testid="image-editor-strip"
        px={{ base: "4", md: "6" }}
        py="3"
        bg="bg.surface"
        borderBottomWidth="1px"
        borderBottomColor="border"
        overflowX="auto"
      >
        <Flex gap="2" align="center" minWidth="max-content">
          {selectedImageIds.map((id) => (
            <Box
              key={id}
              data-testid="image-editor-strip-item"
              data-file-id={id}
              flexShrink={0}
              width={{ base: "40px", md: "48px" }}
              height={{ base: "40px", md: "48px" }}
              borderRadius="sm"
              bg="primary.subtle"
              borderWidth="1px"
              borderColor="primary"
              aria-label={`Image ${id}`}
            />
          ))}
        </Flex>
      </Box>

      {/* Error state */}
      {hasError && (
        <Box px={{ base: "4", md: "6" }} py="4">
          <ErrorAlert
            title="Couldn't load data"
            message={errorMessage}
            onRetry={() => {
              tagsQuery.refetch();
              statsQuery.refetch();
              animeDetailQuery.refetch();
            }}
          />
        </Box>
      )}

      {/* Loading state */}
      {!hasError && isLoading && (
        <Box px={{ base: "4", md: "6" }} py="4">
          <Stack
            data-testid="image-editor-loading"
            gap="6"
            aria-busy="true"
            aria-live="polite"
          >
            <RowSkeleton lines={3} />
            <RowSkeleton lines={4} />
            <RowSkeleton lines={4} />
          </Stack>
        </Box>
      )}

      {/* Main content */}
      {!hasError && !isLoading && (
        <Box px={{ base: "4", md: "6" }} py="4">
          <Stack gap="6">
            {/* ─── Season Section ───────────────────────────────── */}
            {animeId > 0 && flatSeasons.length > 0 && (
              <SectionPanel
                title="Season"
                subtitle="Move images to a season folder"
                icon={FolderOpen}
                open={seasonOpen}
                onToggle={() => setSeasonOpen(!seasonOpen)}
                testId="image-editor-season-section"
                actions={
                  <Button
                    type="button"
                    size="xs"
                    bg="primary"
                    color="bg.surface"
                    _hover={{ bg: "primary.hover" }}
                    onClick={handleSaveSeason}
                    disabled={
                      selectedSeasonId === null ||
                      saveSeasonMutation.isPending
                    }
                    loading={saveSeasonMutation.isPending}
                    loadingText="Moving..."
                    data-testid="image-editor-season-save"
                  >
                    Move
                  </Button>
                }
              >
                <Stack gap="1" pl="2">
                  {flatSeasons.map((s) => (
                    <Flex
                      key={s.id}
                      align="center"
                      gap="2"
                      pl={`${s.depth * 16}px`}
                      py="1"
                      px="2"
                      borderRadius="sm"
                      cursor="pointer"
                      bg={
                        selectedSeasonId === s.id
                          ? "primary.subtle"
                          : "transparent"
                      }
                      _hover={{ bg: "bg.muted" }}
                      onClick={() =>
                        setSelectedSeasonId(
                          selectedSeasonId === s.id ? null : s.id,
                        )
                      }
                      data-testid="image-editor-season-item"
                      data-season-id={s.id}
                    >
                      <Box
                        width="14px"
                        height="14px"
                        borderRadius="full"
                        borderWidth="2px"
                        borderColor="primary"
                        display="flex"
                        alignItems="center"
                        justifyContent="center"
                        flexShrink={0}
                      >
                        {selectedSeasonId === s.id && (
                          <Box
                            width="8px"
                            height="8px"
                            borderRadius="full"
                            bg="primary"
                          />
                        )}
                      </Box>
                      <Text fontSize="sm">{s.name}</Text>
                    </Flex>
                  ))}
                </Stack>
              </SectionPanel>
            )}

            {/* ─── Characters Section ───────────────────────────── */}
            {animeId > 0 && (
              <SectionPanel
                title="Characters"
                subtitle={`${animeCharacters.length} characters`}
                icon={Users}
                open={charactersOpen}
                onToggle={() => setCharactersOpen(!charactersOpen)}
                testId="image-editor-characters-section"
                actions={
                  <Button
                    type="button"
                    size="xs"
                    bg="primary"
                    color="bg.surface"
                    _hover={{ bg: "primary.hover" }}
                    onClick={handleSaveCharacters}
                    disabled={
                      !characterPending.hasChanges ||
                      saveCharactersMutation.isPending
                    }
                    loading={saveCharactersMutation.isPending}
                    loadingText="Saving..."
                    data-testid="image-editor-characters-save"
                  >
                    Save Characters
                  </Button>
                }
              >
                <CharacterList
                  characters={animeCharacters}
                  characterFileCountMap={characterFileCountMap}
                  totalSelected={totalSelected}
                  pending={characterPending}
                />
                {/* Show from other anime toggle */}
                <Box mt="3" pt="3" borderTopWidth="1px" borderColor="border">
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    onClick={() =>
                      setShowOtherAnimeCharacters(!showOtherAnimeCharacters)
                    }
                    data-testid="image-editor-show-other-characters"
                  >
                    {showOtherAnimeCharacters
                      ? "Hide characters from other anime"
                      : "Show characters from other anime"}
                  </Button>
                  {showOtherAnimeCharacters && (
                    <Text
                      fontSize="xs"
                      color="fg.muted"
                      mt="2"
                      data-testid="image-editor-other-characters-placeholder"
                    >
                      Characters from other anime would appear here. This
                      requires fetching all anime and their characters.
                    </Text>
                  )}
                </Box>
              </SectionPanel>
            )}

            {/* ─── Tags Section ─────────────────────────────────── */}
            <SectionPanel
              title="Tags"
              subtitle={`${tagsQuery.data?.length ?? 0} tags`}
              icon={TagIcon}
              open={tagsOpen}
              onToggle={() => setTagsOpen(!tagsOpen)}
              testId="image-editor-tags-section"
              actions={
                <Button
                  type="button"
                  size="xs"
                  bg="primary"
                  color="bg.surface"
                  _hover={{ bg: "primary.hover" }}
                  onClick={handleSaveTags}
                  disabled={
                    !tagPending.hasChanges || saveTagsMutation.isPending
                  }
                  loading={saveTagsMutation.isPending}
                  loadingText="Saving..."
                  data-testid="image-editor-tags-save"
                >
                  Save Tags
                </Button>
              }
            >
              {/* Search */}
              <Box mb="3" maxW="420px">
                <SearchBar
                  value={search}
                  onChange={setSearch}
                  placeholder="Search tags..."
                  size="md"
                />
              </Box>

              {/* Pending changes summary */}
              {tagPending.hasChanges && (
                <PendingChangesBar
                  adding={tagPending.adding}
                  removing={tagPending.removing}
                />
              )}

              {/* Tag grid */}
              {categoriesToRender.length === 0 && (
                <EmptyState
                  icon={TagIcon}
                  title={search.trim() === "" ? "No tags yet" : "No matches"}
                  description={
                    search.trim() === ""
                      ? "Create tags from the Tags page, then return here to apply them."
                      : `Nothing matches "${search.trim()}". Try a different search.`
                  }
                />
              )}

              {categoriesToRender.length > 0 && (
                <Box
                  data-testid="image-editor-tag-grid"
                  display="grid"
                  gap={{ base: "4", md: "6" }}
                  gridTemplateColumns={{
                    base: "1fr",
                    md: "repeat(2, 1fr)",
                    lg: "repeat(3, 1fr)",
                  }}
                >
                  {categoriesToRender.map(([categoryKey, tags]) => (
                    <CategorySection
                      key={categoryKey}
                      category={{
                        key: categoryKey,
                        label: CATEGORY_LABELS[categoryKey],
                        tagCount: tags.length,
                        color: TAG_CATEGORY_TOKENS[categoryKey].fg,
                      }}
                    >
                      {tags.map((tag) => {
                        const fileCount = statsById.get(tag.id) ?? 0;
                        const baseline = deriveBaselineState(
                          fileCount,
                          totalSelected,
                        );
                        const effective = tagPending.getEffectiveState(
                          tag.id,
                          baseline,
                        );
                        return (
                          <Box
                            key={tag.id}
                            data-testid="image-editor-tag-row"
                            data-tag-id={tag.id}
                          >
                            <TriStateCheckbox
                              state={effective.state}
                              pending={effective.pending}
                              onChange={() => tagPending.toggle(tag.id, baseline)}
                              label={tag.name}
                              count={fileCount > 0 ? fileCount : undefined}
                            />
                            {baseline === "indeterminate" &&
                              effective.pending === null && (
                                <Text
                                  fontSize="xs"
                                  color="fg.muted"
                                  pl="3"
                                  mt="1"
                                  data-testid="image-editor-tag-partial"
                                >
                                  ({fileCount} of {totalSelected})
                                </Text>
                              )}
                          </Box>
                        );
                      })}
                    </CategorySection>
                  ))}
                </Box>
              )}
            </SectionPanel>
          </Stack>
        </Box>
      )}

      <ConfirmDialog
        open={cancelConfirmOpen}
        onClose={() => setCancelConfirmOpen(false)}
        onConfirm={handleConfirmDiscard}
        title="Discard changes?"
        description={`You have ${totalPendingChanges} pending change${
          totalPendingChanges === 1 ? "" : "s"
        }. Cancelling will discard them.`}
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        variant="danger"
      />
    </Box>
  );
}

/* ─── Section Panel component ────────────────────────────────────────── */

interface SectionPanelProps {
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ size?: number | string }>;
  open: boolean;
  onToggle: () => void;
  testId: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

function SectionPanel({
  title,
  subtitle,
  icon: Icon,
  open,
  onToggle,
  testId,
  actions,
  children,
}: SectionPanelProps): JSX.Element {
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <Box
      data-testid={testId}
      borderWidth="1px"
      borderColor="border"
      borderRadius="md"
      overflow="hidden"
    >
      {/* Header */}
      <Flex
        align="center"
        gap="2"
        px="4"
        py="3"
        bg="bg.muted"
        cursor="pointer"
        onClick={onToggle}
        data-testid={`${testId}-header`}
      >
        <Chevron size={16} aria-hidden="true" />
        <Icon size={16} aria-hidden="true" />
        <Text fontWeight="600" fontSize="sm" flex="1">
          {title}
        </Text>
        <Text fontSize="xs" color="fg.muted">
          {subtitle}
        </Text>
        {actions && (
          <Box
            onClick={(e) => e.stopPropagation()}
            ml="2"
          >
            {actions}
          </Box>
        )}
      </Flex>

      {/* Body */}
      {open && (
        <Box px="4" py="3" data-testid={`${testId}-body`}>
          {children}
        </Box>
      )}
    </Box>
  );
}

/* ─── Character List sub-component ───────────────────────────────────── */

interface CharacterListProps {
  characters: AnimeCharacter[];
  characterFileCountMap: Map<number, number>;
  totalSelected: number;
  pending: ReturnType<typeof usePendingCharacterChanges>;
}

function CharacterList({
  characters,
  characterFileCountMap,
  totalSelected,
  pending,
}: CharacterListProps): JSX.Element {
  if (characters.length === 0) {
    return (
      <Text fontSize="sm" color="fg.muted" data-testid="image-editor-no-characters">
        No characters defined for this anime.
      </Text>
    );
  }

  return (
    <Stack gap="1" data-testid="image-editor-character-list">
      {characters.map((char) => {
        const fileCount = characterFileCountMap.get(char.id) ?? 0;
        const baseline = deriveCharacterBaselineState(fileCount, totalSelected);
        const effective = pending.getEffectiveState(char.id, baseline);
        return (
          <Box
            key={char.id}
            data-testid="image-editor-character-row"
            data-character-id={char.id}
          >
            <TriStateCheckbox
              state={effective.state}
              pending={effective.pending}
              onChange={() => pending.toggle(char.id, baseline)}
              label={char.name}
              count={fileCount > 0 ? fileCount : undefined}
            />
            {baseline === "indeterminate" && effective.pending === null && (
              <Text fontSize="xs" color="fg.muted" pl="3" mt="1">
                ({fileCount} of {totalSelected})
              </Text>
            )}
          </Box>
        );
      })}
    </Stack>
  );
}

/* ─── Pending Changes Bar ─────────────────────────────────────────── */

interface PendingChangesBarProps {
  adding: ReadonlySet<number>;
  removing: ReadonlySet<number>;
}

function PendingChangesBar({
  adding,
  removing,
}: PendingChangesBarProps): JSX.Element {
  const total = adding.size + removing.size;
  return (
    <Flex
      data-testid="image-editor-pending-bar"
      align="center"
      gap="3"
      flexWrap="wrap"
      px="3"
      py="2"
      mb="3"
      borderRadius="md"
      borderWidth="1px"
      borderColor="primary"
      bg="primary.subtle"
      color="fg"
      fontSize="sm"
      minH="40px"
    >
      <Text fontWeight="500" color="primary">
        Pending:
      </Text>
      {adding.size > 0 && (
        <Box
          as="span"
          data-testid="pending-adding-count"
          px="2"
          py="0.5"
          borderRadius="pill"
          borderWidth="1px"
          borderColor="success"
          color="success"
          bg="success.bg"
          fontSize="xs"
        >
          +{adding.size} to add
        </Box>
      )}
      {removing.size > 0 && (
        <Box
          as="span"
          data-testid="pending-removing-count"
          px="2"
          py="0.5"
          borderRadius="pill"
          borderWidth="1px"
          borderColor="danger"
          color="danger"
          bg="danger.bg"
          fontSize="xs"
        >
          -{removing.size} to remove
        </Box>
      )}
      <Box flex="1" />
      <Text color="fg.muted" fontSize="xs">
        {total === 1 ? "1 change" : `${total} changes`}
      </Text>
    </Flex>
  );
}

export default ImageEditorPage;
