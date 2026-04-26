/**
 * Search page — hero bar + inline filters + full-width masonry results.
 *
 * Spec: ui-design.md §3.4 (search screen layout) + wireframe
 * `04-search-desktop.svg`. Also touches §4.2 (Image Tile), §4.3 (Tag Chip),
 * §5 (Select Mode) for the grid states.
 *
 * Data flow:
 *   1. URL search params are the canonical filter state (so deep links +
 *      browser back/forward restore the view). `useSearchParams` decodes
 *      them on mount via `filterStateFromSearchParams`.
 *   2. Local state holds the raw text in the search input; we debounce it
 *      300ms before writing back to the URL so the user's keystrokes don't
 *      spam history entries. Tag add/remove writes to the URL immediately.
 *   3. `useSearchImages` runs against the include/exclude tag arrays; the
 *      free-text filter is applied client-side on image `name` (the backend
 *      has no substring search yet — see report).
 *   4. Selection lives in `useSelectionStore`; the page drives select-mode
 *      toggling, rubber-band overlay, and the action bar.
 */
import { Box, Button, Flex, Stack, Text } from "@chakra-ui/react";
import { useDebouncedValue } from "@mantine/hooks";
import { Search as SearchIcon, CheckSquare, SquareDashed } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate, useSearchParams } from "react-router";

import { ImageViewerOverlay } from "../../components/image-viewer";
import { PageHeader } from "../../components/layout/page-header";
import { EmptyState } from "../../components/shared/empty-state";
import { ErrorAlert } from "../../components/shared/error-alert";
import { ImageGrid } from "../../components/shared/image-grid";
import {
  ImageThumbnailSkeleton,
} from "../../components/shared/loading-skeleton";
import { SearchBar } from "../../components/shared/search-bar";
import { RubberBandOverlay } from "../../components/selection/rubber-band-overlay";
import { SelectionActionBar } from "../../components/selection/selection-action-bar";
import { useAnimeDetail } from "../../hooks/use-anime-detail";
import { useImageSelection } from "../../hooks/use-image-selection";
import { useSearchImages } from "../../hooks/use-search-images";
import { useTagMap, useTags } from "../../hooks/use-tags";
import { useSelectionStore } from "../../stores/selection-store";
import type { ImageFile, Tag } from "../../types";

import { ActiveFiltersBar } from "./active-filters-bar";
import {
  addIncludeId,
  filterStateFromSearchParams,
  filterStateToSearchParams,
  isEmptyFilterState,
  removeTagId,
  type SearchFilterState,
} from "./filter-state";
import { TagPicker } from "./tag-picker";

const SEARCH_DEBOUNCE_MS = 300;
const SKELETON_COUNT = 10;

function filterByQuery(
  images: readonly ImageFile[],
  query: string,
): ImageFile[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return [...images];
  return images.filter((img) => img.name.toLowerCase().includes(needle));
}

function formatResultCount(count: number): string {
  if (count === 1) return "1 image matches your filters";
  return `${count} images match your filters`;
}

