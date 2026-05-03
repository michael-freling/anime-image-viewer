/**
 * Season picker surface rendered in the search filter panel when an anime
 * is selected. Displays the anime's seasons as a tree structure with
 * indented children. Clicking a season narrows results to that folder.
 *
 * "All" is the default state (no season filter); clicking a specific season
 * sets the season URL param and filters results to that folder.
 */
import { Box, Flex, Text } from "@chakra-ui/react";
import { useMemo } from "react";

import type { Season } from "../../types";

export interface SeasonPickerProps {
  seasons: readonly Season[];
  /** Currently selected season id; null means "All". */
  selectedSeasonId: number | null;
  /** Called when the user picks a season (or null for "All"). */
  onSelectSeason: (seasonId: number | null) => void;
}

interface FlatSeasonItem {
  id: number;
  name: string;
  imageCount: number;
  depth: number;
}

function flattenSeasons(
  seasons: readonly Season[],
  depth: number = 0,
): FlatSeasonItem[] {
  const result: FlatSeasonItem[] = [];
  for (const season of seasons) {
    result.push({
      id: season.id,
      name: season.name,
      imageCount: season.imageCount,
      depth,
    });
    if (season.children.length > 0) {
      result.push(...flattenSeasons(season.children, depth + 1));
    }
  }
  return result;
}

export function SeasonPicker({
  seasons,
  selectedSeasonId,
  onSelectSeason,
}: SeasonPickerProps): JSX.Element {
  const flatItems = useMemo(() => flattenSeasons(seasons), [seasons]);

  return (
    <Box data-testid="season-picker" py="3">
      <Box mb="3">
        <Text
          as="h2"
          fontSize="sm"
          fontWeight="600"
          color="fg.secondary"
        >
          Filter by season
        </Text>
      </Box>
      <Flex direction="column" gap="1" data-testid="season-picker-list">
        {/* "All" option */}
        <Box
          role="button"
          tabIndex={0}
          data-testid="season-picker-all"
          onClick={() => onSelectSeason(null)}
          px="3"
          py="1.5"
          borderRadius="md"
          textAlign="left"
          fontSize="sm"
          fontWeight={selectedSeasonId == null ? "600" : "400"}
          bg={selectedSeasonId == null ? "bg.emphasized" : "transparent"}
          color={selectedSeasonId == null ? "fg" : "fg.secondary"}
          _hover={{ bg: "bg.subtle" }}
          cursor="pointer"
          width="100%"
        >
          All seasons
        </Box>
        {flatItems.map((item) => (
          <Box
            key={item.id}
            role="button"
            tabIndex={0}
            data-testid={`season-picker-item-${item.id}`}
            onClick={() => onSelectSeason(item.id)}
            pl={`${(item.depth + 1) * 12 + 12}px`}
            pr="3"
            py="1.5"
            borderRadius="md"
            textAlign="left"
            fontSize="sm"
            fontWeight={selectedSeasonId === item.id ? "600" : "400"}
            bg={selectedSeasonId === item.id ? "bg.emphasized" : "transparent"}
            color={selectedSeasonId === item.id ? "fg" : "fg.secondary"}
            _hover={{ bg: "bg.subtle" }}
            cursor="pointer"
            width="100%"
          >
            <Flex justify="space-between" align="center">
              <Text truncate>{item.name}</Text>
              <Text fontSize="xs" color="fg.muted" ml="2">
                {item.imageCount}
              </Text>
            </Flex>
          </Box>
        ))}
      </Flex>
    </Box>
  );
}

export default SeasonPicker;
