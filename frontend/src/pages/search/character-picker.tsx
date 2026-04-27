/**
 * Character picker surface rendered below the tag picker on the search page.
 *
 * Separated from the tag picker because characters are not tags in the
 * frontend UX — they have their own dedicated section. The click-cycle
 * behavior (unset → include → exclude → unset) is identical to tag chips.
 */
import { Box, Flex, Text } from "@chakra-ui/react";
import { useMemo } from "react";

import { TagChip } from "../../components/shared/tag-chip";
import type { Tag } from "../../types";

export interface CharacterPickerProps {
  characters: readonly Tag[];
  includedIds: readonly number[];
  excludedIds: readonly number[];
  onCycleCharacter: (id: number) => void;
}

export function CharacterPicker({
  characters,
  includedIds,
  excludedIds,
  onCycleCharacter,
}: CharacterPickerProps): JSX.Element {
  const includeSet = useMemo(() => new Set(includedIds), [includedIds]);
  const excludeSet = useMemo(() => new Set(excludedIds), [excludedIds]);

  const sorted = useMemo(
    () => [...characters].sort((a, b) => a.name.localeCompare(b.name)),
    [characters],
  );

  return (
    <Box
      data-testid="character-picker"
      px={{ base: "4", md: "6" }}
      py="4"
      borderTopWidth="1px"
      borderTopColor="border"
    >
      <Box mb="3">
        <Text
          as="h2"
          fontSize="sm"
          fontWeight="600"
          color="fg.secondary"
        >
          Filter by character
        </Text>
        <Text fontSize="xs" color="fg.muted" mt="0.5">
          Click to include · click again to exclude · click again to clear
        </Text>
      </Box>
      <Flex wrap="wrap" gap="2" data-testid="character-picker-chips">
        {sorted.map((char) => {
          const isIncluded = includeSet.has(char.id);
          const isExcluded = excludeSet.has(char.id);
          return (
            <TagChip
              key={char.id}
              tag={char}
              active={isIncluded}
              excluded={isExcluded}
              label={isExcluded ? `${char.name} (excluded)` : undefined}
              onClick={() => onCycleCharacter(char.id)}
            />
          );
        })}
      </Flex>
    </Box>
  );
}

export default CharacterPicker;
