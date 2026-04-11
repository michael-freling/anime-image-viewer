import {
  Add,
  ArrowBack,
  Delete,
  Edit,
  LocalOffer,
  MoreVert,
  Person,
} from "@mui/icons-material";
import {
  Box,
  Button,
  Chip,
  Dropdown,
  IconButton,
  Input,
  ListItemDecorator,
  Menu,
  MenuButton,
  MenuItem,
  Modal,
  ModalClose,
  ModalDialog,
  Stack,
  Typography,
} from "@mui/joy";
import { FC, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import {
  AnimeDetailsResponse,
  AnimeEntryInfo,
  AnimeService,
  BatchImportImageService,
  Image,
} from "../../../bindings/github.com/michael-freling/anime-image-viewer/internal/frontend";
import { TagFrontendService } from "../../../bindings/github.com/michael-freling/anime-image-viewer/internal/tag";
import ImageListMain from "../../components/Images/ImageList";
import Layout from "../../Layout";
import EntryList from "./EntryList";
import AddEntryModal from "./AddEntryModal";

const AnimeDetailPage: FC = () => {
  const { animeId } = useParams<{ animeId: string }>();
  const navigate = useNavigate();
  const [details, setDetails] = useState<AnimeDetailsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);

  // Generic tag management state (shared by characters and uncategorized tags)
  const [addTagOpen, setAddTagOpen] = useState(false);
  const [addTagName, setAddTagName] = useState("");
  const [addTagError, setAddTagError] = useState<string | null>(null);
  const [addTagCategory, setAddTagCategory] = useState<"character" | "">("");
  const [renameTagOpen, setRenameTagOpen] = useState(false);
  const [renameTagId, setRenameTagId] = useState<number>(0);
  const [renameTagValue, setRenameTagValue] = useState("");
  const [renameTagError, setRenameTagError] = useState<string | null>(null);
  const [renameTagCategory, setRenameTagCategory] = useState<"character" | "">(
    ""
  );
  const [deleteTagOpen, setDeleteTagOpen] = useState(false);
  const [deleteTagId, setDeleteTagId] = useState<number>(0);
  const [deleteTagName, setDeleteTagName] = useState("");
  const [deleteTagImageCount, setDeleteTagImageCount] = useState<number>(0);
  const [deleteTagCategory, setDeleteTagCategory] = useState<"character" | "">(
    ""
  );

  // Entry state
  const [entries, setEntries] = useState<AnimeEntryInfo[]>([]);
  const [totalImageCount, setTotalImageCount] = useState(0);
  const [selectedEntryId, setSelectedEntryId] = useState<number | null>(null);
  const [addEntryOpen, setAddEntryOpen] = useState(false);
  const [nextSeasonNumber, setNextSeasonNumber] = useState(1);

  // Sub-entry modal state
  const [subEntryOpen, setSubEntryOpen] = useState(false);
  const [subEntryParentId, setSubEntryParentId] = useState<number>(0);
  const [subEntryName, setSubEntryName] = useState("");
  const [subEntryError, setSubEntryError] = useState<string | null>(null);

  // Rename entry modal state
  const [renameEntryOpen, setRenameEntryOpen] = useState(false);
  const [renameEntryId, setRenameEntryId] = useState(0);
  const [renameEntryName, setRenameEntryName] = useState("");
  const [renameEntryError, setRenameEntryError] = useState<string | null>(null);

  // Delete entry modal state
  const [deleteEntryOpen, setDeleteEntryOpen] = useState(false);
  const [deleteEntryId, setDeleteEntryId] = useState(0);
  const [deleteEntryName, setDeleteEntryName] = useState("");

  // Folder image panel state
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [folderImages, setFolderImages] = useState<Image[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();

  // Tag filtering state
  const [selectedTagIds, setSelectedTagIds] = useState<Set<number>>(new Set());
  const [imageTagMap, setImageTagMap] = useState<Record<number, number[]>>({});

  const id = animeId != null ? Number(animeId) : NaN;

  const load = async () => {
    if (!Number.isFinite(id) || id <= 0) {
      setError("Invalid anime id");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await AnimeService.GetAnimeDetails(id);
      setDetails(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const loadEntries = async () => {
    if (!Number.isFinite(id) || id <= 0) return;
    try {
      const entryList = await AnimeService.GetAnimeEntries(id);
      setEntries(entryList);
      // Compute total image count from entries
      const total = entryList.reduce((sum, e) => {
        const childSum = e.children
          ? e.children.reduce((cs, c) => cs + c.imageCount, 0)
          : 0;
        return sum + e.imageCount + childSum;
      }, 0);
      setTotalImageCount(total);

      const nextNum = await AnimeService.GetNextEntryNumber(id, "season");
      setNextSeasonNumber(nextNum);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    load();
    loadEntries();
  }, [animeId]);

  // Auto-load all anime images when details are available
  useEffect(() => {
    if (details?.folderTree != null) {
      loadAllAnimeImages();
    }
  }, [details]);

  const handleRename = async () => {
    const trimmed = renameValue.trim();
    if (trimmed === "") {
      setRenameError("Name is required");
      return;
    }
    try {
      await AnimeService.RenameAnime(id, trimmed);
      setRenameOpen(false);
      setRenameError(null);
      await load();
    } catch (err: unknown) {
      setRenameError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDelete = async () => {
    if (
      !confirm(
        "Delete this anime? The folder and all its contents will also be removed."
      )
    ) {
      return;
    }
    try {
      await AnimeService.DeleteAnime(id);
      navigate("/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleUploadImages = async (folderId: number) => {
    try {
      await BatchImportImageService.ImportImages(folderId);
      await load();
      await loadEntries();
      // Refresh folder images if the uploaded folder is currently selected
      if (selectedFolderId === folderId) {
        loadFolderImages(folderId);
      } else if (selectedEntryId === folderId) {
        loadFolderImages(folderId);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const categoryLabel = (category: "character" | "") =>
    category === "character" ? "character" : "tag";

  const handleAddTag = async () => {
    const name = addTagName.trim();
    if (name === "") {
      setAddTagError("Name is required");
      return;
    }
    try {
      // Set anime_id so the tag always shows on this anime
      await TagFrontendService.CreateTagForAnime(name, addTagCategory, id);
      setAddTagOpen(false);
      setAddTagName("");
      setAddTagError(null);
      await load();
    } catch (err: unknown) {
      setAddTagError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleRenameTag = async () => {
    const name = renameTagValue.trim();
    if (name === "") {
      setRenameTagError("Name is required");
      return;
    }
    try {
      await TagFrontendService.UpdateName(renameTagId, name);
      setRenameTagOpen(false);
      setRenameTagError(null);
      await load();
    } catch (err: unknown) {
      setRenameTagError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDeleteTag = async (
    tagId: number,
    tagName: string,
    category: "character" | ""
  ) => {
    try {
      const count = await TagFrontendService.GetTagFileCount(tagId);
      if (count > 0) {
        setDeleteTagId(tagId);
        setDeleteTagName(tagName);
        setDeleteTagImageCount(count);
        setDeleteTagCategory(category);
        setDeleteTagOpen(true);
      } else {
        await TagFrontendService.DeleteTag(tagId);
        await load();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleConfirmDeleteTag = async () => {
    try {
      await TagFrontendService.DeleteTag(deleteTagId);
      setDeleteTagOpen(false);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const loadFolderImages = async (folderId: number) => {
    try {
      const resp = await AnimeService.GetFolderImages(folderId, true);
      const images = resp.images ?? [];
      setFolderImages(images);
      // Fetch tag mapping for loaded images
      if (images.length > 0) {
        const tagMap = await AnimeService.GetImageTagIDs(
          images.map((img) => img.id)
        );
        setImageTagMap(tagMap ?? {});
      } else {
        setImageTagMap({});
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setFolderImages([]);
      setImageTagMap({});
    }
  };

  const loadAllAnimeImages = async () => {
    if (details?.folderTree == null) {
      return;
    }
    const rootFolderId = details.folderTree.id;
    await loadFolderImages(rootFolderId);
  };

  // Entry selection handler
  const handleSelectEntry = (entryId: number | null) => {
    if (entryId === null || entryId === selectedEntryId) {
      // Deselect entry - load all anime images
      setSelectedEntryId(null);
      setSelectedFolderId(null);
      setSelectedTagIds(new Set());
      loadAllAnimeImages();
      return;
    }
    setSelectedEntryId(entryId);
    // Entries are folders, so selecting an entry is like selecting a folder
    setSelectedFolderId(entryId);
    setSelectedTagIds(new Set());
    loadFolderImages(entryId);
  };

  // Add entry handler
  const handleAddEntry = async (
    entryType: string,
    entryNumber: number | null,
    displayName: string
  ) => {
    await AnimeService.CreateAnimeEntry(id, entryType, entryNumber, displayName);
    await load();
    await loadEntries();
  };

  // Add sub-entry handler
  const handleAddSubEntry = (parentId: number) => {
    setSubEntryParentId(parentId);
    setSubEntryName("");
    setSubEntryError(null);
    setSubEntryOpen(true);
  };

  const handleCreateSubEntry = async () => {
    const name = subEntryName.trim();
    if (name === "") {
      setSubEntryError("Name is required");
      return;
    }
    try {
      await AnimeService.CreateSubEntry(subEntryParentId, name);
      setSubEntryOpen(false);
      await load();
      await loadEntries();
    } catch (err: unknown) {
      setSubEntryError(err instanceof Error ? err.message : String(err));
    }
  };

  // Rename entry handler
  const handleRenameEntry = async () => {
    const name = renameEntryName.trim();
    if (name === "") {
      setRenameEntryError("Name is required");
      return;
    }
    try {
      await AnimeService.RenameEntry(renameEntryId, name);
      setRenameEntryOpen(false);
      setRenameEntryError(null);
      await load();
      await loadEntries();
    } catch (err: unknown) {
      setRenameEntryError(err instanceof Error ? err.message : String(err));
    }
  };

  // Delete entry handler
  const handleDeleteEntry = async () => {
    try {
      await AnimeService.DeleteEntry(deleteEntryId);
      setDeleteEntryOpen(false);
      // If the deleted entry was selected, clear selection
      if (selectedEntryId === deleteEntryId) {
        setSelectedEntryId(null);
        setSelectedFolderId(null);
        loadAllAnimeImages();
      }
      await load();
      await loadEntries();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleToggleTag = (tagId: number) => {
    setSelectedTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) {
        next.delete(tagId);
      } else {
        next.add(tagId);
      }
      return next;
    });
  };

  // Filter images by selected tags (AND logic: image must have ALL selected tags)
  const filteredImages = useMemo(() => {
    if (selectedTagIds.size === 0) {
      return folderImages;
    }
    return folderImages.filter((img) => {
      const tags = imageTagMap[img.id] ?? [];
      return [...selectedTagIds].every((tagId) => tags.includes(tagId));
    });
  }, [folderImages, selectedTagIds, imageTagMap]);

  const actionHeader = (
    <>
      <IconButton onClick={() => navigate("/")}>
        <ArrowBack />
      </IconButton>
      <Typography level="title-lg" sx={{ flex: 1 }}>
        {details?.anime.name ?? "Anime"}
      </Typography>
      {details != null && (
        <>
          <Button
            variant="outlined"
            startDecorator={<Edit />}
            onClick={() => {
              setRenameValue(details.anime.name);
              setRenameError(null);
              setRenameOpen(true);
            }}
          >
            Rename
          </Button>
          <Button
            variant="outlined"
            color="danger"
            startDecorator={<Delete />}
            onClick={handleDelete}
          >
            Delete
          </Button>
        </>
      )}
    </>
  );

  const modals = (
    <>
      {/* Rename anime modal */}
      <Modal open={renameOpen} onClose={() => setRenameOpen(false)}>
        <ModalDialog sx={{ minWidth: 360 }}>
          <ModalClose />
          <Typography level="title-md">Rename anime</Typography>
          <Stack spacing={2} sx={{ mt: 2 }}>
            <Input
              autoFocus
              value={renameValue}
              onChange={(e) => {
                setRenameValue(e.target.value);
                setRenameError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleRename();
                }
              }}
            />
            {renameError && (
              <Typography level="body-sm" color="danger">
                {renameError}
              </Typography>
            )}
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button
                variant="plain"
                color="neutral"
                onClick={() => setRenameOpen(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleRename}>Save</Button>
            </Stack>
          </Stack>
        </ModalDialog>
      </Modal>

      {/* Add sub-entry modal */}
      <Modal open={subEntryOpen} onClose={() => setSubEntryOpen(false)}>
        <ModalDialog sx={{ minWidth: 360 }}>
          <ModalClose />
          <Typography level="title-md">Add sub-entry</Typography>
          <Stack spacing={2} sx={{ mt: 2 }}>
            <Input
              autoFocus
              placeholder="Name"
              value={subEntryName}
              onChange={(e) => {
                setSubEntryName(e.target.value);
                setSubEntryError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleCreateSubEntry();
                }
              }}
            />
            {subEntryError && (
              <Typography level="body-sm" color="danger">
                {subEntryError}
              </Typography>
            )}
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button
                variant="plain"
                color="neutral"
                onClick={() => setSubEntryOpen(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleCreateSubEntry}>Create</Button>
            </Stack>
          </Stack>
        </ModalDialog>
      </Modal>

      {/* Add entry modal */}
      <AddEntryModal
        open={addEntryOpen}
        onClose={() => setAddEntryOpen(false)}
        onSubmit={handleAddEntry}
        nextSeasonNumber={nextSeasonNumber}
      />

      {/* Rename entry modal */}
      <Modal
        open={renameEntryOpen}
        onClose={() => setRenameEntryOpen(false)}
      >
        <ModalDialog sx={{ minWidth: 360 }}>
          <ModalClose />
          <Typography level="title-md">Rename entry</Typography>
          <Stack spacing={2} sx={{ mt: 2 }}>
            <Input
              autoFocus
              value={renameEntryName}
              onChange={(e) => {
                setRenameEntryName(e.target.value);
                setRenameEntryError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleRenameEntry();
                }
              }}
            />
            {renameEntryError && (
              <Typography level="body-sm" color="danger">
                {renameEntryError}
              </Typography>
            )}
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button
                variant="plain"
                color="neutral"
                onClick={() => setRenameEntryOpen(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleRenameEntry}>Save</Button>
            </Stack>
          </Stack>
        </ModalDialog>
      </Modal>

      {/* Delete entry confirmation modal */}
      <Modal
        open={deleteEntryOpen}
        onClose={() => setDeleteEntryOpen(false)}
      >
        <ModalDialog sx={{ minWidth: 360 }}>
          <ModalClose />
          <Typography level="title-md">Delete entry</Typography>
          <Typography level="body-md" sx={{ mt: 2 }}>
            Delete &quot;{deleteEntryName}&quot; and all its images?
          </Typography>
          <Stack
            direction="row"
            spacing={1}
            justifyContent="flex-end"
            sx={{ mt: 2 }}
          >
            <Button
              variant="plain"
              color="neutral"
              onClick={() => setDeleteEntryOpen(false)}
            >
              Cancel
            </Button>
            <Button color="danger" onClick={handleDeleteEntry}>
              Delete
            </Button>
          </Stack>
        </ModalDialog>
      </Modal>

      {/* Add tag/character modal */}
      <Modal open={addTagOpen} onClose={() => setAddTagOpen(false)}>
        <ModalDialog sx={{ minWidth: 360 }}>
          <ModalClose />
          <Typography level="title-md">
            Add {categoryLabel(addTagCategory)}
          </Typography>
          <Stack spacing={2} sx={{ mt: 2 }}>
            <Input
              autoFocus
              placeholder={
                addTagCategory === "character" ? "Character name" : "Tag name"
              }
              value={addTagName}
              onChange={(e) => {
                setAddTagName(e.target.value);
                setAddTagError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleAddTag();
                }
              }}
            />
            {addTagError && (
              <Typography level="body-sm" color="danger">
                {addTagError}
              </Typography>
            )}
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button
                variant="plain"
                color="neutral"
                onClick={() => setAddTagOpen(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleAddTag}>Create</Button>
            </Stack>
          </Stack>
        </ModalDialog>
      </Modal>

      {/* Rename tag/character modal */}
      <Modal open={renameTagOpen} onClose={() => setRenameTagOpen(false)}>
        <ModalDialog sx={{ minWidth: 360 }}>
          <ModalClose />
          <Typography level="title-md">
            Rename {categoryLabel(renameTagCategory)}
          </Typography>
          <Stack spacing={2} sx={{ mt: 2 }}>
            <Input
              autoFocus
              value={renameTagValue}
              onChange={(e) => {
                setRenameTagValue(e.target.value);
                setRenameTagError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleRenameTag();
                }
              }}
            />
            {renameTagError && (
              <Typography level="body-sm" color="danger">
                {renameTagError}
              </Typography>
            )}
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button
                variant="plain"
                color="neutral"
                onClick={() => setRenameTagOpen(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleRenameTag}>Save</Button>
            </Stack>
          </Stack>
        </ModalDialog>
      </Modal>

      {/* Delete tag/character confirmation modal */}
      <Modal open={deleteTagOpen} onClose={() => setDeleteTagOpen(false)}>
        <ModalDialog sx={{ minWidth: 360 }}>
          <ModalClose />
          <Typography level="title-md">
            Delete {categoryLabel(deleteTagCategory)}
          </Typography>
          <Typography level="body-md" sx={{ mt: 2 }}>
            &quot;{deleteTagName}&quot; is tagged on {deleteTagImageCount}{" "}
            image{deleteTagImageCount === 1 ? "" : "s"}. Are you sure you want
            to delete it?
          </Typography>
          <Stack
            direction="row"
            spacing={1}
            justifyContent="flex-end"
            sx={{ mt: 2 }}
          >
            <Button
              variant="plain"
              color="neutral"
              onClick={() => setDeleteTagOpen(false)}
            >
              Cancel
            </Button>
            <Button color="danger" onClick={handleConfirmDeleteTag}>
              Delete
            </Button>
          </Stack>
        </ModalDialog>
      </Modal>
    </>
  );

  const sidebarContent = details != null && (
    <Box sx={{ p: 2, overflowY: "auto", height: "100%" }}>
      <Stack spacing={3}>
        {/* Entries */}
        <Box>
          <Stack
            direction="row"
            alignItems="center"
            spacing={1}
            sx={{ mb: 1 }}
          >
            <Typography level="title-md" sx={{ flex: 1 }}>
              Entries
            </Typography>
            <IconButton
              size="sm"
              variant="outlined"
              color="primary"
              title="Add entry"
              onClick={() => setAddEntryOpen(true)}
            >
              <Add fontSize="small" />
            </IconButton>
          </Stack>
          <EntryList
            entries={entries}
            totalImageCount={totalImageCount}
            selectedEntryId={selectedEntryId}
            onSelectEntry={handleSelectEntry}
            onAddEntry={() => setAddEntryOpen(true)}
            onAddSubEntry={handleAddSubEntry}
            onUploadImages={handleUploadImages}
            onRenameEntry={(entryId, name) => {
              setRenameEntryId(entryId);
              setRenameEntryName(name);
              setRenameEntryError(null);
              setRenameEntryOpen(true);
            }}
            onDeleteEntry={(entryId, name) => {
              setDeleteEntryId(entryId);
              setDeleteEntryName(name);
              setDeleteEntryOpen(true);
            }}
          />
        </Box>

        {/* Characters (tags where category === "character") */}
        {(() => {
          const characterTags = details.tags.filter(
            (t) => t.category === "character"
          );
          return (
            <Box>
              <Stack
                direction="row"
                alignItems="center"
                spacing={1}
                sx={{ mb: 1 }}
              >
                <Typography
                  level="title-md"
                  startDecorator={<Person fontSize="small" />}
                  sx={{ flex: 1 }}
                >
                  Characters
                </Typography>
                <IconButton
                  size="sm"
                  variant="outlined"
                  color="primary"
                  title="Add character"
                  onClick={() => {
                    setAddTagName("");
                    setAddTagError(null);
                    setAddTagCategory("character");
                    setAddTagOpen(true);
                  }}
                >
                  <Add fontSize="small" />
                </IconButton>
              </Stack>
              {characterTags.length === 0 ? (
                <Typography level="body-sm" sx={{ color: "text.secondary" }}>
                  No characters yet. Click + to add one.
                </Typography>
              ) : (
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                  {characterTags.map((tag) => {
                    const isTagSelected = selectedTagIds.has(tag.id);
                    return (
                      <Stack
                        key={tag.id}
                        direction="row"
                        alignItems="center"
                        spacing={0.25}
                      >
                        <Chip
                          variant={isTagSelected ? "solid" : "soft"}
                          color={isTagSelected ? "warning" : "neutral"}
                          onClick={() => handleToggleTag(tag.id)}
                          sx={{ cursor: "pointer" }}
                          startDecorator={<Person fontSize="small" />}
                          endDecorator={
                            <Typography level="body-xs" sx={{ ml: 0.5 }}>
                              {tag.imageCount}
                            </Typography>
                          }
                        >
                          {tag.name}
                        </Chip>
                        <Dropdown>
                          <MenuButton
                            slots={{ root: IconButton }}
                            slotProps={{
                              root: {
                                size: "sm",
                                variant: "plain",
                                color: "neutral",
                                sx: { minWidth: 24, minHeight: 24, p: 0.25 },
                              },
                            }}
                          >
                            <MoreVert sx={{ fontSize: 16 }} />
                          </MenuButton>
                          <Menu size="sm" placement="bottom-start">
                            <MenuItem
                              onClick={() => {
                                setRenameTagId(tag.id);
                                setRenameTagValue(tag.name);
                                setRenameTagError(null);
                                setRenameTagCategory("character");
                                setRenameTagOpen(true);
                              }}
                            >
                              <ListItemDecorator>
                                <Edit fontSize="small" />
                              </ListItemDecorator>
                              Rename
                            </MenuItem>
                            <MenuItem
                              color="danger"
                              onClick={() =>
                                handleDeleteTag(tag.id, tag.name, "character")
                              }
                            >
                              <ListItemDecorator>
                                <Delete fontSize="small" />
                              </ListItemDecorator>
                              Delete
                            </MenuItem>
                          </Menu>
                        </Dropdown>
                      </Stack>
                    );
                  })}
                </Stack>
              )}
              <Typography
                level="body-xs"
                sx={{ color: "text.tertiary", mt: 1 }}
              >
                Click tags to filter images. Multiple tags use AND logic.
              </Typography>
            </Box>
          );
        })()}

        {/* Tags (uncategorized) */}
        <Box>
          <Stack
            direction="row"
            alignItems="center"
            spacing={1}
            sx={{ mb: 1 }}
          >
            <Typography
              level="title-md"
              startDecorator={<LocalOffer fontSize="small" />}
              sx={{ flex: 1 }}
            >
              Tags
            </Typography>
            <IconButton
              size="sm"
              variant="outlined"
              color="primary"
              title="Add tag"
              onClick={() => {
                setAddTagName("");
                setAddTagError(null);
                setAddTagCategory("");
                setAddTagOpen(true);
              }}
            >
              <Add fontSize="small" />
            </IconButton>
          </Stack>
          {(() => {
            const uncategorizedTags = details.tags.filter(
              (t) => t.category !== "character"
            );
            if (details.tags.length === 0) {
              return (
                <Typography level="body-sm" sx={{ color: "text.secondary" }}>
                  No tags found. Click + to add one.
                </Typography>
              );
            }
            if (uncategorizedTags.length === 0) {
              return (
                <Typography level="body-sm" sx={{ color: "text.secondary" }}>
                  All tags are categorized as characters. Click + to add a tag.
                </Typography>
              );
            }
            return (
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                {uncategorizedTags.map((tag) => {
                  const isTagSelected = selectedTagIds.has(tag.id);
                  return (
                    <Stack
                      key={tag.id}
                      direction="row"
                      alignItems="center"
                      spacing={0.25}
                    >
                      <Chip
                        variant={isTagSelected ? "solid" : "soft"}
                        color={isTagSelected ? "primary" : "neutral"}
                        onClick={() => handleToggleTag(tag.id)}
                        sx={{ cursor: "pointer" }}
                        endDecorator={
                          <Typography level="body-xs" sx={{ ml: 0.5 }}>
                            {tag.imageCount}
                          </Typography>
                        }
                      >
                        {tag.name}
                      </Chip>
                      <Dropdown>
                        <MenuButton
                          slots={{ root: IconButton }}
                          slotProps={{
                            root: {
                              size: "sm",
                              variant: "plain",
                              color: "neutral",
                              sx: { minWidth: 24, minHeight: 24, p: 0.25 },
                            },
                          }}
                        >
                          <MoreVert sx={{ fontSize: 16 }} />
                        </MenuButton>
                        <Menu size="sm" placement="bottom-start">
                          <MenuItem
                            onClick={() => {
                              setRenameTagId(tag.id);
                              setRenameTagValue(tag.name);
                              setRenameTagError(null);
                              setRenameTagCategory("");
                              setRenameTagOpen(true);
                            }}
                          >
                            <ListItemDecorator>
                              <Edit fontSize="small" />
                            </ListItemDecorator>
                            Rename
                          </MenuItem>
                          <MenuItem
                            color="danger"
                            onClick={() =>
                              handleDeleteTag(tag.id, tag.name, "")
                            }
                          >
                            <ListItemDecorator>
                              <Delete fontSize="small" />
                            </ListItemDecorator>
                            Delete
                          </MenuItem>
                        </Menu>
                      </Dropdown>
                    </Stack>
                  );
                })}
              </Stack>
            );
          })()}
          <Typography
            level="body-xs"
            sx={{ color: "text.tertiary", mt: 1 }}
          >
            Click tags to filter images. Multiple tags use AND logic.
          </Typography>
        </Box>
      </Stack>
    </Box>
  );

  // Always show two-panel layout: sidebar + image grid
  return (
    <Layout.Main actionHeader={actionHeader}>
      {loading && (
        <Box sx={{ p: 2 }}>
          <Typography>Loading...</Typography>
        </Box>
      )}
      {error && (
        <Box sx={{ p: 2 }}>
          <Typography color="danger" level="body-md">
            {error}
          </Typography>
        </Box>
      )}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            sm: "minmax(450px, 1fr)",
            md: "minmax(240px, 320px) minmax(500px, 1fr)",
          },
          gridTemplateRows: "1fr",
          height: "100%",
        }}
      >
        <Layout.SideNav
          sx={{
            borderRight: "1px solid",
            borderColor: "divider",
            height: "100%",
            overflowY: "auto",
          }}
        >
          {sidebarContent}
        </Layout.SideNav>
        <ImageListMain
          loadedImages={filteredImages}
          searchParams={searchParams}
          setSearchParams={setSearchParams}
          animeId={id}
        />
      </Box>
      {modals}
    </Layout.Main>
  );
};

export default AnimeDetailPage;
