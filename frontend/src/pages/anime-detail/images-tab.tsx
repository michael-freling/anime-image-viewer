/**
 * ImagesTab — the primary tab on the Anime Detail page.
 *
 * Spec: ui-design.md §3.2.1 / §3.3 (Images tab), §4.2 (Image Tile), §5
 * (Select Mode).
 *
 * Responsibilities:
 *   - Entry sub-filter row (All + one chip per entry) using EntryTab.
 *   - Client-side filename filter via SearchBar.
 *   - ImageGrid (masonry) with lazy loading + srcset.
 *   - Select mode: button toggle, SelectionActionBar, RubberBandOverlay.
 *   - Loading skeletons, error alert, empty state.
 *
 * Why the grid owns `containerRef`: RubberBandOverlay reads DOM nodes with
 * `[data-image-id]` inside its container to hit-test pending selection. The
 * ImageThumbnail wrapper uses `data-file-id` internally, so we wrap each
 * tile with an outer Box that carries `data-image-id` — kept in sync with
 * the ImageGrid render prop so the overlay's pending computation picks up
 * every tile.
 */
import { Box, Button, Flex, Stack } from "@chakra-ui/react";
import { ImageOff, Upload, CheckSquare } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router";

import { EmptyState } from "../../components/shared/empty-state";
import { EntryTab } from "../../components/shared/entry-tab";
import { ErrorAlert } from "../../components/shared/error-alert";
import { ImageGrid } from "../../components/shared/image-grid";
import { ImageThumbnailSkeleton } from "../../components/shared/loading-skeleton";
import { SearchBar } from "../../components/shared/search-bar";
import { RubberBandOverlay } from "../../components/selection/rubber-band-overlay";
import { SelectionActionBar } from "../../components/selection/selection-action-bar";
import { useAnimeDetail } from "../../hooks/use-anime-detail";
import { useAnimeImages } from "../../hooks/use-anime-images";
import { useImageSelection } from "../../hooks/use-image-selection";
import { useSelectionStore } from "../../stores/selection-store";
import type { Entry, ImageFile } from "../../types";

