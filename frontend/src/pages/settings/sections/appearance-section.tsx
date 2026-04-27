/**
 * Appearance settings section — theme selector.
 *
 * Spec: ui-design.md §3.7 (Settings — Appearance tab) and wireframe
 * `08-settings-mobile.svg` (Light / Dark / System segmented control).
 *
 * Theme preference is stored in the Zustand UI store (`useUIStore.theme` /
 * `setTheme`). The control is a segmented radiogroup with three options.
 */
import { Box, chakra, Stack, Text } from "@chakra-ui/react";
import { Moon, Sun, Monitor } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { ThemePreference } from "../../../stores/ui-store";
import { useUIStore } from "../../../stores/ui-store";

const ChakraButton = chakra("button");

interface ThemeOption {
  value: ThemePreference;
  label: string;
  icon: LucideIcon;
}

const THEME_OPTIONS: readonly ThemeOption[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

export function AppearanceSection(): JSX.Element {
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);

  return (
    <Stack data-testid="appearance-section" gap="4" py="4">
      <Box
        as="fieldset"
        borderWidth="0"
        m="0"
        p="0"
      >
        <Text as="legend" fontSize="sm" color="fg.secondary" mb="2">
          Theme
        </Text>

        <Box
          role="radiogroup"
          aria-label="Theme"
          data-testid="theme-radiogroup"
          display="inline-flex"
          bg="bg.surfaceAlt"
          borderRadius="pill"
          p="1"
          gap="1"
        >
          {THEME_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const isSelected = theme === opt.value;
            return (
              <ChakraButton
                type="button"
                key={opt.value}
                role="radio"
                aria-checked={isSelected}
                data-testid={`theme-option-${opt.value}`}
                data-selected={isSelected ? "true" : undefined}
                onClick={() => setTheme(opt.value)}
                display="inline-flex"
                alignItems="center"
                gap="2"
                px="3"
                py="1"
                borderRadius="pill"
                bg={isSelected ? "primary" : "transparent"}
                color={isSelected ? "bg.surface" : "fg.secondary"}
                fontSize="sm"
                fontWeight={isSelected ? "600" : "500"}
                cursor="pointer"
                border="none"
                transition="background-color 120ms, color 120ms"
                _hover={{
                  color: isSelected ? "bg.surface" : "fg",
                }}
              >
                <Icon size={14} aria-hidden="true" />
                <span>{opt.label}</span>
              </ChakraButton>
            );
          })}
        </Box>
      </Box>
    </Stack>
  );
}

export default AppearanceSection;
