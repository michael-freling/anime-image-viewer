/**
 * EntriesTab -- list and management of entries (seasons, movies, parts) for an
 * anime. Spec: ux-design.md section 3.2.2.
 *
 * Features:
 *   - Renders entries with type badge, name, airing info, image count.
 *   - Clicking a row navigates to Images tab filtered to that entry.
 *   - "Add entry" button opens a dialog to create a new entry.
 *   - Per-row edit button opens a dialog to rename / change type / airing.
 *   - Per-row delete button shows a confirmation dialog, then deletes.
 */
import {
  Box,
  Button,
  Dialog,
  Flex,
  Input,
  Portal,
  Stack,
  Text,
} from "@chakra-ui/react";
import {
  ChevronRight,
  ListOrdered,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";

import { EmptyState } from "../../components/shared/empty-state";
import { ErrorAlert } from "../../components/shared/error-alert";
import { RowSkeleton } from "../../components/shared/loading-skeleton";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { useAnimeDetail } from "../../hooks/use-anime-detail";
import { useImageImport } from "../../hooks/use-image-import";
import { qk } from "../../lib/query-keys";
import {
  useCreateEntry,
  useDeleteEntry,
  useRenameEntry,
  useUpdateEntryAiring,
  useUpdateEntryType,
} from "../../hooks/use-entry-mutations";
import { ENTRY_TYPE_CONFIGS } from "../../lib/constants";
import { formatCount } from "../../lib/format";
import { toast } from "../../components/ui/toaster";
import type { Entry, EntryType } from "../../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseAnimeId(raw: string | undefined): number {
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

const ENTRY_TYPE_OPTIONS: { value: EntryType; label: string }[] = [
  { value: "season", label: "Season" },
  { value: "movie", label: "Movie" },
  { value: "other", label: "Other" },
];

const AIRING_SEASON_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "(none)" },
  { value: "SPRING", label: "Spring" },
  { value: "SUMMER", label: "Summer" },
  { value: "FALL", label: "Fall" },
  { value: "WINTER", label: "Winter" },
];

// ---------------------------------------------------------------------------
// EntryFormDialog -- shared dialog for create and edit
// ---------------------------------------------------------------------------

interface EntryFormState {
  name: string;
  type: EntryType;
  entryNumber: string; // kept as string for the input; parsed on submit
  airingSeason: string;
  airingYear: string; // kept as string for the input
}

function emptyFormState(): EntryFormState {
  return {
    name: "",
    type: "season",
    entryNumber: "",
    airingSeason: "",
    airingYear: "",
  };
}

function formStateFromEntry(entry: Entry): EntryFormState {
  return {
    name: entry.name,
    type: entry.type,
    entryNumber: entry.entryNumber != null ? String(entry.entryNumber) : "",
    airingSeason: entry.airingSeason,
    airingYear: entry.airingYear != null ? String(entry.airingYear) : "",
  };
}

interface EntryFormDialogProps {
  open: boolean;
  onClose: () => void;
  /** When set we are editing; when null we are creating. */
  editingEntry: Entry | null;
  animeId: number;
}

