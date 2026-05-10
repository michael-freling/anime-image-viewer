/**
 * Search page — single toolbar row + inline filters + full-width masonry results.
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
import { Search as SearchIcon, ChevronDown, ChevronRight, Filter } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate, useSearchParams } from "react-router";

import { ImageViewerOverlay } from "../../components/image-viewer";
import { EmptyState } from "../../components/shared/empty-state";
import { ErrorAlert } from "../../components/shared/error-alert";
import { FilterChip } from "../../components/shared/filter-chip";
import { GridSizeControl } from "../../components/shared/grid-size-control";
import { ImageGrid } from "../../components/shared/image-grid";
import {
  ImageThumbnailSkeleton,
} from "../../components/shared/loading-skeleton";
import { SearchBar } from "../../components/shared/search-bar";
import { Collapsible } from "../../components/ui/collapsible";
import { RubberBandOverlay } from "../../components/selection/rubber-band-overlay";
import { SelectionActionBar } from "../../components/selection/selection-action-bar";
import { useAnimeDetail } from "../../hooks/use-anime-detail";
import { useImageSelection } from "../../hooks/use-image-selection";
import { useSearchImages } from "../../hooks/use-search-images";
import { useTags } from "../../hooks/use-tags";
import { gridSizeColumnWidth } from "../../lib/constants";
import { useSelectionStore } from "../../stores/selection-store";
import { useUIStore } from "../../stores/ui-store";
import type { ImageFile, Tag } from "../../types";

import { CharacterPicker } from "./character-picker";
import {
  cycleCharacterId,
  cycleTagId,
  filterStateFromSearchParams,
  filterStateToSearchParams,
  isEmptyFilterState,
  type SearchFilterState,
} from "./filter-state";
import { SeasonPicker } from "./season-picker";
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

  const handleCycleTag = useCallback(
    (id: number) => {
      const current = filterStateFromSearchParams(searchParams);
      updateState(cycleTagId(current, id));
    },
    [searchParams, updateState],
  );

  const handleCycleCharacter = useCallback(
    (id: number) => {
      const current = filterStateFromSearchParams(searchParams);
      updateState(cycleCharacterId(current, id));
    },
    [searchParams, updateState],
  );

  const handleSelectSeason = useCallback(
    (seasonId: number | null) => {
      const current = filterStateFromSearchParams(searchParams);
      updateState({ ...current, seasonId });
    },
    [searchParams, updateState],
  );

  const handleRemoveAnime = useCallback(() => {
    const current = filterStateFromSearchParams(searchParams);
    updateState({ ...current, animeId: null, seasonId: null });
  }, [searchParams, updateState]);

  const handleClearAll = useCallback(() => {
    setInputValue("");
    setSearchParams({});
  }, [setSearchParams]);

  // React Query hooks.
  const tagsQuery = useTags();
  const animeDetailQuery = useAnimeDetail(urlState.animeId ?? 0);
  const searchQuery = useSearchImages({
    animeId: urlState.animeId ?? undefined,
    seasonId: urlState.seasonId ?? undefined,
    includeTagIds: urlState.includeIds,
    excludeTagIds: urlState.excludeIds,
    includeCharacterIds: urlState.includeCharacterIds,
    excludeCharacterIds: urlState.excludeCharacterIds,
  });

  // When an anime filter is active, scope the pickers to that anime's
  // derived tags instead of showing the full global tag list.
  const allPickerTags = useMemo<Tag[]>(() => {
    if (urlState.animeId != null && animeDetailQuery.data?.tags) {
      return animeDetailQuery.data.tags.map((t) => ({
        id: t.id,
        name: t.name,
        category: t.category,
      }));
    }
    return tagsQuery.data ?? [];
  }, [urlState.animeId, animeDetailQuery.data, tagsQuery.data]);

  // Tags are used directly — characters are no longer mixed in with tags.
  const pickerTags = allPickerTags;

  // Characters come from the anime detail's dedicated `characters` field.
  const pickerCharacters = useMemo<Tag[]>(() => {
    if (urlState.animeId == null || !animeDetailQuery.data?.characters) {
      return [];
    }
    return animeDetailQuery.data.characters.map((c) => ({
      id: c.id,
      name: c.name,
      category: "character",
    }));
  }, [urlState.animeId, animeDetailQuery.data]);

  // Seasons come from the anime detail when an anime is selected.
  const pickerSeasons = useMemo(() => {
    if (urlState.animeId == null || !animeDetailQuery.data?.seasons) {
      return [];
    }
    return animeDetailQuery.data.seasons;
  }, [urlState.animeId, animeDetailQuery.data]);

  const images = searchQuery.data ?? [];
  const filteredImages = useMemo(
    () => filterByQuery(images, urlState.query),
    [images, urlState.query],
  );

  const gridSize = useUIStore((s) => s.gridSize);

  // Select-mode wiring.
  const selectMode = useSelectionStore((s) => s.selectMode);
  const selectedIds = useSelectionStore((s) => s.selectedIds);
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
      if (ids.size === 0) {
        setPendingIds(new Set<number>());
        return;
      }
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

  const handleLongPress = useCallback(
    (image: ImageFile) => {
      useSelectionStore.getState().enterSelectMode(image.id);
    },
    [],
  );

  const isEmpty = isEmptyFilterState(urlState);
  const isLoading = searchQuery.isLoading && !searchQuery.data;
  const hasError = searchQuery.isError;

  // Collapsible filter panel: expanded when no filters are active (so the
  // user discovers the pickers), collapsed when filters are pre-set (e.g.
  // navigating from anime detail with a character filter).
  const [filterPanelOpen, setFilterPanelOpen] = useState(
    () => isEmptyFilterState(filterStateFromSearchParams(searchParams)),
  );

  const activeFilterCount = useMemo(() => {
    let count = 0;
    count += urlState.includeIds.length;
    count += urlState.excludeIds.length;
    count += urlState.includeCharacterIds.length;
    count += urlState.excludeCharacterIds.length;
    if (urlState.animeId != null) count += 1;
    if (urlState.seasonId != null) count += 1;
    if (urlState.query.trim().length > 0) count += 1;
    return count;
  }, [urlState]);

  const handleToggleFilterPanel = useCallback(() => {
    setFilterPanelOpen((prev) => !prev);
  }, []);

  // Auto-expand the filter panel when all filters are cleared so the user
  // can discover the pickers again.
  useEffect(() => {
    if (isEmpty) {
      setFilterPanelOpen(true);
    }
  }, [isEmpty]);

  // Clear season when anime changes or is removed (seasons are anime-specific).
  const prevAnimeIdRef = useRef(urlState.animeId);
  useEffect(() => {
    if (prevAnimeIdRef.current !== urlState.animeId && urlState.seasonId != null) {
      const current = filterStateFromSearchParams(searchParams);
      updateState({ ...current, seasonId: null });
    }
    prevAnimeIdRef.current = urlState.animeId;
  }, [urlState.animeId]);

  // Reset rubber-band pending state when filters change so stale ids don't
  // leak into the new result set.
  useEffect(() => {
    setPendingIds(new Set<number>());
  }, [urlState.includeIds, urlState.excludeIds, urlState.includeCharacterIds, urlState.excludeCharacterIds, urlState.query]);

  // Clear selection when the caller exits select mode elsewhere.
  useEffect(() => {
    if (!selectMode) setPendingIds(new Set<number>());
  }, [selectMode]);

  const Chevron = filterPanelOpen ? ChevronDown : ChevronRight;

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
      {/* Single sticky toolbar row */}
      <Box
        as="header"
        position="sticky"
        top="0"
        zIndex="sticky"
        bg="bg.surface"
        borderBottomWidth="1px"
        borderColor="border"
        px={{ base: "4", md: "6" }}
        py="3"
      >
        <Flex align="center" gap="3">
          <Box flex="1" minW={0}>
            <SearchBar
              value={inputValue}
              onChange={setInputValue}
              placeholder="Search images..."
              size="md"
            />
          </Box>
          <Button
            type="button"
            data-testid="search-filter-toggle"
            onClick={handleToggleFilterPanel}
            size="sm"
            variant="outline"
            aria-expanded={filterPanelOpen}
            aria-controls="search-filter-panel"
          >
            <Flex align="center" gap="2">
              <Filter size={14} aria-hidden="true" />
              <span>
                Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
              </span>
              <Chevron size={14} aria-hidden="true" />
            </Flex>
          </Button>
          <GridSizeControl />
        </Flex>
      </Box>

      {selectMode && (
        <SelectionActionBar
          visibleIds={visibleIds}
          totalVisible={filteredImages.length}
          onEdit={() =>
            navigate(
              urlState.animeId != null
                ? `/images/edit?anime=${urlState.animeId}`
                : "/images/edit",
            )
          }
        />
      )}

      <Collapsible open={filterPanelOpen}>
        <Box
          id="search-filter-panel"
          px={{ base: "4", md: "6" }}
        >
          {/* Active filter summary: anime chip + clear all */}
          {activeFilterCount > 0 && (
            <Flex
              data-testid="filter-active-row"
              align="center"
              gap="2"
              py="2"
              wrap="wrap"
            >
              {animeDetailQuery.data?.anime.name && (
                <FilterChip
                  label={animeDetailQuery.data.anime.name}
                  variant="include"
                  onRemove={handleRemoveAnime}
                />
              )}
              <Box flex="1" />
              <Button
                type="button"
                data-testid="search-clear-all"
                onClick={handleClearAll}
                size="sm"
                variant="ghost"
                color="primary"
                fontSize="sm"
                fontWeight="500"
              >
                Clear all
              </Button>
            </Flex>
          )}

          {/* Season picker: shown when an anime filter is active and the
              anime has seasons. */}
          {urlState.animeId != null && pickerSeasons.length > 0 && (
            <SeasonPicker
              seasons={pickerSeasons}
              selectedSeasonId={urlState.seasonId}
              onSelectSeason={handleSelectSeason}
            />
          )}

          {/* Character picker: shown when an anime filter is active and the
              anime has characters. */}
          {urlState.animeId != null && pickerCharacters.length > 0 && (
            <CharacterPicker
              characters={pickerCharacters}
              includedIds={urlState.includeCharacterIds}
              excludedIds={urlState.excludeCharacterIds}
              onCycleCharacter={handleCycleCharacter}
            />
          )}

          {/* Tag picker: always shown when the library has tags so the user
              can discover filters without having typed anything yet. When an
              anime filter is active, shows only that anime's tags. */}
          {pickerTags.length > 0 && (
            <TagPicker
              tags={pickerTags}
              includedIds={urlState.includeIds}
              excludedIds={urlState.excludeIds}
              onCycleTag={handleCycleTag}
            />
          )}
        </Box>
      </Collapsible>

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
            onLongPress={handleLongPress}
            columnWidth={gridSizeColumnWidth(gridSize)}
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
