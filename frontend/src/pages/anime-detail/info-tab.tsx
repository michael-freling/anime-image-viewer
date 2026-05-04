/**
 * InfoTab — anime metadata for the Anime Detail page.
 *
 * Spec: ui-design.md §3.2.5 "Info tab".
 *
 * Renders the anime's core metadata (title, AniList link, folder list, entry
 * counts, image counts) inside a centred max-width form. Danger Zone action
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
import { useAniListSearch } from "../../hooks/use-anilist-search";
import { AnimeService } from "../../lib/api";
import type { AniListImportResult, AniListSearchResult } from "../../lib/api";
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
  const [aniListDialogOpen, setAniListDialogOpen] = useState(false);
  const [aniListQuery, setAniListQuery] = useState("");
  const [aniListImporting, setAniListImporting] = useState(false);
  const aniListSearch = useAniListSearch(aniListQuery);

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
          label="AniList"
          testId="info-field-anilist"
          value={
            aniListUrl ? (
              <Flex gap="2" align="center" wrap="wrap">
                <Text color="fg.secondary">#{anime.aniListId}</Text>
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
                  Open
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  data-testid="info-anilist-reimport"
                  disabled={aniListImporting}
                  loading={aniListImporting}
                  loadingText="Importing..."
                  onClick={async () => {
                    setAniListImporting(true);
                    try {
                      const result = await AnimeService.ImportFromAniList(animeId, anime.aniListId!) as AniListImportResult;
                      await queryClient.invalidateQueries({ queryKey: qk.anime.detail(animeId) });
                      toast.success(
                        "AniList import complete",
                        `Created ${result.seasonsCreated} season(s), ${result.charactersCreated} character(s).`,
                      );
                    } catch (err) {
                      toast.error("Import failed", err instanceof Error ? err.message : String(err));
                    } finally {
                      setAniListImporting(false);
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
                  data-testid="info-anilist-change"
                  disabled={aniListImporting}
                  onClick={() => {
                    setAniListQuery(anime.name);
                    setAniListDialogOpen(true);
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
                  data-testid="info-anilist-link-btn"
                  disabled={aniListImporting}
                  onClick={() => {
                    setAniListQuery(anime.name);
                    setAniListDialogOpen(true);
                  }}
                >
                  <Box as="span" aria-hidden="true" display="inline-flex" mr="1">
                    <LinkIcon size={12} />
                  </Box>
                  Link AniList
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

      <AniListSearchDialog
        open={aniListDialogOpen}
        onClose={() => {
          setAniListDialogOpen(false);
          setAniListQuery("");
        }}
        query={aniListQuery}
        onQueryChange={setAniListQuery}
        results={aniListSearch.data ?? []}
        loading={aniListSearch.isLoading}
        importing={aniListImporting}
        onSelect={async (result: AniListSearchResult) => {
          setAniListImporting(true);
          try {
            const importResult = await AnimeService.ImportFromAniList(animeId, result.id) as AniListImportResult;
            await queryClient.invalidateQueries({ queryKey: qk.anime.detail(animeId) });
            toast.success(
              "AniList linked",
              `Created ${importResult.seasonsCreated} season(s), ${importResult.charactersCreated} character(s).`,
            );
            setAniListDialogOpen(false);
            setAniListQuery("");
          } catch (err) {
            toast.error("Import failed", err instanceof Error ? err.message : String(err));
          } finally {
            setAniListImporting(false);
          }
        }}
      />
    </Box>
  );
}

function AniListSearchDialog({
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
  results: AniListSearchResult[];
  loading: boolean;
  importing: boolean;
  onSelect: (result: AniListSearchResult) => void;
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
            data-testid="anilist-search-dialog"
            bg="bg.surface"
            color="fg"
            borderRadius="lg"
            borderWidth="1px"
            borderColor="border"
            maxWidth="520px"
          >
            <Dialog.Header px="5" pt="4">
              <Dialog.Title fontSize="md" fontWeight="600">
                Link AniList
              </Dialog.Title>
            </Dialog.Header>
            <Dialog.Body px="5" py="2">
              <Stack gap="3">
                <ChakraInput
                  data-testid="anilist-search-input"
                  type="text"
                  value={query}
                  onChange={(e) => onQueryChange(e.target.value)}
                  disabled={importing}
                  placeholder="Search AniList..."
                  aria-label="Search AniList"
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
                    data-testid="anilist-search-results"
                    borderWidth="1px"
                    borderColor="border"
                    borderRadius="md"
                    maxHeight="240px"
                    overflowY="auto"
                  >
                    {results.map((result) => (
                      <Box
                        key={result.id}
                        data-testid="anilist-search-result-item"
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
                        <Box fontWeight="500">
                          {result.titleRomaji || result.titleEnglish}
                        </Box>
                        {result.titleEnglish && result.titleEnglish !== result.titleRomaji && (
                          <Box fontSize="xs" opacity={0.6}>{result.titleEnglish}</Box>
                        )}
                        <Box fontSize="xs" opacity={0.6}>
                          ID: {result.id}
                          {result.format ? ` · ${result.format}` : ""}
                          {result.seasonYear ? ` · ${result.seasonYear}` : ""}
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