function EntryFormDialog({
  open,
  onClose,
  editingEntry,
  animeId,
}: EntryFormDialogProps): JSX.Element {
  const isEdit = editingEntry !== null;
  const [form, setForm] = useState<EntryFormState>(
    isEdit ? formStateFromEntry(editingEntry) : emptyFormState(),
  );
  const [saving, setSaving] = useState(false);

  const createEntry = useCreateEntry();
  const renameEntry = useRenameEntry();
  const updateType = useUpdateEntryType();
  const updateAiring = useUpdateEntryAiring();

  // Reset form state when the dialog opens or the entry changes.
  useEffect(() => {
    if (open) {
      setForm(isEdit ? formStateFromEntry(editingEntry) : emptyFormState());
      setSaving(false);
    }
  }, [open, editingEntry, isEdit]);

  const handleChange = (field: keyof EntryFormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    try {
      setSaving(true);
      const parsedNumber = form.entryNumber
        ? Number(form.entryNumber)
        : null;
      const parsedYear = form.airingYear ? Number(form.airingYear) : 0;

      if (isEdit) {
        // Fire parallel updates for the fields that changed.
        const promises: Promise<void>[] = [];
        if (form.name !== editingEntry.name) {
          promises.push(
            renameEntry.mutateAsync({
              animeId,
              entryId: editingEntry.id,
              newName: form.name,
            }),
          );
        }
        if (
          form.type !== editingEntry.type ||
          parsedNumber !== editingEntry.entryNumber
        ) {
          promises.push(
            updateType.mutateAsync({
              animeId,
              entryId: editingEntry.id,
              entryType: form.type,
              entryNumber: parsedNumber,
            }),
          );
        }
        if (
          form.airingSeason !== editingEntry.airingSeason ||
          parsedYear !== (editingEntry.airingYear ?? 0)
        ) {
          promises.push(
            updateAiring.mutateAsync({
              animeId,
              entryId: editingEntry.id,
              airingSeason: form.airingSeason,
              airingYear: parsedYear,
            }),
          );
        }
        await Promise.all(promises);
        toast.success("Entry updated");
      } else {
        await createEntry.mutateAsync({
          animeId,
          entryType: form.type,
          entryNumber: parsedNumber,
          displayName: form.name,
        });
        toast.success("Entry created");
      }
      onClose();
    } catch (err) {
      toast.error(
        isEdit ? "Failed to update entry" : "Failed to create entry",
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleOpenChange = (details: { open: boolean }) => {
    if (!details.open && !saving) {
      onClose();
    }
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={handleOpenChange}
      closeOnEscape={!saving}
      closeOnInteractOutside={!saving}
    >
      <Portal>
        <Dialog.Backdrop bg="blackAlpha.600" />
        <Dialog.Positioner>
          <Dialog.Content
            data-testid="entry-form-dialog"
            bg="bg.surface"
            color="fg"
            borderRadius="lg"
            borderWidth="1px"
            borderColor="border"
            maxWidth="480px"
            width="100%"
          >
            <Dialog.Header px="5" pt="4">
              <Dialog.Title fontSize="md" fontWeight="600">
                {isEdit ? "Edit entry" : "Add entry"}
              </Dialog.Title>
            </Dialog.Header>
            <Dialog.Body px="5" py="3">
              <Stack gap="3">
                {/* Type selector */}
                <Box>
                  <Text fontSize="xs" fontWeight="600" color="fg.secondary" mb="1">
                    Type
                  </Text>
                  <select
                    data-testid="entry-form-type"
                    value={form.type}
                    onChange={(e) => handleChange("type", e.target.value)}
                    style={{
                      width: "100%",
                      padding: "6px 12px",
                      borderWidth: "1px",
                      borderStyle: "solid",
                      borderRadius: "6px",
                      fontSize: "14px",
                      background: "var(--chakra-colors-bg-surface, #1e1e2e)",
                      color: "var(--chakra-colors-fg, #e0e0e0)",
                      borderColor: "var(--chakra-colors-border, #333)",
                    }}
                  >
                    {ENTRY_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </Box>

                {/* Name */}
                <Box>
                  <Text fontSize="xs" fontWeight="600" color="fg.secondary" mb="1">
                    Name
                  </Text>
                  <Input
                    data-testid="entry-form-name"
                    size="sm"
                    value={form.name}
                    onChange={(e) => handleChange("name", e.target.value)}
                    placeholder="e.g. Season 1, The Movie"
                  />
                </Box>

                {/* Entry number */}
                <Box>
                  <Text fontSize="xs" fontWeight="600" color="fg.secondary" mb="1">
                    Number
                  </Text>
                  <Input
                    data-testid="entry-form-number"
                    size="sm"
                    type="number"
                    value={form.entryNumber}
                    onChange={(e) => handleChange("entryNumber", e.target.value)}
                    placeholder="e.g. 1, 2, 3"
                  />
                </Box>

                {/* Airing season */}
                <Box>
                  <Text fontSize="xs" fontWeight="600" color="fg.secondary" mb="1">
                    Airing season
                  </Text>
                  <select
                    data-testid="entry-form-airing-season"
                    value={form.airingSeason}
                    onChange={(e) =>
                      handleChange("airingSeason", e.target.value)
                    }
                    style={{
                      width: "100%",
                      padding: "6px 12px",
                      borderWidth: "1px",
                      borderStyle: "solid",
                      borderRadius: "6px",
                      fontSize: "14px",
                      background: "var(--chakra-colors-bg-surface, #1e1e2e)",
                      color: "var(--chakra-colors-fg, #e0e0e0)",
                      borderColor: "var(--chakra-colors-border, #333)",
                    }}
                  >
                    {AIRING_SEASON_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </Box>

                {/* Airing year */}
                <Box>
                  <Text fontSize="xs" fontWeight="600" color="fg.secondary" mb="1">
                    Airing year
                  </Text>
                  <Input
                    data-testid="entry-form-airing-year"
                    size="sm"
                    type="number"
                    value={form.airingYear}
                    onChange={(e) => handleChange("airingYear", e.target.value)}
                    placeholder="e.g. 2024"
                  />
                </Box>
              </Stack>
            </Dialog.Body>
            <Dialog.Footer
              px="5"
              pb="4"
              pt="3"
              display="flex"
              gap="2"
              justifyContent="flex-end"
            >
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onClose}
                disabled={saving}
                data-testid="entry-form-cancel"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                bg="primary"
                color="bg.surface"
                _hover={{ bg: "primary.hover", opacity: 0.9 }}
                onClick={handleSubmit}
                loading={saving}
                loadingText={isEdit ? "Saving..." : "Creating..."}
                data-testid="entry-form-submit"
              >
                {isEdit ? "Save" : "Add entry"}
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

// ---------------------------------------------------------------------------
// EntryRow -- a single row in the entry list
// ---------------------------------------------------------------------------

function EntryRow({
  entry,
  animeId,
  depth,
  onEdit,
  onDelete,
  onUpload,
}: {
  entry: Entry;
  animeId: number;
  depth: number;
  onEdit: (entry: Entry) => void;
  onDelete: (entry: Entry) => void;
  onUpload: (entryId: number) => void;
}): JSX.Element {
  const navigate = useNavigate();
  const config = ENTRY_TYPE_CONFIGS[entry.type] ?? ENTRY_TYPE_CONFIGS.other;
  const airing = [entry.airingSeason, entry.airingYear]
    .filter(Boolean)
    .join(" ");

  const handleNavigate = useCallback(() => {
    navigate(`/anime/${animeId}/images?entry=${entry.id}`);
  }, [navigate, animeId, entry.id]);

  return (
    <Box
      data-testid="entry-row"
      data-entry-id={entry.id}
      data-entry-type={entry.type}
      as="li"
      listStyleType="none"
    >
      <Box
        display="flex"
        alignItems="center"
        gap="3"
        py="3"
        px="3"
        pl={`${12 + depth * 16}px`}
        borderWidth="1px"
        borderColor="border"
        borderRadius="md"
        bg="bg.surface"
        _hover={{ bg: "bg.surfaceAlt", borderColor: "primary" }}
      >
        {/* Clickable area: navigate to images */}
        <Box
          role="button"
          tabIndex={0}
          onClick={handleNavigate}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              handleNavigate();
            }
          }}
          display="flex"
          alignItems="center"
          gap="3"
          flex="1"
          minW={0}
          cursor="pointer"
          _focusVisible={{
            outline: "2px solid",
            outlineColor: "primary",
            outlineOffset: "2px",
          }}
        >
          {/* Type badge */}
          <Box
            data-testid="entry-row-badge"
            minW="28px"
            h="28px"
            px="2"
            borderRadius="md"
            bg="bg.surfaceAlt"
            color="fg.secondary"
            fontSize="xs"
            fontWeight="600"
            display="inline-flex"
            alignItems="center"
            justifyContent="center"
          >
            {config.badge}
          </Box>
          <Box flex="1" minW={0}>
            <Text fontSize="sm" fontWeight="600" color="fg" lineClamp={1}>
              {entry.name ||
                `${config.label} ${entry.entryNumber ?? ""}`.trim()}
            </Text>
            <Flex gap="3" mt="1" fontSize="xs" color="fg.secondary">
              {airing && <Text>{airing}</Text>}
              <Text>{formatCount(entry.imageCount, "image", "images")}</Text>
            </Flex>
          </Box>
          <Box as="span" color="fg.muted" aria-hidden="true">
            <ChevronRight size={16} />
          </Box>
        </Box>

        {/* Action buttons */}
        <Flex gap="1" flexShrink={0}>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            aria-label={`Upload images to ${entry.name || "entry"}`}
            data-testid="entry-upload-btn"
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              onUpload(entry.id);
            }}
          >
            <Upload size={14} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            aria-label={`Edit ${entry.name || "entry"}`}
            data-testid="entry-edit-btn"
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              onEdit(entry);
            }}
          >
            <Pencil size={14} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            color="danger"
            aria-label={`Delete ${entry.name || "entry"}`}
            data-testid="entry-delete-btn"
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              onDelete(entry);
            }}
          >
            <Trash2 size={14} />
          </Button>
        </Flex>
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// EntriesTab -- main component
// ---------------------------------------------------------------------------

