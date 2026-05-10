/**
 * ImagesTab — the primary tab on the Anime Detail page.
 *
 * Spec: ui-design.md §3.2.1 / §3.3 (Images tab), §4.2 (Image Tile), §5
 * (Select Mode).
 *
 * Responsibilities:
 *   - Simple toolbar with Search (navigates to search page) and Upload buttons.
 *   - ImageGrid (masonry) showing ALL images for the anime.
 *   - Select mode: button toggle, SelectionActionBar, RubberBandOverlay.
 *   - Loading skeletons, error alert, empty state.
 */
import { Box, Button, Flex, Stack } from "@chakra-ui/react";
import { ImageOff, Search, Upload } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";

import { ImageViewerOverlay } from "../../components/image-viewer";
import { EmptyState } from "../../components/shared/empty-state";
import { ErrorAlert } from "../../components/shared/error-alert";
import { GridSizeControl } from "../../components/shared/grid-size-control";
import { ImageGrid } from "../../components/shared/image-grid";
import { ImageThumbnailSkeleton } from "../../components/shared/loading-skeleton";
import { RubberBandOverlay } from "../../components/selection/rubber-band-overlay";
import { SelectionActionBar } from "../../components/selection/selection-action-bar";
import { useAnimeDetail } from "../../hooks/use-anime-detail";
import { useAnimeImages } from "../../hooks/use-anime-images";
import { useImageImport } from "../../hooks/use-image-import";
import { useImageSelection } from "../../hooks/use-image-selection";
import { gridSizeColumnWidth } from "../../lib/constants";
import { qk } from "../../lib/query-keys";
import { useSelectionStore } from "../../stores/selection-store";
import { useUIStore } from "../../stores/ui-store";
import type { ImageFile } from "../../types";

function parseAnimeId(raw: string | undefined): number {
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function ImagesTab(): JSX.Element {
  const navigate = useNavigate();
  const { animeId: rawId } = useParams<{ animeId: string }>();
  const animeId = parseAnimeId(rawId);

  const detailQuery = useAnimeDetail(animeId);
  const imagesQuery = useAnimeImages(animeId);

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

  const images = imagesQuery.data ?? [];
  const visibleIds = useMemo(() => images.map((img) => img.id), [images]);

  const selectMode = useSelectionStore((s) => s.selectMode);
  const setSelected = useSelectionStore((s) => s.setSelected);

  const [pendingIds, setPendingIds] = useState<Set<number>>(new Set());
  const selection = useImageSelection(visibleIds);

  const gridContainerRef = useRef<HTMLDivElement>(null);

  const gridSize = useUIStore((s) => s.gridSize);

  const { importImages } = useImageImport();

  const handleUpload = useCallback(async () => {
    const folderId = detailQuery.data?.folders?.[0]?.id;
    if (!folderId) return;
    const label = detailQuery.data?.anime.name ?? "Anime";
    await importImages(folderId, label, qk.anime.detail(animeId));
    await imagesQuery.refetch();
  }, [detailQuery.data, animeId, importImages, imagesQuery]);

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
    // Open the full-screen image viewer at the clicked image's position.
    const clickedIndex = images.findIndex((img) => img.id === image.id);
    if (clickedIndex < 0) return;
    // Capture the clicked element so focus can return to it on close.
    returnFocusRef.current = event.currentTarget as HTMLElement;
    setViewerIndex(clickedIndex);
    setViewerOpen(true);
  };

  const handleLongPress = useCallback(
    (image: ImageFile) => {
      useSelectionStore.getState().enterSelectMode(image.id);
    },
    [],
  );

  const handleRubberBandCommit = (
    finalIds: Set<number>,
    isAdditive: boolean,
  ) => {
    if (finalIds.size === 0) {
      setPendingIds(new Set());
      return;
    }
    if (isAdditive) {
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
  const hasImages = images.length > 0;

  return (
    <Box
      data-testid="images-tab"
      data-anime-id={animeId}
      px={{ base: "3", md: "4" }}
      py={{ base: "3", md: "4" }}
      display="flex"
      flexDirection="column"
      flex="1"
      minHeight="0"
    >
      <SelectionActionBar
        visibleIds={visibleIds}
        totalVisible={images.length}
        onEdit={() => navigate(`/images/edit?anime=${animeId}`)}
      />

      {/* Toolbar: Search + Upload */}
      <Flex
        data-testid="images-tab-toolbar"
        align="center"
        gap="3"
        py="2"
      >
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => navigate(`/search?anime=${animeId}`)}
          data-testid="images-tab-search"
          aria-label="Search images"
        >
          <Box as="span" aria-hidden="true" display="inline-flex" mr="2">
            <Search size={14} />
          </Box>
          Search
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleUpload}
          data-testid="images-tab-upload"
          aria-label="Upload images"
        >
          <Box as="span" aria-hidden="true" display="inline-flex" mr="2">
            <Upload size={14} />
          </Box>
          Upload
        </Button>
        <Box flex="1" />
        <GridSizeControl />
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
          title="No images yet"
          description="Upload images or import folders to fill this anime."
          action={null}
        />
      ) : (
        <Box
          ref={gridContainerRef}
          data-testid="images-tab-grid-container"
          position="relative"
          flex="1"
          minHeight="0"
        >
          <ImageGrid
            images={images}
            selectedIds={selection.selectedIds}
            pendingIds={pendingIds}
            selectMode={selectMode}
            onImageClick={handleImageClick}
            onLongPress={handleLongPress}
            columnWidth={gridSizeColumnWidth(gridSize)}
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

      <ImageViewerOverlay
        open={viewerOpen}
        images={images}
        currentIndex={viewerIndex}
        onIndexChange={handleViewerIndexChange}
        onClose={handleViewerClose}
        returnFocusRef={returnFocusRef}
      />
    </Box>
  );
}

export default ImagesTab;
