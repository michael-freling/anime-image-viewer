import {
  Add,
  ArrowBack,
  ExpandMore,
  LocalOffer,
  Person,
} from "@mui/icons-material";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Checkbox,
  Divider,
  IconButton,
  Input,
  Modal,
  ModalClose,
  ModalDialog,
  Stack,
  Typography,
} from "@mui/joy";
import { FC, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  AnimeService,
  TagService,
  TagStat,
} from "../../../bindings/github.com/michael-freling/anime-image-viewer/internal/frontend";
import { TagFrontendService } from "../../../bindings/github.com/michael-freling/anime-image-viewer/internal/tag";
import Layout from "../../Layout";

interface TagCheckItem {
  id: number;
  name: string;
  category: string;
  /** Number of selected images that have this tag */
  count: number;
  /** true = all selected images have this tag (after edits) */
  checked: boolean;
  /** true = some (but not all) selected images have this tag, no user edit yet */
  indeterminate: boolean;
}

/**
 * Build a TagCheckItem from a Tag and the tag stats for the selected images.
 * addedTagIds/deletedTagIds reflect user edits in this session.
 */
function buildCheckItem(
  tag: { id: number; name: string; category: string },
  fileCount: number,
  tagStats: { [id: number]: TagStat } | undefined,
  addedTagIds: Set<number>,
  deletedTagIds: Set<number>
): TagCheckItem {
  let count = 0;
  if (tagStats) {
    const stat = tagStats[tag.id];
    if (stat) {
      count = stat.fileCount;
    }
  }

  const isAdded = addedTagIds.has(tag.id);
  const isDeleted = deletedTagIds.has(tag.id);

  let checked: boolean;
  let indeterminate: boolean;

  if (isAdded) {
    checked = true;
    indeterminate = false;
  } else if (isDeleted) {
    checked = false;
    indeterminate = false;
  } else {
    checked = count === fileCount && fileCount > 0;
    indeterminate = count > 0 && count < fileCount;
  }

  return {
    id: tag.id,
    name: tag.name,
    category: tag.category,
    count,
    checked,
    indeterminate,
  };
}

