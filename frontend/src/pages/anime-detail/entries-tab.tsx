/**
 * EntriesTab — list/management of entries (seasons, movies, parts) for an
 * anime. Spec: ui-design.md §3.2.2.
 *
 * For Phase D2 we render the list of entries with their name, badge, airing
 * info, and per-entry image count. Clicking an entry jumps to the Images
 * tab filtered to that entry. In/line editing and the Add Entry form are
 * tracked as TODOs for a later phase so the table stays read-only here.
 */
import { Box, Button, Flex, Stack, Text } from "@chakra-ui/react";
import { ChevronRight, ListOrdered, Upload } from "lucide-react";
import { useNavigate, useParams } from "react-router";

import { EmptyState } from "../../components/shared/empty-state";
import { ErrorAlert } from "../../components/shared/error-alert";
import { RowSkeleton } from "../../components/shared/loading-skeleton";
import { useAnimeDetail } from "../../hooks/use-anime-detail";
import { ENTRY_TYPE_CONFIGS } from "../../lib/constants";
import { formatCount } from "../../lib/format";
import type { Entry } from "../../types";

function parseAnimeId(raw: string | undefined): number {
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function EntryRow({
  entry,
  animeId,
  depth,
}: {
  entry: Entry;
  animeId: number;
  depth: number;
}): JSX.Element {
  const navigate = useNavigate();
  const config = ENTRY_TYPE_CONFIGS[entry.type] ?? ENTRY_TYPE_CONFIGS.other;
  const airing = [entry.airingSeason, entry.airingYear]
    .filter(Boolean)
    .join(" ");

  return (
    <Box
      data-testid="entry-row"
      data-entry-id={entry.id}
      data-entry-type={entry.type}
      as="li"
      listStyleType="none"
    >
      <Box
        role="button"
        tabIndex={0}
        onClick={() => navigate(`/anime/${animeId}/images?entry=${entry.id}`)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            navigate(`/anime/${animeId}/images?entry=${entry.id}`);
          }
        }}
        display="flex"
        alignItems="center"
        gap="3"
        py="3"
        px="3"
        pl={`${12 + depth * 16}px`}
        borderWidth="1px"
        borderColor="border"
        borderRadius="md"
        bg="bg.surface"
        cursor="pointer"
        _hover={{ bg: "bg.surfaceAlt", borderColor: "primary" }}
        _focusVisible={{
          outline: "2px solid",
          outlineColor: "primary",
          outlineOffset: "2px",
        }}
      >
        {/* Type badge */}
        <Box
          data-testid="entry-row-badge"
          minW="28px"
          h="28px"
          px="2"
          borderRadius="md"
          bg="bg.surfaceAlt"
          color="fg.secondary"
          fontSize="xs"
          fontWeight="600"
          display="inline-flex"
          alignItems="center"
          justifyContent="center"
        >
          {config.badge}
        </Box>
        <Box flex="1" minW={0}>
          <Text fontSize="sm" fontWeight="600" color="fg" lineClamp={1}>
            {entry.name || `${config.label} ${entry.entryNumber ?? ""}`.trim()}
          </Text>
          <Flex gap="3" mt="1" fontSize="xs" color="fg.secondary">
            {airing && <Text>{airing}</Text>}
            <Text>{formatCount(entry.imageCount, "image", "images")}</Text>
          </Flex>
        </Box>
        <Box as="span" color="fg.muted" aria-hidden="true">
          <ChevronRight size={16} />
        </Box>
      </Box>
    </Box>
  );
}

export function EntriesTab(): JSX.Element {
  const { animeId: rawId } = useParams<{ animeId: string }>();
  const animeId = parseAnimeId(rawId);
  const { data, isLoading, isError, error, refetch } = useAnimeDetail(animeId);

  if (isError) {
    return (
      <Box p="4" data-testid="entries-tab">
        <ErrorAlert
          title="Could not load entries"
          message={error instanceof Error ? error.message : String(error ?? "")}
          onRetry={() => {
            void refetch();
          }}
        />
      </Box>
    );
  }

  if (isLoading) {
    return (
      <Box p="4" data-testid="entries-tab-loading">
        <Stack gap="2">
          <RowSkeleton />
          <RowSkeleton />
          <RowSkeleton />
        </Stack>
      </Box>
    );
  }

  const entries = data?.entries ?? [];

  if (entries.length === 0) {
    return (
      <Box p="4" data-testid="entries-tab">
        <EmptyState
          icon={ListOrdered}
          title="No entries yet"
          description="Add a season, movie, or other entry to organise this anime's images."
          action={
            <Button type="button" size="sm" variant="solid">
              <Box as="span" aria-hidden="true" display="inline-flex" mr="2">
                <Upload size={14} />
              </Box>
              Add entry
            </Button>
          }
        />
      </Box>
    );
  }

  return (
    <Box p={{ base: "3", md: "4" }} data-testid="entries-tab">
      <Stack as="ul" role="list" gap="2">
        {entries.map((entry) => (
          <Box key={entry.id}>
            <EntryRow entry={entry} animeId={animeId} depth={0} />
            {entry.children && entry.children.length > 0 ? (
              <Stack as="ul" role="list" gap="2" mt="2">
                {entry.children.map((child) => (
                  <EntryRow
                    key={child.id}
                    entry={child}
                    animeId={animeId}
                    depth={1}
                  />
                ))}
              </Stack>
            ) : null}
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

export default EntriesTab;
