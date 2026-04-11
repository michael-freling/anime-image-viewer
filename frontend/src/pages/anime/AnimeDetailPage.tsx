import {
  Add,
  ArrowBack,
  ChevronRight,
  Delete,
  Edit,
  ExpandMore,
  Folder,
  Upload,
} from "@mui/icons-material";
import {
  Box,
  Button,
  Chip,
  IconButton,
  Input,
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
      navigate("/anime");
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

  const handleSelectFolder = (folderId: number) => {
    if (selectedFolderId === folderId) {
      // Deselect
      setSelectedFolderId(null);
      setFolderImages([]);
      setSelectedTagIds(new Set());
      setImageTagMap({});
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
      <IconButton onClick={() => navigate("/anime")}>
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

        {/* Tags (derived, read-only) */}
        <Box>
          <Typography level="title-md" sx={{ mb: 1 }}>
            Tags
          </Typography>
          {details.tags.length === 0 ? (
            <Typography level="body-sm" sx={{ color: "text.secondary" }}>
              No tags found. Tags are derived from images in the folder tree.
            </Typography>
          ) : (
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              {details.tags.map((tag) => {
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
          )}
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

  // When a folder is selected, show a two-panel layout with the sidebar and
  // ImageListMain for the image grid. Otherwise show a single-panel detail view.
  if (selectedFolderId != null) {
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
