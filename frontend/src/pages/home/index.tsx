/**
 * HomePage — AnimeVault's landing screen.
 *
 * Spec: ui-design.md §3.1 (Home) and the accompanying wireframes
 * `01-home-desktop.svg` / `01-home-mobile.svg`.
 *   - Sticky PageHeader with "AnimeVault" title and a "+ New anime" action.
 *   - SearchBar below the header filters the visible cards by name
 *     (client-side substring match — the backend list is small, ~1k at most,
 *     and the search page covers full-library queries).
 *   - Responsive CSS grid of AnimeCards (2/3/5/6 columns by viewport).
 *   - Trailing NewAnimeCard opens the import-folders dialog via a
 *     `?create=1` query parameter (so the URL is shareable / back-button
 *     friendly).
 *   - Loading state: skeleton placeholders inside the grid (at least 10).
 *   - Empty state: EmptyState with a call-to-action to import.
 *   - Error state: ErrorAlert with retry (refetch).
 *   - ImportProgressBar mounts at the bottom while any import is running.
 *
 * Phase D1 scope — see frontend-design.md §2 (pages/home directory).
 */
import { Box, Button, Stack } from "@chakra-ui/react";
import { Plus, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { PageHeader } from "../../components/layout/page-header";
import { NewAnimeCard } from "../../components/shared/anime-card";
import { EmptyState } from "../../components/shared/empty-state";
import { ErrorAlert } from "../../components/shared/error-alert";
import { ImportProgressBar } from "../../components/shared/import-progress-bar";
import { SearchBar } from "../../components/shared/search-bar";
import { formatCount } from "../../lib/format";
import { useAnimeList } from "../../hooks/use-anime-list";
import type { AnimeSummary } from "../../types";
import { AnimeGrid } from "./anime-grid";
import { HomeImportDialog } from "./import-dialog";

const CREATE_PARAM = "create";
const SKELETON_COUNT = 10;

/** Case-insensitive substring filter. Empty query returns the full list. */
function filterAnime(items: AnimeSummary[], query: string): AnimeSummary[] {
  const trimmed = query.trim().toLowerCase();
  if (trimmed === "") return items;
  return items.filter((a) => a.name.toLowerCase().includes(trimmed));
}

export function HomePage(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const animeListQuery = useAnimeList();

  const [search, setSearch] = useState("");
  const isCreateOpen = searchParams.get(CREATE_PARAM) === "1";

  const items = animeListQuery.data ?? [];
  const filteredItems = useMemo(() => filterAnime(items, search), [items, search]);

  const openImportDialog = () => {
    const next = new URLSearchParams(searchParams);
    next.set(CREATE_PARAM, "1");
    setSearchParams(next, { replace: false });
  };

  const closeImportDialog = () => {
    const next = new URLSearchParams(searchParams);
    next.delete(CREATE_PARAM);
    setSearchParams(next, { replace: true });
  };

  const handleCardClick = (animeId: number) => {
    navigate(`/anime/${animeId}`);
  };

  const totalImages = items.reduce((sum, a) => sum + a.imageCount, 0);
  const subtitle =
    items.length > 0
      ? `${formatCount(items.length, "anime", "anime")} · ${formatCount(totalImages, "image")}`
      : undefined;

  // Visible grid body varies by (isLoading, isError, items.length).
  let body: JSX.Element;
  if (animeListQuery.isLoading) {
    body = <AnimeGrid items={[]} skeletonCount={SKELETON_COUNT} />;
  } else if (animeListQuery.isError) {
    body = (
      <Box px={{ base: "4", md: "6" }} pb="8">
        <ErrorAlert
          title="Couldn't load anime"
          message={
            animeListQuery.error instanceof Error
              ? animeListQuery.error.message
              : "Unknown error"
          }
          onRetry={() => {
            animeListQuery.refetch();
          }}
        />
      </Box>
    );
  } else if (items.length === 0) {
    // Empty library — render the marketing-style empty state, no card grid.
    body = (
      <Box px={{ base: "4", md: "6" }} py="8">
        <EmptyState
          icon={Sparkles}
          title="No anime yet"
          description="Import your first folder to start organising your library."
          action={
            <Button
              type="button"
              size="sm"
              bg="primary"
              color="bg.surface"
              _hover={{ bg: "primary.hover" }}
              onClick={openImportDialog}
              data-testid="empty-state-import"
            >
              Import your first folder
            </Button>
          }
        />
      </Box>
    );
  } else if (filteredItems.length === 0) {
    // The full library is non-empty but the search filter matches nothing.
    body = (
      <Box px={{ base: "4", md: "6" }} py="8">
        <EmptyState
          title="No matches"
          description={`Nothing matches "${search.trim()}". Try a different search or clear the filter.`}
        />
      </Box>
    );
  } else {
    body = (
      <AnimeGrid
        items={filteredItems}
        onCardClick={handleCardClick}
        trailing={
          <NewAnimeCard onClick={openImportDialog} label="New anime" />
        }
      />
    );
  }

  return (
    <Box
      data-testid="home-page"
      position="relative"
      minHeight="100%"
    >
      <PageHeader
        title="AnimeVault"
        subtitle={subtitle}
        actions={
          <Button
            type="button"
            size="sm"
            bg="primary"
            color="bg.surface"
            _hover={{ bg: "primary.hover" }}
            onClick={openImportDialog}
            data-testid="home-new-anime"
          >
            <Plus size={16} aria-hidden="true" />
            New anime
          </Button>
        }
      />

      <Stack gap="4" pt="4">
        <Box px={{ base: "4", md: "6" }}>
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search anime"
            size="md"
          />
        </Box>
        {body}
      </Stack>

      <ImportProgressBar />
      <HomeImportDialog open={isCreateOpen} onClose={closeImportDialog} />
    </Box>
  );
}

// Re-export the atoms so tests / peer pages can import them via the page
// namespace without needing to reach into the sub-files.
export { AnimeGrid } from "./anime-grid";
export { HomeImportDialog } from "./import-dialog";

// A named import (`import { HomePage } from "./pages/home"`) is the canonical
// entry point, but also export as default so `React.lazy` can consume the
// module if we introduce route-level code splitting later.
export default HomePage;
