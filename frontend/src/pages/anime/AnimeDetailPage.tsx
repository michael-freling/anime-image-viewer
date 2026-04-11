import {
  Add,
  ArrowBack,
  ChevronRight,
  Delete,
  Edit,
  ExpandMore,
  Folder,
  LocalOffer,
  MoreVert,
  Person,
  Upload,
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
  AnimeFolderTreeNode,
  AnimeService,
  BatchImportImageService,
  DirectoryService,
  Image,
} from "../../../bindings/github.com/michael-freling/anime-image-viewer/internal/frontend";
import { TagFrontendService } from "../../../bindings/github.com/michael-freling/anime-image-viewer/internal/tag";
import ImageListMain from "../../components/Images/ImageList";
import Layout from "../../Layout";

interface FolderTreeProps {
  node: AnimeFolderTreeNode;
  depth: number;
  selectedFolderId: number | null;
  onSelectFolder: (folderId: number) => void;
  onAddSubfolder: (parentId: number, parentName: string) => void;
  onUploadImages: (folderId: number) => void;
}

const FolderTreeItem: FC<FolderTreeProps> = ({
  node,
  depth,
  selectedFolderId,
  onSelectFolder,
  onAddSubfolder,
  onUploadImages,
}) => {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = selectedFolderId === node.id;

  return (
    <Box sx={{ pl: depth > 0 ? 2 : 0 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          py: 0.5,
          px: 0.5,
          borderRadius: "sm",
          cursor: "pointer",
          bgcolor: isSelected ? "primary.softBg" : "transparent",
          "&:hover": {
            bgcolor: isSelected ? "primary.softBg" : "neutral.softHoverBg",
          },
          "&:hover .folder-actions": { opacity: 1 },
        }}
        onClick={() => onSelectFolder(node.id)}
      >
        <IconButton
          size="sm"
          variant="plain"
          color="neutral"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
          sx={{ visibility: hasChildren ? "visible" : "hidden", mr: 0.5 }}
        >
          {expanded ? (
            <ExpandMore fontSize="small" />
          ) : (
            <ChevronRight fontSize="small" />
          )}
        </IconButton>
        <Folder fontSize="small" sx={{ mr: 1, color: "primary.500" }} />
        <Typography level="body-sm" sx={{ flex: 1 }}>
          {node.name}
        </Typography>
        <Typography level="body-xs" sx={{ color: "text.secondary", mr: 1 }}>
          {node.imageCount} image{node.imageCount === 1 ? "" : "s"}
        </Typography>
        <Stack
          direction="row"
          spacing={0.5}
          className="folder-actions"
          sx={{ opacity: 0, transition: "opacity 0.15s" }}
        >
          <IconButton
            size="sm"
            variant="plain"
            color="primary"
            title="Add subfolder"
            onClick={(e) => {
              e.stopPropagation();
              onAddSubfolder(node.id, node.name);
            }}
          >
            <Add fontSize="small" />
          </IconButton>
          <IconButton
            size="sm"
            variant="plain"
            color="primary"
            title="Upload images"
            onClick={(e) => {
              e.stopPropagation();
              onUploadImages(node.id);
            }}
          >
            <Upload fontSize="small" />
          </IconButton>
        </Stack>
      </Box>
      {expanded &&
        hasChildren &&
        node.children.map((child) => (
          <FolderTreeItem
            key={child.id}
            node={child}
            depth={depth + 1}
            selectedFolderId={selectedFolderId}
            onSelectFolder={onSelectFolder}
            onAddSubfolder={onAddSubfolder}
            onUploadImages={onUploadImages}
          />
        ))}
    </Box>
  );
};

