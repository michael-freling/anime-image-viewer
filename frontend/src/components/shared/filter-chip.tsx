/**
 * Removable filter pill shown above search/detail result grids.
 *
 * Spec: ui-design.md §3.4 (inline filter chips) and wireframe
 * `04-search-desktop.svg`. Include chips use the primary/subtle colour pair
 * and a `+` prefix; exclude chips use the danger colour pair and a `−`
 * prefix. Both expose an X button that calls `onRemove` — activating it via
 * mouse or keyboard both reach the same handler.
 */
import { Box, chakra } from "@chakra-ui/react";
import { X } from "lucide-react";

const ChakraButton = chakra("button");

export interface FilterChipProps {
  label: string;
  onRemove: () => void;
  variant?: "include" | "exclude";
}

export function FilterChip({
  label,
  onRemove,
  variant = "include",
}: FilterChipProps): JSX.Element {
  const isExclude = variant === "exclude";

  // `primary.subtle`/`primary` and `danger.bg`/`danger` come from the dark
  // palette shown on the wireframe. Light mode uses the same semantic tokens.
  const bg = isExclude ? "danger.bg" : "primary.subtle";
  const fg = isExclude ? "danger" : "primary";
  const prefix = isExclude ? "−" : "+";

  return (
    <Box
      as="span"
      data-variant={variant}
      role="group"
      display="inline-flex"
      alignItems="center"
      gap="2"
      px="3"
      py="1"
      bg={bg}
      color={fg}
      border="1px solid"
      borderColor={fg}
      borderRadius="pill"
      fontSize="xs"
      fontWeight="500"
      lineHeight="1"
      whiteSpace="nowrap"
    >
      <Box as="span" aria-hidden="true">
        {prefix}
      </Box>
      <Box as="span">{label}</Box>
      <ChakraButton
        type="button"
        onClick={onRemove}
        aria-label={`Remove filter ${label}`}
        display="inline-flex"
        alignItems="center"
        justifyContent="center"
        width="16px"
        height="16px"
        borderRadius="pill"
        color={fg}
        bg="transparent"
        border="none"
        cursor="pointer"
        p="0"
        _hover={{ bg: "bg.surfaceAlt" }}
        _focusVisible={{
          outline: "2px solid",
          outlineColor: fg,
          outlineOffset: "1px",
        }}
      >
        <X size={12} />
      </ChakraButton>
    </Box>
  );
}

export default FilterChip;
