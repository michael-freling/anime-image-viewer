/**
 * Folder picker dialog for multi-anime import.
 *
 * Replaces the MUI Joy modal embedded in the old
 * `frontend/src/pages/anime/AnimeListPage.tsx` (lines 148-197, 405-490). The
 * new version is framework-agnostic: callers supply the list of eligible
 * folders and the `onImport` callback, keeping all AnimeService wiring out
 * of this shared component.
 *
 * Behaviour:
 *  - A "Select all" checkbox at the top toggles between none, all, and
 *    indeterminate based on the current selection.
 *  - The Import button label echoes the count for confirmation
 *    ("Import 3 folders"). Disabled while nothing is selected.
 *  - During an import the dialog stays open with loading buttons so the user
 *    can see progress; callers should close by flipping `open=false` on
 *    success.
 */
import { Box, Button, Checkbox, Dialog, Portal, Stack } from "@chakra-ui/react";
import { useEffect, useMemo, useState } from "react";
import { formatCount } from "../../lib/format";
import { ErrorAlert } from "./error-alert";

export interface ImportableFolder {
  id: number;
  name: string;
}

export interface ImportFoldersDialogProps {
  open: boolean;
  onClose: () => void;
  folders: ImportableFolder[];
  onImport: (ids: number[]) => Promise<void>;
  loading?: boolean;
  error?: string | null;
}

export function ImportFoldersDialog({
  open,
  onClose,
  folders,
  onImport,
  loading = false,
  error = null,
}: ImportFoldersDialogProps): JSX.Element | null {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);

  // Reset selection when the dialog closes. Using the `open` flag directly
  // keeps behaviour predictable in tests (React 18 strict-mode double mount).
  useEffect(() => {
    if (!open) {
      setSelected(new Set());
      setImporting(false);
    }
  }, [open]);

  const allSelected = folders.length > 0 && selected.size === folders.length;
  const someSelected = selected.size > 0 && selected.size < folders.length;

  const canSubmit = useMemo(
    () => selected.size > 0 && !importing && !loading,
    [selected, importing, loading],
  );

  const toggleOne = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) =>
      prev.size === folders.length ? new Set() : new Set(folders.map((f) => f.id)),
    );
  };

  const handleImport = async () => {
    if (selected.size === 0) return;
    setImporting(true);
    try {
      await onImport(Array.from(selected));
    } finally {
      setImporting(false);
    }
  };

  const handleOpenChange = (details: { open: boolean }) => {
    if (!details.open && !importing) {
      onClose();
    }
  };

  if (!open) return null;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={handleOpenChange}
      closeOnEscape={!importing}
      closeOnInteractOutside={!importing}
    >
      <Portal>
        <Dialog.Backdrop bg="blackAlpha.600" />
        <Dialog.Positioner>
          <Dialog.Content
            data-testid="import-folders-dialog"
            bg="bg.surface"
            color="fg"
            borderRadius="lg"
            borderWidth="1px"
            borderColor="border"
            maxWidth="520px"
            width="full"
          >
            <Dialog.Header px="5" pt="4">
              <Dialog.Title fontSize="md" fontWeight="600">
                Import folders as anime
              </Dialog.Title>
            </Dialog.Header>
            <Dialog.Body px="5" py="2">
              <Stack gap="3">
                {error && <ErrorAlert message={error} />}
                {loading && (
                  <Box fontSize="sm" color="fg.secondary">
                    Loading folders…
                  </Box>
                )}
                {!loading && folders.length === 0 && !error && (
                  <Box fontSize="sm" color="fg.secondary">
                    No unassigned top-level folders available.
                  </Box>
                )}
                {!loading && folders.length > 0 && (
                  <>
                    <Checkbox.Root
                      checked={
                        allSelected ? true : someSelected ? "indeterminate" : false
                      }
                      onCheckedChange={toggleAll}
                      data-testid="import-folders-select-all"
                      disabled={importing}
                    >
                      <Checkbox.HiddenInput />
                      <Checkbox.Control />
                      <Checkbox.Label>Select all</Checkbox.Label>
                    </Checkbox.Root>
                    <Box
                      borderWidth="1px"
                      borderColor="border"
                      borderRadius="md"
                      maxHeight="300px"
                      overflowY="auto"
                      bg="bg.surfaceAlt"
                    >
                      <Stack gap="0" divideY="1px" divideColor="border">
                        {folders.map((folder) => (
                          <Box
                            key={folder.id}
                            data-testid="import-folder-row"
                            data-folder-id={folder.id}
                            px="3"
                            py="2"
                          >
                            <Checkbox.Root
                              checked={selected.has(folder.id)}
                              onCheckedChange={() => toggleOne(folder.id)}
                              disabled={importing}
                            >
                              <Checkbox.HiddenInput />
                              <Checkbox.Control />
                              <Checkbox.Label>{folder.name}</Checkbox.Label>
                            </Checkbox.Root>
                          </Box>
                        ))}
                      </Stack>
                    </Box>
                  </>
                )}
              </Stack>
            </Dialog.Body>
            <Dialog.Footer
              px="5"
              py="4"
              display="flex"
              gap="2"
              justifyContent="flex-end"
            >
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onClose}
                disabled={importing}
                data-testid="import-folders-cancel"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                bg="primary"
                color="bg.surface"
                _hover={{ bg: "primary.hover" }}
                onClick={handleImport}
                disabled={!canSubmit}
                loading={importing}
                loadingText="Importing…"
                data-testid="import-folders-submit"
              >
                {selected.size > 0
                  ? `Import ${formatCount(selected.size, "folder")}`
                  : "Import"}
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

export default ImportFoldersDialog;
