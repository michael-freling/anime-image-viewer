/**
 * SeasonsTab -- list and management of seasons (seasons, movies, parts) for an
 * anime. Spec: ux-design.md section 3.2.2.
 *
 * Features:
 *   - Renders seasons with type badge, name, airing info, image count.
 *   - Clicking a row navigates to Images tab filtered to that season.
 *   - "Add season" button opens a dialog to create a new season.
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
  useCreateSeason,
  useDeleteSeason,
  useRenameSeason,
  useUpdateSeasonAiring,
  useUpdateSeasonType,
} from "../../hooks/use-season-mutations";
import { SEASON_TYPE_CONFIGS } from "../../lib/constants";
import { formatCount } from "../../lib/format";
import { toast } from "../../components/ui/toaster";
import type { Season, SeasonType } from "../../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseAnimeId(raw: string | undefined): number {
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

const SEASON_TYPE_OPTIONS: { value: SeasonType; label: string }[] = [
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
// SeasonFormDialog -- shared dialog for create and edit
// ---------------------------------------------------------------------------

interface SeasonFormState {
  name: string;
  type: SeasonType;
  seasonNumber: string; // kept as string for the input; parsed on submit
  airingSeason: string;
  airingYear: string; // kept as string for the input
}

function emptyFormState(): SeasonFormState {
  return {
    name: "",
    type: "season",
    seasonNumber: "",
    airingSeason: "",
    airingYear: "",
  };
}

function formStateFromSeason(season: Season): SeasonFormState {
  return {
    name: season.name,
    type: season.type,
    seasonNumber: season.seasonNumber != null ? String(season.seasonNumber) : "",
    airingSeason: season.airingSeason,
    airingYear: season.airingYear != null ? String(season.airingYear) : "",
  };
}

interface SeasonFormDialogProps {
  open: boolean;
  onClose: () => void;
  /** When set we are editing; when null we are creating. */
  editingSeason: Season | null;
  animeId: number;
}

