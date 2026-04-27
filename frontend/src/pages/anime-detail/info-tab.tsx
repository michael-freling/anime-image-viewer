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
import { Box, Button, Flex, Stack, Text } from "@chakra-ui/react";
import { useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";

import { ErrorAlert } from "../../components/shared/error-alert";
import { RowSkeleton } from "../../components/shared/loading-skeleton";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { toast } from "../../components/ui/toaster";
import { useAnimeDetail } from "../../hooks/use-anime-detail";
import { AnimeService } from "../../lib/api";
import { formatCount } from "../../lib/format";
import { qk } from "../../lib/query-keys";

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
  const entryCount = data.entries.length;
  const totalImages = data.entries.reduce((total, entry) => {
    const childSum = (entry.children ?? []).reduce(
      (cs, c) => cs + (c.imageCount ?? 0),
      0,
    );
    return total + (entry.imageCount ?? 0) + childSum;
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
              <Flex gap="2" align="center">
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
                  <Box
                    as="span"
                    aria-hidden="true"
                    display="inline-flex"
                    mr="2"
                  >
                    <ExternalLink size={12} />
                  </Box>
                  Open in AniList
                </Button>
              </Flex>
            ) : (
              <Text color="fg.muted">Not linked</Text>
            )
          }
        />

        <Flex gap="4" wrap="wrap">
          <InfoField
            label="Entries"
            value={formatCount(entryCount, "entry", "entries")}
            testId="info-field-entries"
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
            Deleting this anime removes all of its entries and associated
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
    </Box>
  );
}

export default InfoTab;