export function EntriesTab(): JSX.Element {
  const { animeId: rawId } = useParams<{ animeId: string }>();
  const animeId = parseAnimeId(rawId);
  const { importImages } = useImageImport();
  const { data, isLoading, isError, error, refetch } = useAnimeDetail(animeId);

  // Dialog state
  const [formOpen, setFormOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [deletingEntry, setDeletingEntry] = useState<Entry | null>(null);

  const deleteEntry = useDeleteEntry();

  const handleOpenCreate = useCallback(() => {
    setEditingEntry(null);
    setFormOpen(true);
  }, []);

  const handleOpenEdit = useCallback((entry: Entry) => {
    setEditingEntry(entry);
    setFormOpen(true);
  }, []);

  const handleCloseForm = useCallback(() => {
    setFormOpen(false);
    setEditingEntry(null);
  }, []);

  const handleOpenDelete = useCallback((entry: Entry) => {
    setDeletingEntry(entry);
  }, []);

  const handleCloseDelete = useCallback(() => {
    setDeletingEntry(null);
  }, []);

  const handleUploadToEntry = useCallback(
    async (entryId: number) => {
      const entry = data?.entries
        ?.flatMap((e) => [e, ...(e.children ?? [])])
        .find((e) => e.id === entryId);
      const label = entry?.name || `Entry #${entryId}`;
      await importImages(entryId, label, qk.anime.detail(animeId));
    },
    [data?.entries, animeId, importImages],
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!deletingEntry) return;
    try {
      await deleteEntry.mutateAsync({
        animeId,
        entryId: deletingEntry.id,
      });
      toast.success("Entry deleted");
      setDeletingEntry(null);
    } catch (err) {
      toast.error(
        "Failed to delete entry",
        err instanceof Error ? err.message : String(err),
      );
    }
  }, [deletingEntry, deleteEntry, animeId]);

  if (isError) {
    return (
      <Box p="4" data-testid="entries-tab">
        <ErrorAlert
          title="Could not load entries"
          message={error instanceof Error ? error.message : String(error ?? "")}
          onRetry={() => {
            void refetch();
          }}
        />
      </Box>
    );
  }

  if (isLoading) {
    return (
      <Box p="4" data-testid="entries-tab-loading">
        <Stack gap="2">
          <RowSkeleton />
          <RowSkeleton />
          <RowSkeleton />
        </Stack>
      </Box>
    );
  }

  const entries = data?.entries ?? [];

  if (entries.length === 0) {
    return (
      <Box p="4" data-testid="entries-tab">
        <EmptyState
          icon={ListOrdered}
          title="No entries yet"
          description="Add a season, movie, or other entry to organise this anime's images."
          action={
            <Button
              type="button"
              size="sm"
              variant="solid"
              onClick={handleOpenCreate}
              data-testid="add-entry-empty-btn"
            >
              <Box as="span" aria-hidden="true" display="inline-flex" mr="2">
                <Plus size={14} />
              </Box>
              Add entry
            </Button>
          }
        />
        {/* Dialog is rendered even when the list is empty so the user can create. */}
        <EntryFormDialog
          key={editingEntry?.id ?? "create"}
          open={formOpen}
          onClose={handleCloseForm}
          editingEntry={editingEntry}
          animeId={animeId}
        />
      </Box>
    );
  }

  return (
    <Box p={{ base: "3", md: "4" }} data-testid="entries-tab">
      {/* Toolbar */}
      <Flex mb="3" justifyContent="flex-end">
        <Button
          type="button"
          size="sm"
          variant="solid"
          onClick={handleOpenCreate}
          data-testid="add-entry-btn"
        >
          <Box as="span" aria-hidden="true" display="inline-flex" mr="2">
            <Plus size={14} />
          </Box>
          Add entry
        </Button>
      </Flex>

      {/* Entry list */}
      <Stack as="ul" role="list" gap="2">
        {entries.map((entry) => (
          <Box key={entry.id}>
            <EntryRow
              entry={entry}
              animeId={animeId}
              depth={0}
              onEdit={handleOpenEdit}
              onDelete={handleOpenDelete}
              onUpload={handleUploadToEntry}
            />
            {entry.children && entry.children.length > 0 ? (
              <Stack as="ul" role="list" gap="2" mt="2">
                {entry.children.map((child) => (
                  <EntryRow
                    key={child.id}
                    entry={child}
                    animeId={animeId}
                    depth={1}
                    onEdit={handleOpenEdit}
                    onDelete={handleOpenDelete}
                    onUpload={handleUploadToEntry}
                  />
                ))}
              </Stack>
            ) : null}
          </Box>
        ))}
      </Stack>

      {/* Create / Edit dialog */}
      <EntryFormDialog
        key={editingEntry?.id ?? "create"}
        open={formOpen}
        onClose={handleCloseForm}
        editingEntry={editingEntry}
        animeId={animeId}
      />

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={deletingEntry !== null}
        onClose={handleCloseDelete}
        onConfirm={handleConfirmDelete}
        title="Delete entry"
        description={`Are you sure you want to delete "${deletingEntry?.name || "this entry"}" and all of its sub-entries? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
      />
    </Box>
  );
}

export default EntriesTab;