const AnimeDetailPage: FC = () => {
  const { animeId } = useParams<{ animeId: string }>();
  const navigate = useNavigate();
  const [details, setDetails] = useState<AnimeDetailsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [subfolderOpen, setSubfolderOpen] = useState(false);
  const [subfolderParentId, setSubfolderParentId] = useState<number>(0);
  const [subfolderParentName, setSubfolderParentName] = useState<string>("");
  const [subfolderName, setSubfolderName] = useState("");
  const [subfolderError, setSubfolderError] = useState<string | null>(null);

  // Generic tag management state (shared by characters and uncategorized tags)
  const [addTagOpen, setAddTagOpen] = useState(false);
  const [addTagName, setAddTagName] = useState("");
  const [addTagError, setAddTagError] = useState<string | null>(null);
  const [addTagCategory, setAddTagCategory] = useState<"character" | "">("");
  const [renameTagOpen, setRenameTagOpen] = useState(false);
  const [renameTagId, setRenameTagId] = useState<number>(0);
  const [renameTagValue, setRenameTagValue] = useState("");
  const [renameTagError, setRenameTagError] = useState<string | null>(null);
  const [renameTagCategory, setRenameTagCategory] = useState<"character" | "">("");
  const [deleteTagOpen, setDeleteTagOpen] = useState(false);
  const [deleteTagId, setDeleteTagId] = useState<number>(0);
  const [deleteTagName, setDeleteTagName] = useState("");
  const [deleteTagImageCount, setDeleteTagImageCount] = useState<number>(0);
  const [deleteTagCategory, setDeleteTagCategory] = useState<"character" | "">("");

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

  useEffect(() => {
    load();
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
    if (!confirm("Delete this anime? The folder and all its contents will also be removed.")) {
      return;
    }
    try {
      await AnimeService.DeleteAnime(id);
      navigate("/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleAddSubfolder = (parentId: number, parentName: string) => {
    setSubfolderParentId(parentId);
    setSubfolderParentName(parentName);
    setSubfolderName("");
    setSubfolderError(null);
    setSubfolderOpen(true);
  };

  const handleCreateSubfolder = async () => {
    const name = subfolderName.trim();
    if (name === "") {
      setSubfolderError("Name is required");
      return;
    }
    try {
      await DirectoryService.CreateDirectory(name, subfolderParentId);
      setSubfolderOpen(false);
      await load();
    } catch (err: unknown) {
      setSubfolderError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleUploadImages = async (folderId: number) => {
    try {
      await BatchImportImageService.ImportImages(folderId);
      await load();
      // Refresh folder images if the uploaded folder is currently selected
      if (selectedFolderId === folderId) {
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

  const handleDeleteTag = async (tagId: number, tagName: string, category: "character" | "") => {
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

  const handleSelectFolder = (folderId: number) => {
    if (selectedFolderId === folderId) {
      // Deselect folder — load all anime images
      setSelectedFolderId(null);
      loadAllAnimeImages();
      return;
    }
    setSelectedFolderId(folderId);
    setSelectedTagIds(new Set());
    loadFolderImages(folderId);
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
      {/* Rename modal */}
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

      {/* Add subfolder modal */}
      <Modal open={subfolderOpen} onClose={() => setSubfolderOpen(false)}>
        <ModalDialog sx={{ minWidth: 360 }}>
          <ModalClose />
          <Typography level="title-md">
            Add subfolder under &quot;{subfolderParentName}&quot;
          </Typography>
          <Stack spacing={2} sx={{ mt: 2 }}>
            <Input
              autoFocus
              placeholder="Folder name"
              value={subfolderName}
              onChange={(e) => {
                setSubfolderName(e.target.value);
                setSubfolderError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleCreateSubfolder();
                }
              }}
            />
            {subfolderError && (
              <Typography level="body-sm" color="danger">
                {subfolderError}
              </Typography>
            )}
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button
                variant="plain"
                color="neutral"
                onClick={() => setSubfolderOpen(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleCreateSubfolder}>Create</Button>
            </Stack>
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

        {/* Folder tree */}
        <Box>
          <Typography level="title-md" sx={{ mb: 1 }}>
            Seasons / Groups
          </Typography>
          {details.folderTree != null ? (
            <Box
              sx={{
                border: "1px solid",
                borderColor: "divider",
                borderRadius: "sm",
                p: 1,
              }}
            >
              <FolderTreeItem
                node={details.folderTree}
                depth={0}
                selectedFolderId={selectedFolderId}
                onSelectFolder={handleSelectFolder}
                onAddSubfolder={handleAddSubfolder}
                onUploadImages={handleUploadImages}
              />
            </Box>
          ) : (
            <Typography level="body-sm" sx={{ color: "text.secondary" }}>
              No folder tree. This anime has no root folder.
            </Typography>
          )}
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
