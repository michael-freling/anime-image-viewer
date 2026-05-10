/**
 * GridSizeControl — segmented radio group for choosing the thumbnail grid
 * column width preset.
 *
 * Follows the same visual pattern as the theme selector in
 * `pages/settings/sections/appearance-section.tsx`.
 */
import { Box, chakra } from "@chakra-ui/react";

import { GRID_SIZE_CONFIGS, type GridSize } from "../../lib/constants";
import { useUIStore } from "../../stores/ui-store";

const ChakraButton = chakra("button");

export function GridSizeControl(): JSX.Element {
  const gridSize = useUIStore((s) => s.gridSize);
  const setGridSize = useUIStore((s) => s.setGridSize);

  return (
    <Box
      role="radiogroup"
      aria-label="Grid size"
      data-testid="grid-size-control"
      display="inline-flex"
      bg="bg.surfaceAlt"
      borderRadius="pill"
      p="1"
      gap="1"
    >
      {GRID_SIZE_CONFIGS.map((opt) => {
        const isSelected = gridSize === opt.value;
        return (
          <ChakraButton
            type="button"
            key={opt.value}
            role="radio"
            aria-checked={isSelected}
            data-testid={`grid-size-${opt.value}`}
            data-selected={isSelected ? "true" : undefined}
            onClick={() => setGridSize(opt.value as GridSize)}
            display="inline-flex"
            alignItems="center"
            px="2.5"
            py="0.5"
            borderRadius="pill"
            bg={isSelected ? "primary" : "transparent"}
            color={isSelected ? "bg.surface" : "fg.secondary"}
            fontSize="xs"
            fontWeight={isSelected ? "600" : "500"}
            cursor="pointer"
            border="none"
            transition="background-color 120ms, color 120ms"
            _hover={{
              color: isSelected ? "bg.surface" : "fg",
            }}
          >
            {opt.label}
          </ChakraButton>
        );
      })}
    </Box>
  );
}
