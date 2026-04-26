/**
 * Tag picker surface rendered below the hero search bar.
 *
 * Spec: ui-design.md §3.4 (search inline filters) + §3.5 tag management
 * grouping. We bucket the global tag list by category (scene / nature /
 * location / mood / uncategorized) using `tagCategoryKey` and render each
 * group inside a `CategorySection`. Each tag inside a group is a `TagChip`
 * whose `active` flag mirrors the include set. Clicking a chip:
 *
 *   - If unset: adds it to `includeIds`
 *   - If already in includes: removes it (toggle off)
 *   - If in excludes: leaves exclusion alone (caller can clear the chip
 *     from the active filter bar instead)
 *
 * This keeps the picker's click semantics mirror-image to the chip body
 * (a single click toggles inclusion) while the X on the active filter row
 * is the canonical "remove" affordance.
 */
import { Box, Flex, Text } from "@chakra-ui/react";
import { useMemo } from "react";

import { CategorySection } from "../../components/shared/category-section";
import { TagChip } from "../../components/shared/tag-chip";
import {
  TAG_CATEGORY_ORDER,
  TAG_CATEGORY_TOKENS,
  tagCategoryKey,
} from "../../lib/constants";
import type { Tag, TagCategoryKey } from "../../types";

const CATEGORY_LABELS: Record<TagCategoryKey, string> = {
  scene: "Scene / Action",
  nature: "Nature / Weather",
  location: "Location",
  mood: "Mood / Genre",
  character: "Character",
  uncategorized: "Uncategorized",
};

export interface TagPickerProps {
  tags: readonly Tag[];
  /** Ids currently in the include set — rendered as "active" chips. */
  includedIds: readonly number[];
  /** Ids currently in the exclude set — rendered muted to avoid confusion. */
  excludedIds: readonly number[];
  /** Fires when a chip body is clicked (add / remove from include set). */
  onToggleInclude: (id: number) => void;
}

interface TagBucket {
  key: TagCategoryKey;
  label: string;
  tags: Tag[];
}

function bucketTags(tags: readonly Tag[]): TagBucket[] {
  const buckets = new Map<TagCategoryKey, Tag[]>();
  for (const key of TAG_CATEGORY_ORDER) buckets.set(key, []);
  for (const tag of tags) {
    const key = tagCategoryKey(tag.category);
    const list = buckets.get(key);
    if (list) list.push(tag);
  }
  // Preserve the spec order from TAG_CATEGORY_ORDER and drop empty buckets.
  const result: TagBucket[] = [];
  for (const key of TAG_CATEGORY_ORDER) {
    const list = buckets.get(key) ?? [];
    if (list.length === 0) continue;
    // Alphabetical inside a bucket so the picker is scannable regardless of
    // backend order.
    list.sort((a, b) => a.name.localeCompare(b.name));
    result.push({ key, label: CATEGORY_LABELS[key], tags: list });
  }
  return result;
}

export function TagPicker({
  tags,
  includedIds,
  excludedIds,
  onToggleInclude,
}: TagPickerProps): JSX.Element {
  const buckets = useMemo(() => bucketTags(tags), [tags]);
  const includeSet = useMemo(() => new Set(includedIds), [includedIds]);
  const excludeSet = useMemo(() => new Set(excludedIds), [excludedIds]);

  if (buckets.length === 0) {
    return (
      <Box
        data-testid="tag-picker-empty"
        px={{ base: "4", md: "6" }}
        py="6"
        color="fg.muted"
        fontSize="sm"
      >
        No tags yet. Create tags from the Tags page to filter your library.
      </Box>
    );
  }

  return (
    <Box
      data-testid="tag-picker"
      px={{ base: "4", md: "6" }}
      py="4"
    >
      <Text
        as="h2"
        fontSize="sm"
        fontWeight="600"
        color="fg.secondary"
        mb="3"
      >
        Filter by tag
      </Text>
      <Flex direction="column" gap="2">
        {buckets.map((bucket) => (
          <CategorySection
            key={bucket.key}
            defaultOpen={false}
            category={{
              key: bucket.key,
              label: bucket.label,
              tagCount: bucket.tags.length,
              color: TAG_CATEGORY_TOKENS[bucket.key].fg,
            }}
          >
            <Flex wrap="wrap" gap="2" data-testid={`tag-picker-${bucket.key}`}>
              {bucket.tags.map((tag) => {
                const isIncluded = includeSet.has(tag.id);
                const isExcluded = excludeSet.has(tag.id);
                return (
                  <TagChip
                    key={tag.id}
                    tag={tag}
                    active={isIncluded}
                    label={
                      isExcluded ? `${tag.name} (excluded)` : undefined
                    }
                    onClick={() => onToggleInclude(tag.id)}
                  />
                );
              })}
            </Flex>
          </CategorySection>
        ))}
      </Flex>
    </Box>
  );
}

export default TagPicker;
