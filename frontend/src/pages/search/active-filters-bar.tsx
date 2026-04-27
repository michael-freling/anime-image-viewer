/**
 * Inline chip row shown under the Search hero bar.
 *
 * Spec: ui-design.md §3.4 + wireframe `04-search-desktop.svg`. One
 * FilterChip renders per included / excluded tag id. Each chip's X button
 * removes the tag from the active set; clicking the chip body cycles the
 * variant (include -> exclude -> unset) via `onCycle`. When no tag filters
 * are active the bar renders nothing — the hero bar already supplies the
 * visual separator.
 *
 * The bar also surfaces a "Clear all" link when any filter is active (per
 * the wireframe's top-right `Clear all` affordance). The clear link is only
 * visible once there's at least one chip so an empty filter state isn't
 * cluttered with actions.
 */
import { Box, Button, Flex, Text } from "@chakra-ui/react";

import { FilterChip } from "../../components/shared/filter-chip";
import type { Tag } from "../../types";
import type { SearchFilterState } from "./filter-state";

export interface ActiveFiltersBarProps {
  state: SearchFilterState;
  /** Look-up of tag ids to rich Tag records for chip labels. */
  tagMap?: Map<number, Tag>;
  /** Look-up of character ids to character records for chip labels. */
  characterMap?: Map<number, { id: number; name: string }>;
  /** Name of the anime filter when `state.animeId` is set. */
  animeName?: string;
  /** Fires when the anime filter chip is removed. */
  onRemoveAnime?: () => void;
  /** Fires when a tag chip's X button is clicked. */
  onRemove: (id: number) => void;
  /** Fires when a character chip's X button is clicked. */
  onRemoveCharacter?: (id: number) => void;
  /** Fires on the "Clear all" link. */
  onClearAll: () => void;
  /**
   * Optional total-count label like "128 images". The bar renders it on the
   * left when present so callers don't need a separate header row.
   */
  totalLabel?: string;
}

export function ActiveFiltersBar({
  state,
  tagMap,
  characterMap,
  animeName,
  onRemoveAnime,
  onRemove,
  onRemoveCharacter,
  onClearAll,
  totalLabel,
}: ActiveFiltersBarProps): JSX.Element | null {
  const hasTagFilters =
    state.includeIds.length > 0 || state.excludeIds.length > 0;
  const hasCharacterFilters =
    state.includeCharacterIds.length > 0 || state.excludeCharacterIds.length > 0;
  const hasQuery = state.query.trim().length > 0;
  const hasAnimeFilter = state.animeId != null;

  if (!hasTagFilters && !hasCharacterFilters && !hasQuery && !hasAnimeFilter && !totalLabel) {
    // Nothing to render — keep the page surface clean.
    return null;
  }

  const resolveLabel = (id: number): string => {
    const tag = tagMap?.get(id);
    if (tag) return tag.name;
    // Fall back to the id so a stale URL param still renders something
    // obviously removable by the user.
    return `#${id}`;
  };

  return (
    <Box
      data-testid="active-filters-bar"
      px={{ base: "4", md: "6" }}
      py="3"
      borderBottomWidth="1px"
      borderBottomColor="border"
      bg="bg.surface"
    >
      <Flex
        align="center"
        justify="space-between"
        gap="3"
        wrap="wrap"
      >
        <Flex align="center" gap="2" wrap="wrap" flex="1" minW={0}>
          {totalLabel && (
            <Text
              data-testid="active-filters-total"
              fontSize="sm"
              color="fg.secondary"
              fontWeight="500"
            >
              {totalLabel}
            </Text>
          )}
          {hasAnimeFilter && onRemoveAnime && (
            <FilterChip
              key="anime-filter"
              label={animeName ?? `Anime #${state.animeId}`}
              variant="include"
              onRemove={onRemoveAnime}
            />
          )}
          {state.includeIds.map((id) => (
            <FilterChip
              key={`inc-${id}`}
              label={resolveLabel(id)}
              variant="include"
              onRemove={() => onRemove(id)}
            />
          ))}
          {state.excludeIds.map((id) => (
            <FilterChip
              key={`exc-${id}`}
              label={resolveLabel(id)}
              variant="exclude"
              onRemove={() => onRemove(id)}
            />
          ))}
          {state.includeCharacterIds.map((id) => (
            <FilterChip
              key={`char-inc-${id}`}
              label={characterMap?.get(id)?.name ?? `Character #${id}`}
              variant="include"
              onRemove={() => onRemoveCharacter?.(id)}
            />
          ))}
          {state.excludeCharacterIds.map((id) => (
            <FilterChip
              key={`char-exc-${id}`}
              label={characterMap?.get(id)?.name ?? `Character #${id}`}
              variant="exclude"
              onRemove={() => onRemoveCharacter?.(id)}
            />
          ))}
        </Flex>

        {(hasTagFilters || hasCharacterFilters || hasQuery || hasAnimeFilter) && (
          <Button
            type="button"
            data-testid="active-filters-clear-all"
            onClick={onClearAll}
            size="sm"
            variant="ghost"
            color="primary"
            fontSize="sm"
            fontWeight="500"
          >
            Clear all
          </Button>
        )}
      </Flex>
    </Box>
  );
}

export default ActiveFiltersBar;
