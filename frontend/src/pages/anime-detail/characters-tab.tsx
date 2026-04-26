/**
 * CharactersTab — characters (tags with category="character") for this anime.
 *
 * Characters are stored as regular tags with `category: "character"`. They
 * are fetched via `useAnimeDetail` (same as the Tags tab) and filtered by
 * category. Each character card shows the name, image count, and actions
 * to search images, edit, or convert back to a regular tag.
 */
import { Box, Button, Flex, IconButton, SimpleGrid, Text, chakra } from "@chakra-ui/react";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Tag as TagIcon, UserPlus, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";

import { fileResizeUrl, fileResizeSrcSet } from "../../lib/image-urls";
import { EmptyState } from "../../components/shared/empty-state";
import { ErrorAlert } from "../../components/shared/error-alert";
import { RowSkeleton } from "../../components/shared/loading-skeleton";
import { SearchBar } from "../../components/shared/search-bar";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { toast } from "../../components/ui/toaster";
import { useAnimeDetail } from "../../hooks/use-anime-detail";
import { tagCategoryKey } from "../../lib/constants";
import { qk } from "../../lib/query-keys";
import type { AnimeDerivedTag } from "../../types";
import { TagDialog } from "../tags/tag-dialog";
import type { TagFormValues } from "../tags/tag-form";
import { updateTag } from "../tags/tag-mutations";