function SeasonFormDialog({
  open,
  onClose,
  editingSeason,
  animeId,
}: SeasonFormDialogProps): JSX.Element {
  const isEdit = editingSeason !== null;
  const [form, setForm] = useState<SeasonFormState>(
    isEdit ? formStateFromSeason(editingSeason) : emptyFormState(),
  );
  const [saving, setSaving] = useState(false);

  const createSeason = useCreateSeason();
  const renameSeason = useRenameSeason();
  const updateType = useUpdateSeasonType();
  const updateAiring = useUpdateSeasonAiring();

  // Reset form state when the dialog opens or the season changes.
  useEffect(() => {
    if (open) {
      setForm(isEdit ? formStateFromSeason(editingSeason) : emptyFormState());
      setSaving(false);
    }
  }, [open, editingSeason, isEdit]);

  const handleChange = (field: keyof SeasonFormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    try {
      setSaving(true);
      const parsedNumber = form.seasonNumber
        ? Number(form.seasonNumber)
        : null;
      const parsedYear = form.airingYear ? Number(form.airingYear) : 0;

      if (isEdit) {
        // Fire parallel updates for the fields that changed.
        const promises: Promise<void>[] = [];
        if (form.name !== editingSeason.name) {
          promises.push(
            renameSeason.mutateAsync({
              animeId,
              seasonId: editingSeason.id,
              newName: form.name,
            }),
          );
        }
        if (
          form.type !== editingSeason.type ||
          parsedNumber !== editingSeason.seasonNumber
        ) {
          promises.push(
            updateType.mutateAsync({
              animeId,
              seasonId: editingSeason.id,
              seasonType: form.type,
              seasonNumber: parsedNumber,
            }),
          );
        }
        if (
          form.airingSeason !== editingSeason.airingSeason ||
          parsedYear !== (editingSeason.airingYear ?? 0)
        ) {
          promises.push(
            updateAiring.mutateAsync({
              animeId,
              seasonId: editingSeason.id,
              airingSeason: form.airingSeason,
              airingYear: parsedYear,
            }),
          );
        }
        await Promise.all(promises);
        toast.success("Season updated");
      } else {
        await createSeason.mutateAsync({
          animeId,
          seasonType: form.type,
          seasonNumber: parsedNumber,
          displayName: form.name,
        });
        toast.success("Season created");
      }
      onClose();
    } catch (err) {
      toast.error(
        isEdit ? "Failed to update season" : "Failed to create season",
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
            data-testid="season-form-dialog"
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
                {isEdit ? "Edit season" : "Add season"}
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
                    data-testid="season-form-type"
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
                    {SEASON_TYPE_OPTIONS.map((opt) => (
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
                    data-testid="season-form-name"
                    size="sm"
                    value={form.name}
                    onChange={(e) => handleChange("name", e.target.value)}
                    placeholder="e.g. Season 1, The Movie"
                  />
                </Box>

                {/* Season number */}
                <Box>
                  <Text fontSize="xs" fontWeight="600" color="fg.secondary" mb="1">
                    Number
                  </Text>
                  <Input
                    data-testid="season-form-number"
                    size="sm"
                    type="number"
                    value={form.seasonNumber}
                    onChange={(e) => handleChange("seasonNumber", e.target.value)}
                    placeholder="e.g. 1, 2, 3"
                  />
                </Box>

                {/* Airing season */}
                <Box>
                  <Text fontSize="xs" fontWeight="600" color="fg.secondary" mb="1">
                    Airing season
                  </Text>
                  <select
                    data-testid="season-form-airing-season"
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
                    data-testid="season-form-airing-year"
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
                data-testid="season-form-cancel"
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
                data-testid="season-form-submit"
              >
                {isEdit ? "Save" : "Add season"}
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

// ---------------------------------------------------------------------------
// SeasonRow -- a single row in the season list
// ---------------------------------------------------------------------------

function SeasonRow({
  season,
  animeId,
  depth,
  onEdit,
  onDelete,
  onUpload,
}: {
  season: Season;
  animeId: number;
  depth: number;
  onEdit: (season: Season) => void;
  onDelete: (season: Season) => void;
  onUpload: (seasonId: number) => void;
}): JSX.Element {
  const navigate = useNavigate();
  const config = SEASON_TYPE_CONFIGS[season.type] ?? SEASON_TYPE_CONFIGS.other;
  const airing = [season.airingSeason, season.airingYear]
    .filter(Boolean)
    .join(" ");

  const handleNavigate = useCallback(() => {
    navigate(`/search?anime=${animeId}&season=${season.id}`);
  }, [navigate, animeId, season.id]);

  return (
    <Box
      data-testid="season-row"
      data-season-id={season.id}
      data-season-type={season.type}
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
            data-testid="season-row-badge"
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
              {season.name ||
                `${config.label} ${season.seasonNumber ?? ""}`.trim()}
            </Text>
            <Flex gap="3" mt="1" fontSize="xs" color="fg.secondary">
              {airing && <Text>{airing}</Text>}
              <Text>{formatCount(season.imageCount, "image", "images")}</Text>
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
            aria-label={`Upload images to ${season.name || "season"}`}
            data-testid="season-upload-btn"
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              onUpload(season.id);
            }}
          >
            <Upload size={14} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            aria-label={`Edit ${season.name || "season"}`}
            data-testid="season-edit-btn"
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              onEdit(season);
            }}
          >
            <Pencil size={14} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            color="danger"
            aria-label={`Delete ${season.name || "season"}`}
            data-testid="season-delete-btn"
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              onDelete(season);
            }}
          >
            <Trash2 size={14} />
          </Button>
        </Flex>
      </Box>
      {season.children && season.children.length > 0 ? (
        <Stack as="ul" role="list" gap="2" mt="2">
          {season.children.map((child) => (
            <SeasonRow
              key={child.id}
              season={child}
              animeId={animeId}
              depth={depth + 1}
              onEdit={onEdit}
              onDelete={onDelete}
              onUpload={onUpload}
            />
          ))}
        </Stack>
      ) : null}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// SeasonsTab -- main component
// ---------------------------------------------------------------------------

export function SeasonsTab(): JSX.Element {
  const { animeId: rawId } = useParams<{ animeId: string }>();
  const animeId = parseAnimeId(rawId);
  const { importImages } = useImageImport();
  const { data, isLoading, isError, error, refetch } = useAnimeDetail(animeId);

  // Dialog state
  const [formOpen, setFormOpen] = useState(false);
  const [editingSeason, setEditingSeason] = useState<Season | null>(null);
  const [deletingSeason, setDeletingSeason] = useState<Season | null>(null);

  const deleteSeason = useDeleteSeason();

  const handleOpenCreate = useCallback(() => {
    setEditingSeason(null);
    setFormOpen(true);
  }, []);

  const handleOpenEdit = useCallback((season: Season) => {
    setEditingSeason(season);
    setFormOpen(true);
  }, []);

  const handleCloseForm = useCallback(() => {
    setFormOpen(false);
    setEditingSeason(null);
  }, []);

  const handleOpenDelete = useCallback((season: Season) => {
    setDeletingSeason(season);
  }, []);

  const handleCloseDelete = useCallback(() => {
    setDeletingSeason(null);
  }, []);

  const handleUploadToSeason = useCallback(
    async (seasonId: number) => {
      const flattenSeasons = (list: Season[]): Season[] =>
        list.flatMap((s) => [s, ...flattenSeasons(s.children ?? [])]);
      const season = flattenSeasons(data?.seasons ?? []).find(
        (s) => s.id === seasonId,
      );
      const label = season?.name || `Season #${seasonId}`;
      await importImages(seasonId, label, qk.anime.detail(animeId));
    },
    [data?.seasons, animeId, importImages],
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!deletingSeason) return;
    try {
      await deleteSeason.mutateAsync({
        animeId,
        seasonId: deletingSeason.id,
      });
      toast.success("Season deleted");
      setDeletingSeason(null);
    } catch (err) {
      toast.error(
        "Failed to delete season",
        err instanceof Error ? err.message : String(err),
      );
    }
  }, [deletingSeason, deleteSeason, animeId]);

  if (isError) {
    return (
      <Box p="4" data-testid="seasons-tab">
        <ErrorAlert
          title="Could not load seasons"
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
      <Box p="4" data-testid="seasons-tab-loading">
        <Stack gap="2">
          <RowSkeleton />
          <RowSkeleton />
          <RowSkeleton />
        </Stack>
      </Box>
    );
  }

  const seasons = data?.seasons ?? [];

  if (seasons.length === 0) {
    return (
      <Box p="4" data-testid="seasons-tab">
        <EmptyState
          icon={ListOrdered}
          title="No seasons yet"
          description="Add a season, movie, or other season to organise this anime's images."
          action={
            <Button
              type="button"
              size="sm"
              variant="solid"
              onClick={handleOpenCreate}
              data-testid="add-season-empty-btn"
            >
              <Box as="span" aria-hidden="true" display="inline-flex" mr="2">
                <Plus size={14} />
              </Box>
              Add season
            </Button>
          }
        />
        {/* Dialog is rendered even when the list is empty so the user can create. */}
        <SeasonFormDialog
          key={editingSeason?.id ?? "create"}
          open={formOpen}
          onClose={handleCloseForm}
          editingSeason={editingSeason}
          animeId={animeId}
        />
      </Box>
    );
  }

  return (
    <Box p={{ base: "3", md: "4" }} data-testid="seasons-tab">
      {/* Toolbar */}
      <Flex mb="3" justifyContent="flex-end">
        <Button
          type="button"
          size="sm"
          variant="solid"
          onClick={handleOpenCreate}
          data-testid="add-season-btn"
        >
          <Box as="span" aria-hidden="true" display="inline-flex" mr="2">
            <Plus size={14} />
          </Box>
          Add season
        </Button>
      </Flex>

      {/* Season list */}
      <Stack as="ul" role="list" gap="2">
        {seasons.map((season) => (
          <SeasonRow
            key={season.id}
            season={season}
            animeId={animeId}
            depth={0}
            onEdit={handleOpenEdit}
            onDelete={handleOpenDelete}
            onUpload={handleUploadToSeason}
          />
        ))}
      </Stack>

      {/* Create / Edit dialog */}
      <SeasonFormDialog
        key={editingSeason?.id ?? "create"}
        open={formOpen}
        onClose={handleCloseForm}
        editingSeason={editingSeason}
        animeId={animeId}
      />

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={deletingSeason !== null}
        onClose={handleCloseDelete}
        onConfirm={handleConfirmDelete}
        title="Delete season"
        description={`Are you sure you want to delete "${deletingSeason?.name || "this season"}" and all of its sub-seasons? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
      />
    </Box>
  );
}

export default SeasonsTab;
