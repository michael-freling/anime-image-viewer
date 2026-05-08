/**
 * Large search input used on the Search page and as a reusable primitive.
 *
 * Spec: ui-design.md §3.4 (search page hero bar) and wireframe
 * `04-search-desktop.svg`. The 'lg' size matches the ~48px tall pill shown
 * above the results grid; 'md' matches the compact search on other pages.
 *
 * Behaviours:
 *  - Always full-width. Callers constrain the outer width via layout.
 *  - Shows a clear button (lucide X) only when `value` is non-empty.
 *  - Pressing Enter calls `onSubmit(value)` when provided.
 */
import { Box, IconButton, Input } from "@chakra-ui/react";
import { Search, X } from "lucide-react";
import { KeyboardEvent, useRef } from "react";

export interface SearchBarProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  onSubmit?: (v: string) => void;
  size?: "md" | "lg";
}

export function SearchBar({
  value,
  onChange,
  placeholder = "Search…",
  onSubmit,
  size = "lg",
}: SearchBarProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const height = size === "lg" ? "48px" : "36px";
  const iconSize = size === "lg" ? 18 : 16;
  const fontSize = size === "lg" ? "md" : "sm";

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && onSubmit) {
      onSubmit(value);
    }
  };

  const handleClear = () => {
    onChange("");
    // Keep focus on the input so the user can keep typing.
    inputRef.current?.focus();
  };

  return (
    <Box
      position="relative"
      width="full"
      height={height}
      data-size={size}
    >
      <Box
        position="absolute"
        left="16px"
        top="50%"
        transform="translateY(-50%)"
        color="fg.secondary"
        pointerEvents="none"
        display="flex"
        alignItems="center"
        aria-hidden="true"
      >
        <Search size={iconSize} />
      </Box>
      <Input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        role="searchbox"
        aria-label={placeholder}
        width="full"
        height={height}
        fontSize={fontSize}
        borderRadius="pill"
        bg="bg.surface"
        borderColor="border"
        color="fg"
        pl={size === "lg" ? "48px" : "40px"}
        pr={value.length > 0 ? (size === "lg" ? "48px" : "40px") : "16px"}
        _placeholder={{ color: "fg.dim" }}
        _focus={{
          borderColor: "primary",
          outline: "none",
          boxShadow: "0 0 0 2px var(--chakra-colors-primary)",
        }}
      />
      {value.length > 0 && (
        <IconButton
          type="button"
          aria-label="Clear search"
          onClick={handleClear}
          position="absolute"
          right="8px"
          top="50%"
          transform="translateY(-50%)"
          size="sm"
          variant="ghost"
          color="fg.secondary"
          borderRadius="pill"
          minWidth="auto"
          _hover={{ color: "fg", bg: "bg.surfaceAlt" }}
        >
          <X size={iconSize} />
        </IconButton>
      )}
    </Box>
  );
}

export default SearchBar;
