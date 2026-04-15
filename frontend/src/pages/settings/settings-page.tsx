/**
 * SettingsPage — AnimeVault's catch-all preferences screen.
 *
 * Spec: ui-design.md §3.7 (Settings with Backup tab), §2.8 (Settings user
 * flow), §6 (Responsive Design). Per `frontend-design.md` §3 point 5, the
 * active section is **local state, not URL state** (settings aren't
 * shareable).
 *
 * Layouts:
 *   - Desktop: horizontal section tab bar (`General | Appearance | Backup
 *     | About`) with a centered content column below. Matches
 *     `08-settings-desktop.svg` exactly (pill tab bar, centered form).
 *   - Mobile: iOS-style grouped list — every section renders stacked with
 *     a big capitalised group header above it. Matches `08-settings-
 *     mobile.svg`.
 *
 * The responsive split uses Chakra's `display={{ base, md }}` so one tree
 * is declared and CSS media queries switch visibility. No matchMedia
 * branching: the markup is identical from the screen-reader's POV; only
 * visual presentation changes.
 */
import { Box, chakra, Stack, Text } from "@chakra-ui/react";
import { useState } from "react";

const ChakraButton = chakra("button");

import { PageHeader } from "../../components/layout/page-header";
import { AboutSection } from "./sections/about-section";
import { AppearanceSection } from "./sections/appearance-section";
import { BackupSection } from "./sections/backup-section";
import { GeneralSection } from "./sections/general-section";

export type SettingsSectionId =
  | "general"
  | "appearance"
  | "backup"
  | "about";

interface SectionDef {
  id: SettingsSectionId;
  label: string;
  render: () => JSX.Element;
}

const SECTIONS: readonly SectionDef[] = [
  { id: "general", label: "General", render: () => <GeneralSection /> },
  { id: "appearance", label: "Appearance", render: () => <AppearanceSection /> },
  { id: "backup", label: "Backup", render: () => <BackupSection /> },
  { id: "about", label: "About", render: () => <AboutSection /> },
] as const;

/**
 * Desktop layout: horizontal pill-style tab bar with a single rendered
 * panel below. Uses `role="tablist" / role="tab" / role="tabpanel"` for
 * AT parity with Chakra's Tabs primitive.
 */
function DesktopSettings({
  activeId,
  onActiveChange,
}: {
  activeId: SettingsSectionId;
  onActiveChange: (id: SettingsSectionId) => void;
}): JSX.Element {
  const active = SECTIONS.find((s) => s.id === activeId) ?? SECTIONS[0];
  return (
    <Stack gap="4" align="center" pt="4" pb="8" data-testid="settings-desktop">
      <Box
        role="tablist"
        aria-label="Settings sections"
        data-testid="settings-tablist"
        display="inline-flex"
        bg="bg.surfaceAlt"
        borderRadius="pill"
        p="1"
        gap="1"
      >
        {SECTIONS.map((section) => {
          const isActive = section.id === activeId;
          return (
            <ChakraButton
              type="button"
              key={section.id}
              role="tab"
              id={`settings-tab-${section.id}`}
              aria-selected={isActive}
              aria-controls={`settings-tabpanel-${section.id}`}
              data-testid={`settings-tab-${section.id}`}
              data-active={isActive ? "true" : undefined}
              onClick={() => onActiveChange(section.id)}
              display="inline-flex"
              alignItems="center"
              px="4"
              py="1"
              minHeight="28px"
              borderRadius="pill"
              bg={isActive ? "primary" : "transparent"}
              color={isActive ? "bg.surface" : "fg.secondary"}
              fontSize="sm"
              fontWeight={isActive ? "600" : "500"}
              cursor="pointer"
              border="none"
              transition="background-color 120ms, color 120ms"
              _hover={{
                color: isActive ? "bg.surface" : "fg",
              }}
            >
              {section.label}
            </ChakraButton>
          );
        })}
      </Box>

      <Box
        role="tabpanel"
        id={`settings-tabpanel-${active.id}`}
        aria-labelledby={`settings-tab-${active.id}`}
        data-testid={`settings-tabpanel-${active.id}`}
        width="full"
        maxWidth="760px"
        bg="bg.surface"
        borderWidth="1px"
        borderColor="border"
        borderRadius="lg"
        px={{ base: "4", md: "6" }}
        py={{ base: "3", md: "4" }}
      >
        {active.render()}
      </Box>
    </Stack>
  );
}

/**
 * Mobile layout: iOS-style grouped list. Every section is always visible —
 * there's no tab interaction on narrow viewports because the sections are
 * short enough to scroll through.
 */
function MobileSettings(): JSX.Element {
  return (
    <Stack gap="6" px="4" pt="4" pb="8" data-testid="settings-mobile">
      {SECTIONS.map((section) => (
        <Box
          key={section.id}
          data-testid={`settings-group-${section.id}`}
        >
          <Text
            as="h2"
            fontSize="xs"
            fontWeight="600"
            color="fg.muted"
            letterSpacing="wider"
            textTransform="uppercase"
            mb="2"
          >
            {section.label}
          </Text>
          <Box
            bg="bg.surface"
            borderWidth="1px"
            borderColor="border"
            borderRadius="lg"
            px="3"
          >
            {section.render()}
          </Box>
        </Box>
      ))}
    </Stack>
  );
}

export function SettingsPage(): JSX.Element {
  const [activeId, setActiveId] = useState<SettingsSectionId>("general");

  return (
    <Box
      data-testid="settings-page"
      position="relative"
      minHeight="100%"
    >
      <PageHeader title="Settings" />

      {/* Desktop: tabbed centered form. Hidden below md breakpoint. */}
      <Box display={{ base: "none", md: "block" }}>
        <DesktopSettings activeId={activeId} onActiveChange={setActiveId} />
      </Box>

      {/* Mobile: iOS grouped list. Hidden at and above md breakpoint. */}
      <Box display={{ base: "block", md: "none" }}>
        <MobileSettings />
      </Box>
    </Box>
  );
}

export default SettingsPage;
