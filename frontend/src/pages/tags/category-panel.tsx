/**
 * Category panel for the Tag Management page.
 *
 * Wraps the shared `CategorySection` primitive and adds the tag-grid body:
 *   - When the category has tags, render them in a wrap-flex of `TagRow`s.
 *   - When empty, render a small "No tags yet" message with an inline button
 *     that opens the create-tag dialog pre-seeded with this category.
 *
 * The panel delegates all side-effects (open dialogs, delete confirmation)
 * to the parent via callback props so tests can drive it without the
 * surrounding React Query plumbing.
 */
import { Box, Button, Flex, Text } from "@chakra-ui/react";
import { Plus } from "lucide-react";

import { CategorySection } from "../../components/shared/category-section";
import { TAG_CATEGORY_TOKENS } from "../../lib/constants";
import type { Tag, TagCategoryKey } from "../../types";

import { CATEGORY_LABELS } from "./tag-form";
import { TagRow } from "./tag-row";

export interface CategoryPanelProps {
  categoryKey: TagCategoryKey;
  tags: Tag[];
  usageByTagId: Map<number, number>;
  defaultOpen?: boolean;
  onAddInCategory: (key: TagCategoryKey) => void;
  onEditTag: (tag: Tag) => void;
  onDeleteTag: (tag: Tag) => void;
}

export function CategoryPanel({
  categoryKey,
  tags,
  usageByTagId,
  defaultOpen = true,
  onAddInCategory,
  onEditTag,
  onDeleteTag,
}: CategoryPanelProps): JSX.Element {
  const label = CATEGORY_LABELS[categoryKey];
  const color = TAG_CATEGORY_TOKENS[categoryKey].fg;

  return (
    <CategorySection
      category={{
        key: categoryKey,
        label,
        tagCount: tags.length,
        color,
      }}
      defaultOpen={defaultOpen}
    >
      {tags.length === 0 ? (
        <Box
          data-testid="category-panel-empty"
          data-category-key={categoryKey}
          display="flex"
          alignItems="center"
          justifyContent="space-between"
          gap="2"
          py="2"
          px="1"
        >
          <Text fontSize="sm" color="fg.secondary">
            No tags in this category yet.
          </Text>
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() => onAddInCategory(categoryKey)}
            data-testid="category-panel-add"
          >
            <Plus size={12} aria-hidden="true" />
            Add tag
          </Button>
        </Box>
      ) : (
        <Flex
          data-testid="category-panel-grid"
          data-category-key={categoryKey}
          gap="2"
          flexWrap="wrap"
        >
          {tags.map((tag) => (
            <TagRow
              key={tag.id}
              tag={tag}
              usageCount={usageByTagId.get(tag.id) ?? null}
              onEdit={onEditTag}
              onDelete={onDeleteTag}
            />
          ))}
        </Flex>
      )}
    </CategorySection>
  );
}

export default CategoryPanel;
