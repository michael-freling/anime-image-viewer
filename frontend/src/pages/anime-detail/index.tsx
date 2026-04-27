/**
 * AnimeDetailLayout — the shell for the /anime/:animeId page.
 *
 * Spec: ui-design.md §3.2 "Anime Detail (Tabbed Page)", frontend-design.md §3
 * (nested route tree under /anime/:animeId). The shell owns the header + tab
 * bar and renders the active tab inside `<Outlet />`.
 *
 * Data fetching for the shared shell (anime detail metadata) happens here so
 * every tab can read it from the React Query cache without re-fetching. Tabs
 * with their own datasets (images, tags) call their specific hooks.
 */
import { Box } from "@chakra-ui/react";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { Outlet, useParams } from "react-router";

import { ErrorAlert } from "../../components/shared/error-alert";
import { useAnimeDetail } from "../../hooks/use-anime-detail";
import { BatchImportImageService } from "../../lib/api";
import { qk } from "../../lib/query-keys";

import { AnimeDetailHeader } from "./header";
import { AnimeDetailTabBar } from "./tab-bar";

function parseAnimeId(raw: string | undefined): number {
  if (!raw) return NaN;
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
}

export function AnimeDetailLayout(): JSX.Element {
  const { animeId: rawId } = useParams<{ animeId: string }>();
  const animeId = parseAnimeId(rawId);
  const validId = Number.isFinite(animeId) && animeId > 0;

  const queryClient = useQueryClient();

  // Keep the detail query enabled for any positive integer; the hook guards
  // against invalid ids internally but we also render a plain error alert
  // for obviously bad URLs so the page never renders a broken header.
  const { data, isError, error, refetch } = useAnimeDetail(
    validId ? animeId : 0,
  );

  const rootFolder = data?.folders?.[0];

  const handleUpload = useCallback(async () => {
    if (!rootFolder) return;
    try {
      await BatchImportImageService.ImportImages(rootFolder.id);
      await queryClient.invalidateQueries({ queryKey: qk.anime.detail(animeId) });
    } catch {
      // ImportImages opens a native file dialog; if the user cancels, it throws
    }
  }, [rootFolder, animeId, queryClient]);

  if (!validId) {
    return (
      <Box p="6" data-testid="anime-detail-invalid-id">
        <ErrorAlert
          title="Invalid anime"
          message={`"${String(rawId)}" is not a valid anime id.`}
        />
      </Box>
    );
  }

  const entryCount = data?.entries?.length ?? 0;

  return (
    <Box
      data-testid="anime-detail-layout"
      data-anime-id={animeId}
      display="flex"
      flexDirection="column"
      overflow="hidden"
      css={{
        // Definite height so flex: 1 children get real space for
        // AutoSizer to measure. The grid scrolls internally.
        height: "100vh",
        "@media (max-width: 639px)": {
          // Account for the fixed bottom tab bar on mobile.
          height: "calc(100vh - 72px)",
        },
      }}
    >
      <AnimeDetailHeader
        detail={data}
        totalImages={0}
        entryCount={entryCount}
        onUpload={rootFolder ? handleUpload : undefined}
      />
      <AnimeDetailTabBar />

      {isError ? (
        <Box p="4">
          <ErrorAlert
            title="Could not load anime"
            message={
              error instanceof Error ? error.message : String(error ?? "")
            }
            onRetry={() => {
              void refetch();
            }}
          />
        </Box>
      ) : null}

      <Box
        as="section"
        data-testid="anime-detail-tab-panel"
        flex="1"
        minHeight="0"
        display="flex"
        flexDirection="column"
        overflow="auto"
        role="tabpanel"
      >
        <Outlet />
      </Box>
    </Box>
  );
}

export default AnimeDetailLayout;
