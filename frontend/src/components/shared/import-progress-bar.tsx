/**
 * Bottom-anchored progress bar(s) for image imports.
 *
 * Subscribes to `useImportProgressStore` — a Zustand store that replaces the
 * old `ImportImageContext`. Every active import renders its own row; when
 * none are active the whole bar unmounts so it leaves no residual space.
 *
 * Behaviour:
 *  - Rows stack from the bottom upwards (most recent first).
 *  - While running: label + percentage + indeterminate-aware progress bar.
 *  - When `done` flips true: we show "Complete" plus a dismiss (X) button.
 *  - Dismissing a finished import removes it from the store so the toast
 *    surface disappears once every row has been acknowledged.
 */
import { Box, IconButton, Progress } from "@chakra-ui/react";
import { X } from "lucide-react";
import type { ReactElement } from "react";
import {
  useImportProgressStore,
  type ImportProgress,
} from "../../stores/import-progress-store";

function percent(progress: ImportProgress): number {
  if (progress.total <= 0) return 0;
  return Math.min(100, Math.round((progress.completed / progress.total) * 100));
}

function rowLabel(progress: ImportProgress): string {
  if (progress.done) {
    if (progress.failed && progress.failed > 0) {
      return `${progress.completed} of ${progress.total} imported · ${progress.failed} failed`;
    }
    return `Complete · ${progress.total} imported`;
  }
  return `${progress.completed} / ${progress.total}`;
}

export function ImportProgressBar(): ReactElement | null {
  const imports = useImportProgressStore((s) => s.imports);
  const dismiss = useImportProgressStore((s) => s.dismiss);

  if (imports.size === 0) return null;

  const entries = Array.from(imports.entries());

  return (
    <Box
      data-testid="import-progress-bar"
      role="status"
      aria-live="polite"
      position="fixed"
      bottom="0"
      left="0"
      right="0"
      bg="bg.surface"
      borderTop="1px solid"
      borderColor="border"
      zIndex={20}
    >
      {entries.map(([id, progress]) => (
        <Box
          key={id}
          data-testid="import-progress-row"
          data-import-id={id}
          display="flex"
          alignItems="center"
          gap="3"
          px="4"
          py="2"
          borderBottom="1px solid"
          borderColor="border"
          _last={{ borderBottom: "none" }}
        >
          <Box flex="1" minWidth={0}>
            <Box
              display="flex"
              justifyContent="space-between"
              alignItems="center"
              mb="1"
            >
              <Box
                fontSize="sm"
                color="fg"
                fontWeight="500"
                overflow="hidden"
                textOverflow="ellipsis"
                whiteSpace="nowrap"
              >
                {progress.label}
              </Box>
              <Box
                fontSize="xs"
                color="fg.secondary"
                ml="3"
                whiteSpace="nowrap"
              >
                {rowLabel(progress)}
              </Box>
            </Box>
            <Progress.Root
              value={percent(progress)}
              max={100}
              size="xs"
              colorPalette={progress.done ? "green" : "indigo"}
              aria-label={`Import progress for ${progress.label}`}
            >
              <Progress.Track bg="bg.surfaceAlt" borderRadius="pill">
                <Progress.Range bg={progress.done ? "success" : "primary"} />
              </Progress.Track>
            </Progress.Root>
          </Box>
          {progress.done && (
            <IconButton
              type="button"
              aria-label={`Dismiss import ${progress.label}`}
              onClick={() => dismiss(id)}
              size="sm"
              variant="ghost"
              color="fg.secondary"
              _hover={{ color: "fg", bg: "bg.surfaceAlt" }}
            >
              <X size={14} />
            </IconButton>
          )}
        </Box>
      ))}
    </Box>
  );
}

export default ImportProgressBar;
