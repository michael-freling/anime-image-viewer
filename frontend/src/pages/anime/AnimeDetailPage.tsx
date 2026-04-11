import {
  Add,
  ArrowBack,
  ChevronRight,
  Delete,
  Edit,
  ExpandMore,
  Folder,
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

  // Character management state
  const [addCharOpen, setAddCharOpen] = useState(false);
  const [addCharName, setAddCharName] = useState("");
  const [addCharError, setAddCharError] = useState<string | null>(null);
  const [renameCharOpen, setRenameCharOpen] = useState(false);
  const [renameCharId, setRenameCharId] = useState<number>(0);
  const [renameCharValue, setRenameCharValue] = useState("");
  const [renameCharError, setRenameCharError] = useState<string | null>(null);
  const [deleteCharOpen, setDeleteCharOpen] = useState(false);
  const [deleteCharId, setDeleteCharId] = useState<number>(0);
  const [deleteCharName, setDeleteCharName] = useState("");
  const [deleteCharImageCount, setDeleteCharImageCount] = useState<number>(0);

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

  const handleAddCharacter = async () => {
    const name = addCharName.trim();
    if (name === "") {
      setAddCharError("Name is required");
      return;
    }
    try {
      const tag = await TagFrontendService.CreateTopTag(name);
      await TagFrontendService.UpdateCategory(tag.id, "character");
      setAddCharOpen(false);
      setAddCharName("");
      setAddCharError(null);
      await load();
    } catch (err: unknown) {
      setAddCharError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleRenameCharacter = async () => {
    const name = renameCharValue.trim();
    if (name === "") {
      setRenameCharError("Name is required");
      return;
    }
    try {
      await TagFrontendService.UpdateName(renameCharId, name);
      setRenameCharOpen(false);
      setRenameCharError(null);
      await load();
    } catch (err: unknown) {
      setRenameCharError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDeleteCharacter = async (tagId: number, tagName: string) => {
    try {
      const count = await TagFrontendService.GetTagFileCount(tagId);
      if (count > 0) {
        setDeleteCharId(tagId);
        setDeleteCharName(tagName);
        setDeleteCharImageCount(count);
        setDeleteCharOpen(true);
      } else {
        await TagFrontendService.DeleteTag(tagId);
        await load();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleConfirmDeleteCharacter = async () => {
    try {
      await TagFrontendService.DeleteTag(deleteCharId);
      setDeleteCharOpen(false);
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
      // Deselect folder but keep tag selection
      setSelectedFolderId(null);
      if (selectedTagIds.size > 0) {
        // Tags are still active; load all anime images so the tag filter works
        loadAllAnimeImages();
      } else {
        setFolderImages([]);
        setImageTagMap({});
      }
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

      // When no folder is selected, load all anime images so the tag filter
      // can operate across the entire anime. When tags are cleared without a
      // folder, reset.
      if (selectedFolderId == null) {
        if (next.size > 0) {
          loadAllAnimeImages();
        } else {
          setFolderImages([]);
          setImageTagMap({});
        }
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

      {/* Add character modal */}
      <Modal open={addCharOpen} onClose={() => setAddCharOpen(false)}>
        <ModalDialog sx={{ minWidth: 360 }}>
          <ModalClose />
          <Typography level="title-md">Add character</Typography>
          <Stack spacing={2} sx={{ mt: 2 }}>
            <Input
              autoFocus
              placeholder="Character name"
              value={addCharName}
              onChange={(e) => {
                setAddCharName(e.target.value);
                setAddCharError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleAddCharacter();
                }
              }}
            />
            {addCharError && (
              <Typography level="body-sm" color="danger">
                {addCharError}
              </Typography>
            )}
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button
                variant="plain"
                color="neutral"
                onClick={() => setAddCharOpen(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleAddCharacter}>Create</Button>
            </Stack>
          </Stack>
        </ModalDialog>
      </Modal>

      {/* Rename character modal */}
      <Modal open={renameCharOpen} onClose={() => setRenameCharOpen(false)}>
        <ModalDialog sx={{ minWidth: 360 }}>
          <ModalClose />
          <Typography level="title-md">Rename character</Typography>
          <Stack spacing={2} sx={{ mt: 2 }}>
            <Input
              autoFocus
              value={renameCharValue}
              onChange={(e) => {
                setRenameCharValue(e.target.value);
                setRenameCharError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleRenameCharacter();
                }
              }}
            />
            {renameCharError && (
              <Typography level="body-sm" color="danger">
                {renameCharError}
              </Typography>
            )}
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button
                variant="plain"
                color="neutral"
                onClick={() => setRenameCharOpen(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleRenameCharacter}>Save</Button>
            </Stack>
          </Stack>
        </ModalDialog>
      </Modal>

      {/* Delete character confirmation modal */}
      <Modal open={deleteCharOpen} onClose={() => setDeleteCharOpen(false)}>
        <ModalDialog sx={{ minWidth: 360 }}>
          <ModalClose />
          <Typography level="title-md">Delete character</Typography>
          <Typography level="body-md" sx={{ mt: 2 }}>
            &quot;{deleteCharName}&quot; is tagged on {deleteCharImageCount}{" "}
            image{deleteCharImageCount === 1 ? "" : "s"}. Are you sure you want
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
              onClick={() => setDeleteCharOpen(false)}
            >
              Cancel
            </Button>
            <Button color="danger" onClick={handleConfirmDeleteCharacter}>
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
        <Box>
          <Button
            variant="soft"
            onClick={() =>
              navigate(`/search?animeId=${encodeURIComponent(id)}`)
            }
          >
            View all images for this anime
          </Button>
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
                    setAddCharName("");
                    setAddCharError(null);
                    setAddCharOpen(true);
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
                                setRenameCharId(tag.id);
                                setRenameCharValue(tag.name);
                                setRenameCharError(null);
                                setRenameCharOpen(true);
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
                                handleDeleteCharacter(tag.id, tag.name)
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
            </Box>
          );
        })()}

        {/* Tags (uncategorized, derived, read-only) */}
        <Box>
          <Typography level="title-md" sx={{ mb: 1 }}>
            Tags
          </Typography>
          {(() => {
            const uncategorizedTags = details.tags.filter(
              (t) => t.category !== "character"
            );
            if (details.tags.length === 0) {
              return (
                <Typography level="body-sm" sx={{ color: "text.secondary" }}>
                  No tags found. Tags are derived from images in the folder
                  tree.
                </Typography>
              );
            }
            if (uncategorizedTags.length === 0) {
              return (
                <Typography level="body-sm" sx={{ color: "text.secondary" }}>
                  All tags are categorized as characters.
                </Typography>
              );
            }
            return (
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                {uncategorizedTags.map((tag) => {
                  const isTagSelected = selectedTagIds.has(tag.id);
                  return (
                    <Chip
                      key={tag.id}
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

  // When a folder is selected or tags are active, show a two-panel layout with
  // the sidebar and ImageListMain for the image grid. Otherwise show a
  // single-panel detail view.
  if (selectedFolderId != null || selectedTagIds.size > 0) {
    return (
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            sm: "minmax(450px, 1fr)",
            md: "minmax(240px, 320px) minmax(500px, 1fr)",
          },
          gridTemplateRows: "1fr",
        }}
      >
        <Layout.SideNav
          sx={{
            borderRight: "1px solid",
            borderColor: "divider",
            height: "95vh",
            overflowY: "auto",
          }}
        >
          {sidebarContent}
        </Layout.SideNav>
        <ImageListMain
          loadedImages={filteredImages}
          searchParams={searchParams}
          setSearchParams={setSearchParams}
        />
        {modals}
      </Box>
    );
  }

  return (
    <Layout.Main actionHeader={actionHeader}>
      <Box sx={{ p: 2 }}>
        {loading && <Typography>Loading...</Typography>}
        {error && (
          <Typography color="danger" level="body-md">
            {error}
          </Typography>
        )}
        {sidebarContent}
      </Box>
      {modals}
    </Layout.Main>
  );
};

export default AnimeDetailPage;