const AnimeTagEditPage: FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const imageIds = searchParams.getAll("imageIds").map((id) => parseInt(id));
  const animeId = parseInt(searchParams.get("animeId") ?? "0");

  // Data
  const [animeName, setAnimeName] = useState<string>("");
  const [animeCharacters, setAnimeCharacters] = useState<TagCheckItem[]>([]);
  const [animeTags, setAnimeTags] = useState<TagCheckItem[]>([]);
  const [otherTags, setOtherTags] = useState<TagCheckItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // User edits
  const [addedTagIds, setAddedTagIds] = useState<Set<number>>(new Set());
  const [deletedTagIds, setDeletedTagIds] = useState<Set<number>>(new Set());

  // Add character/tag modal
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addModalCategory, setAddModalCategory] = useState<"character" | "">("");
  const [addModalName, setAddModalName] = useState("");
  const [addModalError, setAddModalError] = useState<string | null>(null);

  const fileCount = imageIds.length;

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch all data in parallel
      const [details, allTags, tagStatsResponse] = await Promise.all([
        AnimeService.GetAnimeDetails(animeId),
        TagService.GetAll(),
        TagService.ReadTagsByFileIDs(imageIds),
      ]);

      setAnimeName(details.anime.name);
      const tagStats = tagStatsResponse.tagStats;

      // Build anime tag ID set from the details (derived + explicit)
      const animeTagIdSet = new Set<number>();
      for (const t of details.tags) {
        animeTagIdSet.add(t.id);
      }

      // Separate anime tags into characters and non-characters
      const characters: TagCheckItem[] = [];
      const animeNonCharTags: TagCheckItem[] = [];
      for (const t of details.tags) {
        const item = buildCheckItem(t, fileCount, tagStats, addedTagIds, deletedTagIds);
        if (t.category === "character") {
          characters.push(item);
        } else {
          animeNonCharTags.push(item);
        }
      }

      // Build "other tags" from allTags minus anime tags and minus characters
      const others: TagCheckItem[] = [];
      if (allTags) {
        for (const t of allTags) {
          if (animeTagIdSet.has(t.id)) continue;
          if (t.category === "character") continue;
          others.push(buildCheckItem(t, fileCount, tagStats, addedTagIds, deletedTagIds));
        }
      }

      setAnimeCharacters(characters);
      setAnimeTags(animeNonCharTags);
      setOtherTags(others);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (animeId > 0 && imageIds.length > 0) {
      loadData();
    }
  }, [animeId]);

  // Rebuild check items when addedTagIds/deletedTagIds change (without refetching)
  const rebuildCheckItems = (
    items: TagCheckItem[],
    added: Set<number>,
    deleted: Set<number>
  ): TagCheckItem[] => {
    return items.map((item) => {
      const isAdded = added.has(item.id);
      const isDeleted = deleted.has(item.id);

      if (isAdded) {
        return { ...item, checked: true, indeterminate: false };
      } else if (isDeleted) {
        return { ...item, checked: false, indeterminate: false };
      } else {
        // Restore original state based on count
        const checked = item.count === fileCount && fileCount > 0;
        const indeterminate = item.count > 0 && item.count < fileCount;
        return { ...item, checked, indeterminate };
      }
    });
  };

  const handleToggle = (tagId: number, currentlyChecked: boolean) => {
    const newAdded = new Set(addedTagIds);
    const newDeleted = new Set(deletedTagIds);

    if (currentlyChecked) {
      // User is unchecking
      newAdded.delete(tagId);
      newDeleted.add(tagId);
    } else {
      // User is checking
      newDeleted.delete(tagId);
      newAdded.add(tagId);
    }

    setAddedTagIds(newAdded);
    setDeletedTagIds(newDeleted);

    // Update all sections
    setAnimeCharacters((prev) => rebuildCheckItems(prev, newAdded, newDeleted));
    setAnimeTags((prev) => rebuildCheckItems(prev, newAdded, newDeleted));
    setOtherTags((prev) => rebuildCheckItems(prev, newAdded, newDeleted));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await TagFrontendService.BatchUpdateTagsForFiles(
        imageIds,
        Array.from(addedTagIds),
        Array.from(deletedTagIds)
      );
      navigate(-1);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  const handleAddTag = async () => {
    const name = addModalName.trim();
    if (name === "") {
      setAddModalError("Name is required");
      return;
    }
    try {
      await TagFrontendService.CreateTagForAnime(name, addModalCategory, animeId);
      setAddModalOpen(false);
      setAddModalName("");
      setAddModalError(null);
      // Reload data to include the new tag
      await loadData();
    } catch (err: unknown) {
      setAddModalError(err instanceof Error ? err.message : String(err));
    }
  };

  const renderTagCheckbox = (item: TagCheckItem) => (
    <Box
      key={item.id}
      sx={{
        display: "flex",
        alignItems: "center",
        py: 0.5,
        px: 1,
        borderRadius: "sm",
        "&:hover": { bgcolor: "neutral.softHoverBg" },
      }}
    >
      <Checkbox
        checked={item.checked}
        indeterminate={item.indeterminate}
        onChange={() => handleToggle(item.id, item.checked || item.indeterminate)}
        label={
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography level="body-sm">{item.name}</Typography>
            {item.count > 0 && (
              <Typography level="body-xs" sx={{ color: "text.tertiary" }}>
                ({item.count}/{fileCount})
              </Typography>
            )}
          </Stack>
        }
      />
    </Box>
  );

  if (animeId <= 0 || imageIds.length === 0) {
    return (
      <Layout.Main actionHeader={<Typography>Invalid parameters</Typography>}>
        <Box sx={{ p: 2 }}>
          <Typography color="danger">
            Missing animeId or imageIds in URL parameters.
          </Typography>
        </Box>
      </Layout.Main>
    );
  }

  return (
    <Layout.Main
      actionHeader={
        <>
          <IconButton onClick={() => navigate(-1)}>
            <ArrowBack />
          </IconButton>
          <Typography level="title-lg" sx={{ flex: 1 }}>
            Edit tags for {imageIds.length} image{imageIds.length === 1 ? "" : "s"}
            {animeName && ` - ${animeName}`}
          </Typography>
          <Stack direction="row" spacing={1}>
            <Button variant="plain" color="neutral" onClick={() => navigate(-1)}>
              Cancel
            </Button>
            <Button
              color="primary"
              loading={saving}
              disabled={addedTagIds.size === 0 && deletedTagIds.size === 0}
              onClick={handleSave}
            >
              Save
            </Button>
          </Stack>
        </>
      }
    >
      {error && (
        <Box sx={{ p: 2 }}>
          <Typography color="danger" level="body-md">
            {error}
          </Typography>
        </Box>
      )}

      {loading ? (
        <Box sx={{ p: 2 }}>
          <Typography>Loading...</Typography>
        </Box>
      ) : (
        <Box sx={{ p: 2, overflowY: "auto" }}>
          <Stack spacing={3}>
            {/* Section 1: Characters */}
            <Box>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <Person fontSize="small" />
                <Typography level="title-md" sx={{ flex: 1 }}>
                  Characters
                </Typography>
                <IconButton
                  size="sm"
                  variant="outlined"
                  color="primary"
                  title="Add character"
                  onClick={() => {
                    setAddModalName("");
                    setAddModalError(null);
                    setAddModalCategory("character");
                    setAddModalOpen(true);
                  }}
                >
                  <Add fontSize="small" />
                </IconButton>
              </Stack>
              {animeCharacters.length === 0 ? (
                <Typography level="body-sm" sx={{ color: "text.secondary", pl: 1 }}>
                  No characters for this anime. Click + to add one.
                </Typography>
              ) : (
                <Stack spacing={0}>
                  {animeCharacters.map(renderTagCheckbox)}
                </Stack>
              )}
            </Box>

            <Divider />

            {/* Section 2: This anime's tags */}
            <Box>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <LocalOffer fontSize="small" />
                <Typography level="title-md" sx={{ flex: 1 }}>
                  Tags ({animeName})
                </Typography>
                <IconButton
                  size="sm"
                  variant="outlined"
                  color="primary"
                  title="Add tag"
                  onClick={() => {
                    setAddModalName("");
                    setAddModalError(null);
                    setAddModalCategory("");
                    setAddModalOpen(true);
                  }}
                >
                  <Add fontSize="small" />
                </IconButton>
              </Stack>
              {animeTags.length === 0 ? (
                <Typography level="body-sm" sx={{ color: "text.secondary", pl: 1 }}>
                  No tags for this anime. Click + to add one.
                </Typography>
              ) : (
                <Stack spacing={0}>
                  {animeTags.map(renderTagCheckbox)}
                </Stack>
              )}
            </Box>

            <Divider />

            {/* Section 3: Other tags (collapsible) */}
            <Box>
              <Accordion defaultExpanded={false}>
                <AccordionSummary
                  indicator={<ExpandMore />}
                  sx={{ px: 0 }}
                >
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <LocalOffer fontSize="small" />
                    <Typography level="title-md">
                      Other tags ({otherTags.length})
                    </Typography>
                  </Stack>
                </AccordionSummary>
                <AccordionDetails>
                  {otherTags.length === 0 ? (
                    <Typography level="body-sm" sx={{ color: "text.secondary" }}>
                      No other tags available.
                    </Typography>
                  ) : (
                    <Stack spacing={0}>
                      {otherTags.map(renderTagCheckbox)}
                    </Stack>
                  )}
                </AccordionDetails>
              </Accordion>
            </Box>
          </Stack>
        </Box>
      )}

      {/* Add character/tag modal */}
      <Modal open={addModalOpen} onClose={() => setAddModalOpen(false)}>
        <ModalDialog sx={{ minWidth: 360 }}>
          <ModalClose />
          <Typography level="title-md">
            Add {addModalCategory === "character" ? "character" : "tag"}
          </Typography>
          <Stack spacing={2} sx={{ mt: 2 }}>
            <Input
              autoFocus
              placeholder={
                addModalCategory === "character" ? "Character name" : "Tag name"
              }
              value={addModalName}
              onChange={(e) => {
                setAddModalName(e.target.value);
                setAddModalError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleAddTag();
                }
              }}
            />
            {addModalError && (
              <Typography level="body-sm" color="danger">
                {addModalError}
              </Typography>
            )}
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button
                variant="plain"
                color="neutral"
                onClick={() => setAddModalOpen(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleAddTag}>Create</Button>
            </Stack>
          </Stack>
        </ModalDialog>
      </Modal>
    </Layout.Main>
  );
};

export default AnimeTagEditPage;
