/**
 * InfoTab — anime metadata for the Anime Detail page.
 *
 * Spec: ui-design.md §3.2.5 "Info tab".
 *
 * Renders the anime's core metadata (title, linked metadata-db series, folder
 * list, entry counts, image counts) inside a centred max-width form. Danger Zone action
 * (delete anime) is self-contained: ConfirmDialog → AnimeService.DeleteAnime
 * → navigate to home.
 */
import { Box, Button, Dialog, Flex, Portal, Stack, Text, chakra } from "@chakra-ui/react";
import { useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Link as LinkIcon, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";

import { ErrorAlert } from "../../components/shared/error-alert";
import { RowSkeleton } from "../../components/shared/loading-skeleton";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { toast } from "../../components/ui/toaster";
import { useAnimeDetail } from "../../hooks/use-anime-detail";
import { useMetadataSearch } from "../../hooks/use-metadata-search";
import { AnimeService } from "../../lib/api";
import type { MetadataImportResult, MetadataSearchResult } from "../../lib/api";
import { formatCount } from "../../lib/format";
import { qk } from "../../lib/query-keys";

const ChakraInput = chakra("input");

function parseAnimeId(raw: string | undefined): number {
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function InfoField({
  label,
  value,
  testId,
}: {
  label: string;
  value: React.ReactNode;
  testId?: string;
}): JSX.Element {
  return (
    <Box data-testid={testId}>
      <Text fontSize="xs" fontWeight="600" color="fg.secondary" textTransform="uppercase" letterSpacing="wide">
        {label}
      </Text>
      <Box mt="1" fontSize="sm" color="fg">
        {value}
      </Box>
    </Box>
  );
}

export function InfoTab(): JSX.Element {
  const { animeId: rawId } = useParams<{ animeId: string }>();
  const animeId = parseAnimeId(rawId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useAnimeDetail(animeId);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [seriesDialogOpen, setSeriesDialogOpen] = useState(false);
  const [seriesQuery, setSeriesQuery] = useState("");
  const [importing, setImporting] = useState(false);
  const seriesSearch = useMetadataSearch(seriesQuery);

  if (isError) {
    return (
      <Box p="4" data-testid="info-tab">
        <ErrorAlert
          title="Could not load anime info"
          message={error instanceof Error ? error.message : String(error ?? "")}
          onRetry={() => {
            void refetch();
          }}
        />
      </Box>
    );
  }

  if (isLoading || !data) {
    return (
      <Box p="4" data-testid="info-tab-loading">
        <Stack gap="2">
          <RowSkeleton />
          <RowSkeleton />
          <RowSkeleton />
        </Stack>
      </Box>
    );
  }

  const anime = data.anime;
  const seasonCount = data.seasons.length;
  const totalImages = data.seasons.reduce((total, season) => {
    const childSum = (season.children ?? []).reduce(
      (cs, c) => cs + (c.imageCount ?? 0),
      0,
    );
    return total + (season.imageCount ?? 0) + childSum;
  }, 0);
  const folderCount = data.folders.length;
  const seriesId = anime.metadataSeriesId;
  // The AniList id is stored only to offer this outbound link; the AniList API
  // is never called.
  const aniListUrl = anime.aniListId
    ? `https://anilist.co/anime/${anime.aniListId}`
    : null;

  return (
    <Box
      data-testid="info-tab"
      p={{ base: "4", md: "6" }}
      maxWidth="640px"
      mx="auto"
    >
      <Stack gap="5">
        <InfoField
          label="Title"
          value={
            <Text fontSize="lg" fontWeight="700" color="fg">
              {anime.name}
            </Text>
          }
          testId="info-field-title"
        />

        <InfoField
          label="Series"
          testId="info-field-series"
          value={
            seriesId ? (
              <Flex gap="2" align="center" wrap="wrap">
                <Text color="fg.secondary">{seriesId}</Text>
                {aniListUrl && (
                  <Button
                    as="a"
                    size="xs"
                    variant="outline"
                    data-testid="info-anilist-link"
                    {...{
                      href: aniListUrl,
                      target: "_blank",
                      rel: "noopener noreferrer",
                    }}
                  >
                    <Box as="span" aria-hidden="true" display="inline-flex" mr="1">
                      <ExternalLink size={12} />
                    </Box>
                    AniList
                  </Button>
                )}
                <Button
                  size="xs"
                  variant="outline"
                  data-testid="info-series-reimport"
                  disabled={importing}
                  loading={importing}
                  loadingText="Importing..."
                  onClick={async () => {
                    setImporting(true);
                    try {
                      const result = await AnimeService.ImportFromMetadata(animeId, seriesId) as MetadataImportResult;
                      await queryClient.invalidateQueries({ queryKey: qk.anime.detail(animeId) });
                      toast.success(
                        "Import complete",
                        `Created ${result.seasonsCreated} entry(s), ${result.charactersCreated} character(s).`,
                      );
                    } catch (err) {
                      toast.error("Import failed", err instanceof Error ? err.message : String(err));
                    } finally {
                      setImporting(false);
                    }
                  }}
                >
                  <Box as="span" aria-hidden="true" display="inline-flex" mr="1">
                    <RefreshCw size={12} />
                  </Box>
                  Re-import
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  data-testid="info-series-change"
                  disabled={importing}
                  onClick={() => {
                    setSeriesQuery(anime.name);
                    setSeriesDialogOpen(true);
                  }}
                >
                  <Box as="span" aria-hidden="true" display="inline-flex" mr="1">
                    <LinkIcon size={12} />
                  </Box>
                  Change
                </Button>
              </Flex>
            ) : (
              <Flex gap="2" align="center">
                <Text color="fg.muted">Not linked</Text>
                <Button
                  size="xs"
                  variant="outline"
                  data-testid="info-series-link-btn"
                  disabled={importing}
                  onClick={() => {
                    setSeriesQuery(anime.name);
                    setSeriesDialogOpen(true);
                  }}
                >
                  <Box as="span" aria-hidden="true" display="inline-flex" mr="1">
                    <LinkIcon size={12} />
                  </Box>
                  Link series
                </Button>
              </Flex>
            )
          }
        />

        <Flex gap="4" wrap="wrap">
          <InfoField
            label="Seasons"
            value={formatCount(seasonCount, "season", "seasons")}
            testId="info-field-seasons"
          />
          <InfoField
            label="Images"
            value={formatCount(totalImages, "image", "images")}
            testId="info-field-images"
          />
          <InfoField
            label="Source folders"
            value={formatCount(folderCount, "folder", "folders")}
            testId="info-field-folders"
          />
        </Flex>

        {/* Danger zone */}
        <Box
          mt="4"
          p="4"
          borderWidth="1px"
          borderColor="danger"
          borderRadius="md"
          bg="danger.bg"
          data-testid="info-danger-zone"
        >
          <Text fontSize="sm" fontWeight="600" color="danger">
            Danger zone
          </Text>
          <Text fontSize="sm" color="fg.secondary" mt="1">
            Deleting this anime removes all of its seasons and associated
            metadata. Image files on disk are not affected.
          </Text>
          <Button
            type="button"
            size="sm"
            mt="3"
            variant="outline"
            borderColor="danger"
            color="danger"
            onClick={() => setConfirmOpen(true)}
            data-testid="info-delete-anime"
            aria-label="Delete this anime"
          >
            <Box as="span" aria-hidden="true" display="inline-flex" mr="2">
              <Trash2 size={14} />
            </Box>
            Delete this anime
          </Button>
        </Box>
      </Stack>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={async () => {
          try {
            await AnimeService.DeleteAnime(animeId);
            await queryClient.invalidateQueries({ queryKey: qk.anime.all });
            toast.success("Anime deleted", `"${anime.name}" has been removed.`);
            navigate("/");
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            toast.error("Could not delete anime", message);
          } finally {
            setConfirmOpen(false);
          }
        }}
        title={`Delete "${anime.name}"?`}
        description="This will remove the anime, all of its entries, and associated metadata. Image files on disk are not affected."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
      />

      <SeriesSearchDialog
        open={seriesDialogOpen}
        onClose={() => {
          setSeriesDialogOpen(false);
          setSeriesQuery("");
        }}
        query={seriesQuery}
        onQueryChange={setSeriesQuery}
        results={seriesSearch.data ?? []}
        loading={seriesSearch.isLoading}
        importing={importing}
        onSelect={async (result: MetadataSearchResult) => {
          setImporting(true);
          try {
            const importResult = await AnimeService.ImportFromMetadata(animeId, result.id) as MetadataImportResult;
            await queryClient.invalidateQueries({ queryKey: qk.anime.detail(animeId) });
            toast.success(
              "Series linked",
              `Created ${importResult.seasonsCreated} entry(s), ${importResult.charactersCreated} character(s).`,
            );
            setSeriesDialogOpen(false);
            setSeriesQuery("");
          } catch (err) {
            toast.error("Import failed", err instanceof Error ? err.message : String(err));
          } finally {
            setImporting(false);
          }
        }}
      />
    </Box>
  );
}

function SeriesSearchDialog({
  open,
  onClose,
  query,
  onQueryChange,
  results,
  loading,
  importing,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  query: string;
  onQueryChange: (q: string) => void;
  results: MetadataSearchResult[];
  loading: boolean;
  importing: boolean;
  onSelect: (result: MetadataSearchResult) => void;
}): JSX.Element {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(d) => { if (!d.open && !importing) onClose(); }}
      closeOnEscape={!importing}
      closeOnInteractOutside={!importing}
    >
      <Portal>
        <Dialog.Backdrop bg="blackAlpha.600" />
        <Dialog.Positioner>
          <Dialog.Content
            data-testid="series-search-dialog"
            bg="bg.surface"
            color="fg"
            borderRadius="lg"
            borderWidth="1px"
            borderColor="border"
            maxWidth="520px"
          >
            <Dialog.Header px="5" pt="4">
              <Dialog.Title fontSize="md" fontWeight="600">
                Link series
              </Dialog.Title>
            </Dialog.Header>
            <Dialog.Body px="5" py="2">
              <Stack gap="3">
                <ChakraInput
                  data-testid="series-search-input"
                  type="text"
                  value={query}
                  onChange={(e) => onQueryChange(e.target.value)}
                  disabled={importing}
                  placeholder="Search series..."
                  aria-label="Search series"
                  width="100%"
                  height="40px"
                  px="3"
                  borderRadius="md"
                  borderWidth="1px"
                  borderColor="border"
                  bg="bg.surface"
                  color="fg"
                  fontSize="sm"
                  _focus={{
                    outline: "none",
                    borderColor: "primary",
                    boxShadow: "0 0 0 2px var(--chakra-colors-primary)",
                  }}
                />
                {loading && query.trim().length > 0 && (
                  <Text fontSize="xs" color="fg.secondary">Searching...</Text>
                )}
                {results.length > 0 && (
                  <Box
                    data-testid="series-search-results"
                    borderWidth="1px"
                    borderColor="border"
                    borderRadius="md"
                    maxHeight="240px"
                    overflowY="auto"
                  >
                    {results.map((result) => (
                      <Box
                        key={result.id}
                        data-testid="series-search-result-item"
                        px="3"
                        py="2"
                        cursor={importing ? "not-allowed" : "pointer"}
                        opacity={importing ? 0.6 : 1}
                        _hover={importing ? {} : { bg: "bg.subtle" }}
                        onClick={() => { if (!importing) onSelect(result); }}
                        fontSize="sm"
                        borderBottom="1px solid"
                        borderColor="border"
                      >
                        <Box fontWeight="500">{result.title}</Box>
                        <Box fontSize="xs" opacity={0.6}>
                          {result.id}
                          {result.franchiseId ? ` · ${result.franchiseId}` : ""}
                        </Box>
                      </Box>
                    ))}
                  </Box>
                )}
              </Stack>
            </Dialog.Body>
            <Dialog.Footer px="5" pb="4" pt="3" display="flex" justifyContent="flex-end">
              <Button
                size="sm"
                variant="outline"
                onClick={onClose}
                disabled={importing}
              >
                Cancel
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

export default InfoTab;