function parseAnimeId(raw: string | undefined): number {
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Flatten an entry tree into a flat list: top-level entries first, each
 * followed by their children. The UI shows the tree as a single scroll of
 * chips, but child entries still render as their own filter.
 */
function flattenEntries(entries: Entry[] | undefined): Entry[] {
  if (!entries) return [];
  const out: Entry[] = [];
  for (const e of entries) {
    out.push(e);
    if (e.children && e.children.length > 0) {
      for (const child of e.children) {
        out.push(child);
      }
    }
  }
  return out;
}

function entryLabel(entry: Entry): string {
  if (entry.name) return entry.name;
  if (entry.type === "season" && entry.entryNumber != null) {
    return `Season ${entry.entryNumber}`;
  }
  if (entry.type === "movie" && entry.entryNumber != null) {
    return `Movie (${entry.entryNumber})`;
  }
  return `Entry #${entry.id}`;
}

export function ImagesTab(): JSX.Element {
  const { animeId: rawId } = useParams<{ animeId: string }>();
  const animeId = parseAnimeId(rawId);

  const [searchParams, setSearchParams] = useSearchParams();
  const rawEntryParam = searchParams.get("entry");
  const entryIdFromUrl = rawEntryParam ? Number(rawEntryParam) : null;
  const selectedEntryId =
    entryIdFromUrl && Number.isFinite(entryIdFromUrl) && entryIdFromUrl > 0
      ? entryIdFromUrl
      : null;

  const detailQuery = useAnimeDetail(animeId);
  const imagesQuery = useAnimeImages(animeId, selectedEntryId);

  const entries = useMemo(
    () => flattenEntries(detailQuery.data?.entries),
    [detailQuery.data],
  );

  const [filterText, setFilterText] = useState("");

  // Filter images client-side by filename.
  const filteredImages = useMemo<ImageFile[]>(() => {
    const all = imagesQuery.data ?? [];
    if (!filterText.trim()) return all;
    const needle = filterText.trim().toLowerCase();
    return all.filter((img) => img.name.toLowerCase().includes(needle));
  }, [imagesQuery.data, filterText]);

  const visibleIds = useMemo(
    () => filteredImages.map((img) => img.id),
    [filteredImages],
  );

  const selectMode = useSelectionStore((s) => s.selectMode);
  const toggleSelectMode = useSelectionStore((s) => s.toggleSelectMode);
  const setSelected = useSelectionStore((s) => s.setSelected);

  const [pendingIds, setPendingIds] = useState<Set<number>>(new Set());
  const selection = useImageSelection(visibleIds);

  const gridContainerRef = useRef<HTMLDivElement>(null);

  const handleEntryClick = (entryId: number | null) => {
    if (entryId === null) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete("entry");
        return next;
      });
    } else {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("entry", String(entryId));
        return next;
      });
    }
  };

  const handleImageClick = (image: ImageFile, event: React.MouseEvent) => {
    if (selectMode) {
      selection.handleClick(
        {
          shiftKey: event.shiftKey,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
        },
        image.id,
      );
      return;
    }
    // TODO(phase-e1): open the ImageViewer overlay. For now we log so the
    // integration test confirms the click path exists without depending on
    // the viewer shipping.
    console.debug("[ImagesTab] open viewer for", image.id);
  };

  const handleRubberBandCommit = (
    finalIds: Set<number>,
    isAdditive: boolean,
  ) => {
    if (isAdditive) {
      // Merge pending with existing selection.
      const current = useSelectionStore.getState().selectedIds;
      const next = new Set<number>(current);
      finalIds.forEach((id) => next.add(id));
      setSelected(next);
    } else {
      setSelected(finalIds);
    }
    setPendingIds(new Set());
  };

  const isLoading = imagesQuery.isLoading;
  const hasError = imagesQuery.isError;
  const hasImages = filteredImages.length > 0;

  return (
    <Box
      data-testid="images-tab"
      data-anime-id={animeId}
      px={{ base: "3", md: "4" }}
      py={{ base: "3", md: "4" }}
    >
      <SelectionActionBar
        visibleIds={visibleIds}
        totalVisible={filteredImages.length}
      />

      {/* Entry sub-filter row (ui-design §3.2.1). */}
      {entries.length > 0 ? (
        <Flex
          as="nav"
          role="tablist"
          aria-label="Entries filter"
          data-testid="entry-filter-row"
          gap="2"
          py="2"
          wrap="wrap"
        >
          <EntryTab
            label="All episodes"
            count={imagesQuery.data?.length}
            active={selectedEntryId === null}
            onClick={() => handleEntryClick(null)}
          />
          {entries.map((entry) => (
            <EntryTab
              key={entry.id}
              label={entryLabel(entry)}
              count={entry.imageCount}
              active={selectedEntryId === entry.id}
              onClick={() => handleEntryClick(entry.id)}
            />
          ))}
        </Flex>
      ) : null}

      {/* Toolbar: search + select toggle */}
      <Flex
        data-testid="images-tab-toolbar"
        align="center"
        gap="3"
        py="2"
        direction={{ base: "column", md: "row" }}
      >
        <Box flex="1" width="100%" minW={0}>
          <SearchBar
            value={filterText}
            onChange={setFilterText}
            placeholder="Filter by filename"
            size="md"
          />
        </Box>
        <Button
          type="button"
          size="sm"
          variant={selectMode ? "solid" : "outline"}
          onClick={() => toggleSelectMode()}
          data-testid="images-tab-select-toggle"
          aria-pressed={selectMode}
          aria-label={selectMode ? "Exit select mode" : "Enter select mode"}
        >
          <Box as="span" aria-hidden="true" display="inline-flex" mr="2">
            <CheckSquare size={14} />
          </Box>
          {selectMode ? "Selecting…" : "Select"}
        </Button>
      </Flex>

      {/* Grid / empty / error / loading states */}
      {hasError ? (
        <ErrorAlert
          title="Could not load images"
          message={
            imagesQuery.error instanceof Error
              ? imagesQuery.error.message
              : String(imagesQuery.error ?? "")
          }
          onRetry={() => {
            void imagesQuery.refetch();
          }}
        />
      ) : isLoading ? (
        <Stack
          data-testid="images-tab-loading"
          gap="3"
          direction="row"
          wrap="wrap"
        >
          {Array.from({ length: 8 }).map((_, i) => (
            <Box key={i} width="180px">
              <ImageThumbnailSkeleton aspectRatio="1 / 1" />
            </Box>
          ))}
        </Stack>
      ) : !hasImages ? (
        <EmptyState
          icon={ImageOff}
          title={filterText ? "No matching images" : "No images yet"}
          description={
            filterText
              ? `Nothing matches "${filterText}". Clear the filter to see all images.`
              : "Upload images or import folders to fill this anime."
          }
          action={
            !filterText ? (
              <Button
                type="button"
                size="sm"
                variant="solid"
                data-testid="images-tab-empty-upload"
              >
                <Box as="span" aria-hidden="true" display="inline-flex" mr="2">
                  <Upload size={14} />
                </Box>
                Upload images
              </Button>
            ) : null
          }
        />
      ) : (
        <Box
          ref={gridContainerRef}
          data-testid="images-tab-grid-container"
          position="relative"
          minHeight="200px"
        >
          <ImageGrid
            images={filteredImages}
            selectedIds={selection.selectedIds}
            pendingIds={pendingIds}
            selectMode={selectMode}
            onImageClick={handleImageClick}
          />
          {selectMode ? (
            <RubberBandOverlay
              containerRef={gridContainerRef}
              onSelectionChange={setPendingIds}
              onSelectionCommit={handleRubberBandCommit}
            />
          ) : null}
        </Box>
      )}
    </Box>
  );
}

export default ImagesTab;