export function SearchPage(): JSX.Element {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Decode URL -> state on every render; React Router guarantees a stable
  // `searchParams` reference until the URL actually changes so this memo
  // re-computes only then.
  const urlState = useMemo<SearchFilterState>(
    () => filterStateFromSearchParams(searchParams),
    [searchParams],
  );

  // Local text state lags the URL by the debounce window. We seed it from
  // the URL so deep links render the input with the right value, and we
  // resync whenever the URL changes from outside the input (e.g. back
  // button or clicking a chip).
  const [inputValue, setInputValue] = useState(urlState.query);
  const lastUrlQueryRef = useRef(urlState.query);
  useEffect(() => {
    if (lastUrlQueryRef.current !== urlState.query) {
      lastUrlQueryRef.current = urlState.query;
      setInputValue(urlState.query);
    }
  }, [urlState.query]);

  const [debouncedInput] = useDebouncedValue(inputValue, SEARCH_DEBOUNCE_MS);

  // Debounced text back to the URL. We skip when the values already match
  // so round-trips from URL -> input -> URL don't flap.
  useEffect(() => {
    const next = debouncedInput.trim();
    if (next === urlState.query) return;
    const nextState: SearchFilterState = { ...urlState, query: next };
    setSearchParams(filterStateToSearchParams(nextState), { replace: true });
    // We intentionally depend on `debouncedInput` only — `urlState` changing
    // via tag edits shouldn't also retrigger a text sync.
  }, [debouncedInput]);

  const updateState = useCallback(
    (next: SearchFilterState) => {
      setSearchParams(filterStateToSearchParams(next));
    },
    [setSearchParams],
  );

  const handleAddIncludeTag = useCallback(
    (id: number) => {
      const current = filterStateFromSearchParams(searchParams);
      // Toggle: adding an already-included tag removes it so the tag picker
      // behaves like a press-state toggle.
      if (current.includeIds.includes(id)) {
        updateState(removeTagId(current, id));
      } else {
        updateState(addIncludeId(current, id));
      }
    },
    [searchParams, updateState],
  );

  const handleRemoveTag = useCallback(
    (id: number) => {
      const current = filterStateFromSearchParams(searchParams);
      updateState(removeTagId(current, id));
    },
    [searchParams, updateState],
  );

  const handleRemoveAnime = useCallback(() => {
    const current = filterStateFromSearchParams(searchParams);
    updateState({ ...current, animeId: null });
  }, [searchParams, updateState]);

  const handleClearAll = useCallback(() => {
    setInputValue("");
    setSearchParams({});
  }, [setSearchParams]);

  // React Query hooks.
  const tagsQuery = useTags();
  const tagMapQuery = useTagMap();
  const animeDetailQuery = useAnimeDetail(urlState.animeId ?? 0);
  const searchQuery = useSearchImages({
    animeId: urlState.animeId ?? undefined,
    includeTagIds: urlState.includeIds,
    excludeTagIds: urlState.excludeIds,
  });

  // When an anime filter is active, scope the tag picker to that anime's
  // derived tags instead of showing the full global tag list.
  const pickerTags = useMemo<Tag[]>(() => {
    if (urlState.animeId != null && animeDetailQuery.data?.tags) {
      return animeDetailQuery.data.tags.map((t) => ({
        id: t.id,
        name: t.name,
        category: t.category,
      }));
    }
    return tagsQuery.data ?? [];
  }, [urlState.animeId, animeDetailQuery.data, tagsQuery.data]);

  const images = searchQuery.data ?? [];
  const filteredImages = useMemo(
    () => filterByQuery(images, urlState.query),
    [images, urlState.query],
  );

  // Select-mode wiring.
  const selectMode = useSelectionStore((s) => s.selectMode);
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const toggleSelectMode = useSelectionStore((s) => s.toggleSelectMode);
  const setSelected = useSelectionStore((s) => s.setSelected);


  const visibleIds = useMemo(
    () => filteredImages.map((img) => img.id),
    [filteredImages],
  );
  const { handleClick } = useImageSelection(visibleIds);

  // Image viewer overlay state.
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const handleViewerClose = useCallback(() => {
    setViewerOpen(false);
  }, []);

  const handleViewerIndexChange = useCallback((nextIndex: number) => {
    setViewerIndex(nextIndex);
  }, []);

  // Rubber band wiring.
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<number>>(
    () => new Set<number>(),
  );

  const handleRubberBandChange = useCallback((ids: Set<number>) => {
    setPendingIds(ids);
  }, []);

  const handleRubberBandCommit = useCallback(
    (ids: Set<number>, isAdditive: boolean) => {
      if (isAdditive) {
        const next = new Set<number>(selectedIds);
        for (const id of ids) next.add(id);
        setSelected(next);
      } else {
        setSelected(ids);
      }
      setPendingIds(new Set<number>());
    },
    [selectedIds, setSelected],
  );

  const getIdAtPoint = useCallback(
    (x: number, y: number): number | null => {
      const container = gridRef.current;
      if (!container) return null;
      // Walk up from the element at (x, y) until we find a tile with a
      // data-file-id attribute. The ImageThumbnail wrapper emits that id,
      // so mousedowns that hit an image bail out of rubber-band drag.
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      const tile = el?.closest("[data-file-id]");
      if (!tile) return null;
      const raw = tile.getAttribute("data-file-id");
      if (!raw) return null;
      const id = Number(raw);
      return Number.isFinite(id) ? id : null;
    },
    [],
  );

  const handleImageClick = useCallback(
    (image: ImageFile, event: React.MouseEvent) => {
      if (!selectMode) {
        // Open the full-screen image viewer at the clicked image's position.
        const clickedIndex = filteredImages.findIndex(
          (img) => img.id === image.id,
        );
        if (clickedIndex < 0) return;
        returnFocusRef.current = event.currentTarget as HTMLElement;
        setViewerIndex(clickedIndex);
        setViewerOpen(true);
        return;
      }
      handleClick(event, image.id);
    },
    [handleClick, selectMode, filteredImages],
  );

  const handleToggleSelectMode = useCallback(() => {
    toggleSelectMode();
  }, [toggleSelectMode]);

  const isEmpty = isEmptyFilterState(urlState);
  const isLoading = searchQuery.isLoading && !searchQuery.data;
  const hasError = searchQuery.isError;

  // Reset rubber-band pending state when filters change so stale ids don't
  // leak into the new result set.
  useEffect(() => {
    setPendingIds(new Set<number>());
  }, [urlState.includeIds, urlState.excludeIds, urlState.query]);

  // Clear selection when the caller exits select mode elsewhere.
  useEffect(() => {
    if (!selectMode) setPendingIds(new Set<number>());
  }, [selectMode]);

  const selectToggleButton = (
    <Button
      type="button"
      data-testid="search-select-mode-toggle"
      onClick={handleToggleSelectMode}
      size="sm"
      variant={selectMode ? "solid" : "outline"}
      colorPalette="indigo"
      aria-pressed={selectMode}
    >
      <Flex align="center" gap="2">
        {selectMode ? (
          <CheckSquare size={14} aria-hidden="true" />
        ) : (
          <SquareDashed size={14} aria-hidden="true" />
        )}
        <span>{selectMode ? "Exit select" : "Select"}</span>
      </Flex>
    </Button>
  );

  return (
    <Box
      data-testid="search-page"
      display="flex"
      flexDirection="column"
      overflow="hidden"
      css={{
        height: "100vh",
        "@media (max-width: 639px)": {
          height: "calc(100vh - 72px)",
        },
      }}
    >
      <PageHeader title="Search" actions={selectToggleButton} />

      {selectMode && (
        <SelectionActionBar
          visibleIds={visibleIds}
          totalVisible={filteredImages.length}
          onEditTags={() => navigate("/images/edit/tags")}
        />
      )}

      <Box
        as="section"
        aria-label="Search hero"
        px={{ base: "4", md: "6" }}
        py="4"
        borderBottomWidth="1px"
        borderBottomColor="border"
        bg="bg.surface"
      >
        <SearchBar
          value={inputValue}
          onChange={setInputValue}
          placeholder="Search images by filename or tag..."
          size="lg"
        />
      </Box>

      <ActiveFiltersBar
        state={urlState}
        tagMap={tagMapQuery.data}
        animeName={animeDetailQuery.data?.anime.name}
        onRemoveAnime={handleRemoveAnime}
        onRemove={handleRemoveTag}
        onClearAll={handleClearAll}
        totalLabel={
          !isEmpty && !isLoading && !hasError
            ? formatResultCount(filteredImages.length)
            : undefined
        }
      />

      {/* Tag picker: always shown when the library has tags so the user
          can discover filters without having typed anything yet. When an
          anime filter is active, shows only that anime's tags. */}
      {pickerTags.length > 0 && (
        <TagPicker
          tags={pickerTags}
          includedIds={urlState.includeIds}
          excludedIds={urlState.excludeIds}
          onToggleInclude={handleAddIncludeTag}
        />
      )}

      <Box
        as="section"
        aria-label="Search results"
        position="relative"
        px={{ base: "4", md: "6" }}
        py="4"
        ref={gridRef}
        flex="1"
        minHeight="0"
        display="flex"
        flexDirection="column"
      >
        {hasError && (
          <ErrorAlert
            title="Search failed"
            message={
              searchQuery.error instanceof Error
                ? searchQuery.error.message
                : "Unable to load results"
            }
            onRetry={() => searchQuery.refetch()}
          />
        )}

        {!hasError && isLoading && (
          <Stack
            data-testid="search-loading"
            direction="row"
            wrap="wrap"
            gap="3"
            aria-busy="true"
            aria-live="polite"
          >
            {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
              <Box key={i} width={{ base: "46%", md: "22%", lg: "18%" }}>
                <ImageThumbnailSkeleton />
              </Box>
            ))}
          </Stack>
        )}

        {!hasError && !isLoading && isEmpty && (
          <EmptyState
            icon={SearchIcon}
            title="Start searching"
            description="Use filters to find images across your library."
          />
        )}

        {!hasError && !isLoading && !isEmpty && (
          <ImageGrid
            images={filteredImages}
            selectedIds={selectedIds}
            pendingIds={pendingIds}
            selectMode={selectMode}
            onImageClick={handleImageClick}
            emptyState={
              <EmptyState
                icon={SearchIcon}
                title="No matches"
                description="Try a different keyword or adjust your tag filters."
                action={
                  <Button
                    type="button"
                    data-testid="search-no-matches-clear"
                    onClick={handleClearAll}
                    size="sm"
                    colorPalette="indigo"
                  >
                    Clear filters
                  </Button>
                }
              />
            }
          />
        )}

        {selectMode && (
          <RubberBandOverlay
            containerRef={gridRef as React.RefObject<HTMLElement>}
            onSelectionChange={handleRubberBandChange}
            onSelectionCommit={handleRubberBandCommit}
            getIdAtPoint={getIdAtPoint}
          />
        )}
      </Box>

      {/*
        Visually-hidden live region that announces result count changes so
        assistive tech users hear the count without having to read the chips.
      */}
      <Text
        data-testid="search-result-count-live"
        role="status"
        aria-live="polite"
        position="absolute"
        width="1px"
        height="1px"
        overflow="hidden"
      >
        {!hasError && !isLoading && !isEmpty
          ? formatResultCount(filteredImages.length)
          : ""}
      </Text>

      <ImageViewerOverlay
        open={viewerOpen}
        images={filteredImages}
        currentIndex={viewerIndex}
        onIndexChange={handleViewerIndexChange}
        onClose={handleViewerClose}
        returnFocusRef={returnFocusRef}
      />
    </Box>
  );
}

export default SearchPage;
