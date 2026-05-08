/**
 * General settings section — directory configuration.
 *
 * Spec: ui-design.md §3.7 (Settings — General tab) and §2.8 (user flow:
 * General → Image Root + Browse, Config + Browse, Log + Browse, Backup +
 * Browse, then Save). Pulls the current `ConfigSettings` via `useConfig`
 * and exposes a Browse button per directory that calls
 * `ConfigFrontendService.SelectDirectory`.
 *
 * The warning banner mirrors the wireframe copy: "Changing directories
 * requires an app restart to take effect." Save commits via
 * `useUpdateConfig`; local state holds the pending edits so browsing a
 * new directory shows immediately without a round-trip.
 */
import { Box, Button, chakra, Input, Stack } from "@chakra-ui/react";
import { useEffect, useState } from "react";

const ChakraLabel = chakra("label");

import { ErrorAlert } from "../../../components/shared/error-alert";
import { RowSkeleton } from "../../../components/shared/loading-skeleton";
import { toast } from "../../../components/ui/toaster";
import { useConfig, useUpdateConfig } from "../../../hooks/use-config";
import { ConfigFrontendService } from "../../../lib/api";
import type { ConfigSettings } from "../../../lib/api";

type DirField =
  | "imageRootDirectory"
  | "configDirectory"
  | "logDirectory"
  | "backupDirectory";

const DIRECTORY_FIELDS: Array<{ key: DirField; label: string }> = [
  { key: "imageRootDirectory", label: "Image Root Directory" },
  { key: "configDirectory", label: "Config Directory" },
  { key: "logDirectory", label: "Log Directory" },
  { key: "backupDirectory", label: "Backup Directory" },
];

export function GeneralSection(): JSX.Element {
  const configQuery = useConfig();
  const updateConfig = useUpdateConfig();
  const [draft, setDraft] = useState<ConfigSettings | null>(null);

  // Sync the draft when the server data loads or changes.
  useEffect(() => {
    if (configQuery.data) {
      setDraft(configQuery.data);
    }
  }, [configQuery.data]);

  if (configQuery.isLoading) {
    return (
      <Box data-testid="general-section" py="4">
        <RowSkeleton lines={4} />
      </Box>
    );
  }

  if (configQuery.isError || !draft) {
    return (
      <Box data-testid="general-section" py="4">
        <ErrorAlert
          title="Couldn't load settings"
          message={
            configQuery.error instanceof Error
              ? configQuery.error.message
              : "Unknown error"
          }
          onRetry={() => {
            configQuery.refetch();
          }}
        />
      </Box>
    );
  }

  const handleBrowse = async (field: DirField) => {
    try {
      // Wails binding returns string; cast for the loose typing of the
      // binding surface declared in src/types/bindings.d.ts.
      const next = (await ConfigFrontendService.SelectDirectory()) as string;
      if (next) {
        setDraft({ ...draft, [field]: next });
      }
    } catch (err) {
      toast.error(
        "Couldn't open folder picker",
        err instanceof Error ? err.message : String(err),
      );
    }
  };

  const handleSave = async () => {
    try {
      await updateConfig.mutateAsync(draft);
      toast.success(
        "Settings saved",
        "Some changes may require an application restart.",
      );
    } catch (err) {
      toast.error(
        "Couldn't save settings",
        err instanceof Error ? err.message : String(err),
      );
    }
  };

  const dirty =
    configQuery.data !== undefined &&
    DIRECTORY_FIELDS.some(
      ({ key }) => draft[key] !== configQuery.data?.[key],
    );

  return (
    <Stack
      data-testid="general-section"
      gap="4"
      py="4"
    >
      <Box
        role="note"
        bg="warning.bg"
        borderLeftWidth="3px"
        borderLeftColor="warning"
        color="warning"
        borderRadius="md"
        px="3"
        py="2"
        fontSize="sm"
      >
        Changing directories requires an app restart to take effect.
      </Box>

      <Stack gap="4">
        {DIRECTORY_FIELDS.map(({ key, label }) => (
          <Box key={key}>
            <ChakraLabel
              htmlFor={`field-${key}`}
              fontSize="sm"
              color="fg.secondary"
              display="block"
            >
              {label}
            </ChakraLabel>
            <Stack direction="row" gap="2" align="center" mt="1">
              <Input
                id={`field-${key}`}
                data-testid={`field-${key}`}
                readOnly
                value={draft[key]}
                size="sm"
                flex="1"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => handleBrowse(key)}
                data-testid={`browse-${key}`}
              >
                Browse
              </Button>
            </Stack>
          </Box>
        ))}
      </Stack>

      <Stack direction="row" gap="2" pt="2">
        <Button
          type="button"
          size="sm"
          bg="primary"
          color="bg.surface"
          _hover={{ bg: "primary.hover" }}
          onClick={handleSave}
          disabled={!dirty || updateConfig.isPending}
          loading={updateConfig.isPending}
          loadingText="Saving"
          data-testid="save-config"
        >
          Save
        </Button>
      </Stack>
    </Stack>
  );
}

export default GeneralSection;
