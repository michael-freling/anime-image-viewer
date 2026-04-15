/**
 * CharactersTab — grid of AniList-linked characters for this anime.
 *
 * Spec: ui-design.md §3.2.3 "Characters tab".
 *
 * NOTE ON DATA SOURCE: the backend does not yet expose a first-class
 * `AnimeService.GetAnimeCharacters(animeId)` endpoint. Until one lands we
 * render an informational empty state with an "Add character" action so the
 * surface ships and testability stays sharp. Reads live behind a safe
 * default (empty list) so renders stay side-effect free.
 */
import { Box, Button, Flex, SimpleGrid, Text } from "@chakra-ui/react";
import { Film, UserPlus } from "lucide-react";
import { useState } from "react";

import { EmptyState } from "../../components/shared/empty-state";
import { SearchBar } from "../../components/shared/search-bar";
import type { Character } from "../../types";

export interface CharactersTabProps {
  /** Optional override used by tests; defaults to an empty list. */
  characters?: Character[];
}

function CharacterCard({ character }: { character: Character }): JSX.Element {
  return (
    <Box
      data-testid="character-card"
      data-character-id={character.id}
      borderWidth="1px"
      borderColor="border"
      borderRadius="md"
      overflow="hidden"
      bg="bg.surface"
      display="flex"
      flexDirection="column"
    >
      <Box
        aspectRatio="1 / 1"
        bg="bg.surfaceAlt"
        color="fg.muted"
        display="flex"
        alignItems="center"
        justifyContent="center"
      >
        <Film size={32} aria-hidden="true" />
      </Box>
      <Box p="3">
        <Text fontSize="sm" fontWeight="600" color="fg" lineClamp={1}>
          {character.name}
        </Text>
        <Text fontSize="xs" color="fg.secondary" mt="1">
          {character.role || "Character"}
        </Text>
        <Text fontSize="xs" color="fg.muted" mt="1">
          {character.imageCount} image{character.imageCount === 1 ? "" : "s"}
        </Text>
      </Box>
    </Box>
  );
}

export function CharactersTab({
  characters = [],
}: CharactersTabProps = {}): JSX.Element {
  const [filter, setFilter] = useState("");

  const filtered =
    filter.trim().length === 0
      ? characters
      : characters.filter((c) =>
          c.name.toLowerCase().includes(filter.trim().toLowerCase()),
        );

  if (characters.length === 0) {
    return (
      <Box p="4" data-testid="characters-tab">
        <EmptyState
          icon={Film}
          title="No characters linked yet"
          description="Link this anime to AniList or manually add characters to populate this tab."
          action={
            <Button
              type="button"
              size="sm"
              variant="solid"
              data-testid="characters-tab-add-action"
            >
              <Box as="span" aria-hidden="true" display="inline-flex" mr="2">
                <UserPlus size={14} />
              </Box>
              Add character
            </Button>
          }
        />
      </Box>
    );
  }

  return (
    <Box data-testid="characters-tab" p={{ base: "3", md: "4" }}>
      <Flex gap="3" mb="4" direction={{ base: "column", md: "row" }}>
        <Box flex="1">
          <SearchBar
            value={filter}
            onChange={setFilter}
            placeholder="Search characters"
            size="md"
          />
        </Box>
        <Button
          type="button"
          size="sm"
          variant="solid"
          data-testid="characters-tab-add-action"
        >
          <Box as="span" aria-hidden="true" display="inline-flex" mr="2">
            <UserPlus size={14} />
          </Box>
          Add character
        </Button>
      </Flex>
      <SimpleGrid
        columns={{ base: 2, sm: 3, md: 4, lg: 5 }}
        gap="3"
        data-testid="characters-grid"
      >
        {filtered.map((character) => (
          <CharacterCard key={character.id} character={character} />
        ))}
      </SimpleGrid>
    </Box>
  );
}

export default CharactersTab;
