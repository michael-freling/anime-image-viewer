/**
 * CreateAnimeDialog — lets the user create a new anime entry, optionally
 * linked to a series in the anime metadata database.
 *
 * Flow:
 *   1. User types a name in the text field.
 *   2. As they type, debounced series search results appear below
 *      (via `useMetadataSearch`).
 *   3. Clicking a search result fills the name field and stores the
 *      series id for import.
 *   4. Pressing "Create" calls `AnimeService.CreateAnime(name)`.
 *   5. If a series was selected, also calls
 *      `AnimeService.ImportFromMetadata(animeId, seriesId)`.
 *   6. On success: invalidates the anime list cache, shows a toast,
 *      and navigates to `/anime/:id`.
 *   7. On error: shows the error inline in the dialog body.
 *
 * Follows the controlled open/onClose pattern used by ConfirmDialog and
 * ImportFoldersDialog.
 */
import { Box, Button, Dialog, Portal, Stack, chakra } from "@chakra-ui/react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";

import { toast } from "../../components/ui/toaster";
import { AnimeService } from "../../lib/api";
import type { MetadataSearchResult } from "../../lib/api";
import { qk } from "../../lib/query-keys";
import { useMetadataSearch } from "../../hooks/use-metadata-search";

const ChakraInput = chakra("input");

export interface CreateAnimeDialogProps {
  open: boolean;
  onClose: () => void;
}

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return typeof err === "string" ? err : "Unexpected error";
}

export function CreateAnimeDialog({
  open,
  onClose,
}: CreateAnimeDialogProps): JSX.Element {
  const [name, setName] = useState("");
  const [selectedResult, setSelectedResult] =
    useState<MetadataSearchResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const metadataQuery = useMetadataSearch(name);

  const handleOpenChange = (details: { open: boolean }) => {
    if (!details.open && !submitting) {
      handleClose();
    }
  };

  const handleClose = () => {
    setName("");
    setSelectedResult(null);
    setError(null);
    onClose();
  };

  const handleSelectResult = (result: MetadataSearchResult) => {
    setSelectedResult(result);
    setName(result.title);
  };

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (trimmed === "" || submitting) return;

    setError(null);
    setSubmitting(true);
    try {
      const anime = (await AnimeService.CreateAnime(trimmed)) as {
        id: number;
        name: string;
      };

      if (selectedResult) {
        try {
          await AnimeService.ImportFromMetadata(anime.id, selectedResult.id);
        } catch (importErr) {
          // The anime was created but the metadata import failed. We still
          // navigate to the detail page, but surface the import error as a
          // warning toast.
          toast.warning(
            "Anime created, but metadata import failed",
            extractErrorMessage(importErr),
          );
        }
      }

      await queryClient.invalidateQueries({ queryKey: qk.anime.list() });
      toast.success("Anime created", `"${anime.name}" has been added.`);
      handleClose();
      navigate(`/anime/${anime.id}`);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && name.trim() !== "") {
      e.preventDefault();
      handleCreate();
    }
  };

  const results = metadataQuery.data ?? [];
  const canCreate = name.trim() !== "" && !submitting;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={handleOpenChange}
      closeOnEscape={!submitting}
      closeOnInteractOutside={!submitting}
    >
      <Portal>
        <Dialog.Backdrop bg="blackAlpha.600" />
        <Dialog.Positioner>
          <Dialog.Content
            data-testid="create-anime-dialog"
            bg="bg.surface"
            color="fg"
            borderRadius="lg"
            borderWidth="1px"
            borderColor="border"
            maxWidth="520px"
          >
            <Dialog.Header px="5" pt="4">
              <Dialog.Title fontSize="md" fontWeight="600">
                Create anime
              </Dialog.Title>
            </Dialog.Header>

            <Dialog.Body px="5" py="2">
              <Stack gap="3">
                <Box>
                  <ChakraInput
                    data-testid="create-anime-name"
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      // Clear selected result when user edits the name
                      if (selectedResult) {
                        setSelectedResult(null);
                      }
                    }}
                    onKeyDown={handleKeyDown}
                    disabled={submitting}
                    placeholder="Anime name"
                    aria-label="Anime name"
                    width="100%"
                    height="40px"
                    px="3"
                    borderRadius="md"
                    borderWidth="1px"
                    borderColor="border"
                    bg="bg.surface"
                    color="fg"
                    fontSize="sm"
                    _focus={{
                      outline: "none",
                      borderColor: "primary",
                      boxShadow: "0 0 0 2px var(--chakra-colors-primary)",
                    }}
                    _disabled={{ opacity: 0.6, cursor: "not-allowed" }}
                  />
                </Box>

                {/* Series search results */}
                {results.length > 0 && (
                  <Box
                    data-testid="metadata-results"
                    borderWidth="1px"
                    borderColor="border"
                    borderRadius="md"
                    maxHeight="200px"
                    overflowY="auto"
                  >
                    {results.map((result) => {
                      const isSelected = selectedResult?.id === result.id;
                      return (
                        <Box
                          key={result.id}
                          data-testid="metadata-result-item"
                          data-series-id={result.id}
                          px="3"
                          py="2"
                          cursor="pointer"
                          bg={isSelected ? "primary" : "transparent"}
                          color={isSelected ? "bg.surface" : "fg"}
                          _hover={{
                            bg: isSelected ? "primary" : "bg.subtle",
                          }}
                          onClick={() => handleSelectResult(result)}
                          fontSize="sm"
                          borderBottom="1px solid"
                          borderColor="border"
                        >
                          <Box fontWeight="500">{result.title}</Box>
                          <Box fontSize="xs" opacity={isSelected ? 0.9 : 0.6}>
                            {result.id}
                            {result.franchiseId
                              ? ` · ${result.franchiseId}`
                              : ""}
                          </Box>
                        </Box>
                      );
                    })}
                  </Box>
                )}

                {metadataQuery.isLoading && name.trim().length > 0 && (
                  <Box
                    data-testid="metadata-loading"
                    fontSize="xs"
                    color="fg.secondary"
                    px="1"
                  >
                    Searching series...
                  </Box>
                )}

                {error && (
                  <Box
                    data-testid="create-anime-error"
                    role="alert"
                    fontSize="sm"
                    color="danger"
                    bg="danger.bg"
                    borderRadius="md"
                    px="3"
                    py="2"
                  >
                    {error}
                  </Box>
                )}
              </Stack>
            </Dialog.Body>

            <Dialog.Footer
              px="5"
              pb="4"
              pt="4"
              display="flex"
              gap="2"
              justifyContent="flex-end"
            >
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleClose}
                disabled={submitting}
                data-testid="create-anime-cancel"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                bg="primary"
                color="bg.surface"
                _hover={{ bg: "primary.hover" }}
                onClick={handleCreate}
                disabled={!canCreate}
                loading={submitting}
                loadingText="Creating..."
                data-testid="create-anime-submit"
              >
                Create
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

export default CreateAnimeDialog;