function parseAnimeId(raw: string | undefined): number {
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

interface EditDialogState {
  open: boolean;
  editing: AnimeDerivedTag | null;
  values: TagFormValues;
  error: string | null;
  submitting: boolean;
}

const INITIAL_EDIT: EditDialogState = {
  open: false,
  editing: null,
  values: { name: "", category: "character", parentId: null },
  error: null,
  submitting: false,
};

const CardButton = chakra("button");

function CharacterCard({
  character,
  onEdit,
  onSearch,
  onConvertToTag,
}: {
  character: AnimeDerivedTag;
  onEdit: () => void;
  onSearch: () => void;
  onConvertToTag: () => void;
}): JSX.Element {
  return (
    <CardButton
      type="button"
      onClick={onSearch}
      data-testid="character-card"
      data-character-id={character.id}
      borderWidth="1px"
      borderColor="border"
      borderRadius="md"
      overflow="hidden"
      bg="bg.surface"
      display="flex"
      flexDirection="column"
      cursor="pointer"
      textAlign="left"
      p="0"
      _hover={{ transform: "scale(1.02)", boxShadow: "0 0 0 2px var(--chakra-colors-primary)" }}
      _active={{ transform: "scale(0.98)" }}
      _focusVisible={{ outline: "2px solid", outlineColor: "primary", outlineOffset: "2px" }}
      transition="transform 0.15s ease-out, box-shadow 0.15s ease-out"
    >
      <Box
        aspectRatio="1 / 1"
        bg="bg.surfaceAlt"
        color="fg.muted"
        display="flex"
        alignItems="center"
        justifyContent="center"
        overflow="hidden"
      >
        {character.thumbnailPath ? (
          <chakra.img
            src={fileResizeUrl(character.thumbnailPath, 520)}
            srcSet={fileResizeSrcSet(character.thumbnailPath)}
            sizes="(min-width: 1024px) 20vw, (min-width: 640px) 33vw, 50vw"
            alt={character.name}
            width="100%"
            height="100%"
            objectFit="cover"
            loading="lazy"
          />
        ) : (
          <Users size={32} aria-hidden="true" />
        )}
      </Box>
      <Box p="3">
        <Text fontSize="sm" fontWeight="600" color="fg" lineClamp={1}>
          {character.name}
        </Text>
        <Text fontSize="xs" color="fg.muted" mt="1">
          {character.imageCount} image{character.imageCount === 1 ? "" : "s"}
        </Text>
        <Flex mt="2" gap="1">
          <IconButton
            type="button"
            size="xs"
            variant="ghost"
            aria-label={`Edit ${character.name}`}
            data-testid="character-card-edit"
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            color="fg.secondary"
            _hover={{ color: "fg", bg: "bg.surfaceAlt" }}
          >
            <Pencil size={12} aria-hidden="true" />
          </IconButton>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            data-testid="character-card-convert"
            onClick={(e) => {
              e.stopPropagation();
              onConvertToTag();
            }}
            color="fg.secondary"
            _hover={{ color: "fg", bg: "bg.surfaceAlt" }}
            fontSize="xs"
          >
            <TagIcon size={12} aria-hidden="true" />
            Move to Tags
          </Button>
        </Flex>
      </Box>
    </CardButton>
  );
}

export function CharactersTab(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { animeId: rawId } = useParams<{ animeId: string }>();
  const animeId = parseAnimeId(rawId);
  const { data, isLoading, isError, error, refetch } = useAnimeDetail(animeId);

  const characters = useMemo(
    () =>
      (data?.tags ?? []).filter(
        (t) => tagCategoryKey(t.category) === "character",
      ),
    [data],
  );

  const [filter, setFilter] = useState("");
  const [dialog, setDialog] = useState<EditDialogState>(INITIAL_EDIT);
  const [confirmTarget, setConfirmTarget] = useState<AnimeDerivedTag | null>(null);

  const filtered =
    filter.trim().length === 0
      ? characters
      : characters.filter((c) =>
          c.name.toLowerCase().includes(filter.trim().toLowerCase()),
        );

  const openEdit = (t: AnimeDerivedTag) => {
    setDialog({
      open: true,
      editing: t,
      values: {
        name: t.name,
        category: tagCategoryKey(t.category),
        parentId: null,
      },
      error: null,
      submitting: false,
    });
  };

  const closeEdit = () => setDialog(INITIAL_EDIT);

  const submitEdit = async () => {
    if (!dialog.editing) return;
    const values = dialog.values;
    if (values.name.trim() === "") {
      setDialog((s) => ({ ...s, error: "Name is required." }));
      return;
    }
    setDialog((s) => ({ ...s, submitting: true, error: null }));
    try {
      await updateTag(dialog.editing.id, {
        name: values.name.trim(),
        category: values.category,
        parentId: values.parentId ?? undefined,
      });
      toast.success("Character updated", `"${values.name.trim()}" saved.`);
      await queryClient.invalidateQueries({ queryKey: qk.tags.list() });
      await queryClient.invalidateQueries({
        queryKey: qk.anime.detail(animeId),
      });
      closeEdit();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setDialog((s) => ({ ...s, submitting: false, error: message }));
      toast.error("Could not save", message);
    }
  };

  const convertToTag = async (t: AnimeDerivedTag) => {
    try {
      await updateTag(t.id, { name: t.name, category: "uncategorized" });
      toast.success("Moved to Tags", `"${t.name}" is now a regular tag.`);
      await queryClient.invalidateQueries({ queryKey: qk.tags.list() });
      await queryClient.invalidateQueries({
        queryKey: qk.anime.detail(animeId),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error("Could not move", message);
    }
  };

  if (isError) {
    return (
      <Box p="4" data-testid="characters-tab">
        <ErrorAlert
          title="Could not load characters"
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
      <Box p="4" data-testid="characters-tab-loading">
        <RowSkeleton lines={3} />
      </Box>
    );
  }

  if (characters.length === 0) {
    return (
      <Box p="4" data-testid="characters-tab">
        <EmptyState
          icon={Users}
          title="No characters yet"
          description="Convert a tag to a character on the Tags tab, or import from AniList."
          action={
            <Button
              type="button"
              size="sm"
              variant="solid"
              onClick={() => navigate("../tags", { relative: "path" })}
              data-testid="characters-tab-go-tags"
            >
              <Box as="span" aria-hidden="true" display="inline-flex" mr="2">
                <UserPlus size={14} />
              </Box>
              Go to Tags
            </Button>
          }
        />
      </Box>
    );
  }

  return (
    <Box data-testid="characters-tab" p={{ base: "3", md: "4" }}>
      <Flex gap="3" mb="4" direction={{ base: "column", md: "row" }}>
        <Box flex="1">
          <SearchBar
            value={filter}
            onChange={setFilter}
            placeholder="Search characters"
            size="md"
          />
        </Box>
      </Flex>
      <SimpleGrid
        columns={{ base: 2, sm: 3, md: 4, lg: 5 }}
        gap="3"
        data-testid="characters-grid"
      >
        {filtered.map((character) => (
          <CharacterCard
            key={character.id}
            character={character}
            onEdit={() => openEdit(character)}
            onSearch={() => navigate(`/search?tag=${character.id}&anime=${animeId}`)}
            onConvertToTag={() => setConfirmTarget(character)}
          />
        ))}
      </SimpleGrid>

      <TagDialog
        open={dialog.open}
        onClose={closeEdit}
        title={
          dialog.editing
            ? `Edit character — ${dialog.editing.name}`
            : "Edit character"
        }
        values={dialog.values}
        onChange={(values) => setDialog((s) => ({ ...s, values }))}
        parentOptions={[]}
        submitLabel="Save"
        onSubmit={submitEdit}
        submitting={dialog.submitting}
        error={dialog.error}
      />

      <ConfirmDialog
        open={confirmTarget !== null}
        onClose={() => setConfirmTarget(null)}
        onConfirm={async () => {
          if (confirmTarget) {
            await convertToTag(confirmTarget);
            setConfirmTarget(null);
          }
        }}
        title="Move to Tags?"
        description={`"${confirmTarget?.name ?? ""}" will be removed from Characters and appear in Tags.`}
        confirmLabel="Move to Tags"
      />
    </Box>
  );
}

export default CharactersTab;
