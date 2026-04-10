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
  List,
  ListDivider,
  ListItem,
  ListItemButton,
  ListItemContent,
  Modal,
  ModalClose,
  ModalDialog,
  Stack,
  Typography,
} from "@mui/joy";
import { FC, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  AnimeDetailsResponse,
  AnimeFolderTreeNode,
  AnimeService,
  BatchImportImageService,
  DirectoryService,
  Tag,
  TagService,
} from "../../../bindings/github.com/michael-freling/anime-image-viewer/internal/frontend";
import Layout from "../../Layout";

interface FolderTreeProps {
  node: AnimeFolderTreeNode;
  depth: number;
  onAddSubfolder: (parentId: number, parentName: string) => void;
  onUploadImages: (folderId: number) => void;
}

const FolderTreeItem: FC<FolderTreeProps> = ({
  node,
  depth,
  onAddSubfolder,
  onUploadImages,
}) => {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children && node.children.length > 0;

  return (
    <Box sx={{ pl: depth > 0 ? 2 : 0 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          py: 0.5,
          "&:hover .folder-actions": { opacity: 1 },
        }}
      >
        <IconButton
          size="sm"
          variant="plain"
          color="neutral"
          onClick={() => setExpanded(!expanded)}
          sx={{ visibility: hasChildren ? "visible" : "hidden", mr: 0.5 }}
        >
          {expanded ? <ExpandMore fontSize="small" /> : <ChevronRight fontSize="small" />}
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
            onClick={() => onAddSubfolder(node.id, node.name)}
          >
            <Add fontSize="small" />
          </IconButton>
          <IconButton
            size="sm"
            variant="plain"
            color="primary"
            title="Upload images"
            onClick={() => onUploadImages(node.id)}
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
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);

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
    if (!confirm("Delete this anime? Folders and tags will NOT be deleted.")) {
      return;
    }
    try {
      await AnimeService.DeleteAnime(id);
      navigate("/anime");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleUnassignTag = async (tagId: number) => {
    try {
      await AnimeService.UnassignTagFromAnime(id, tagId);
      await load();
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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const openTagPicker = async () => {
    try {
      const tags = await TagService.GetAll();
      setAllTags(tags ?? []);
      setTagPickerOpen(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleAssignTag = async (tagId: number) => {
    try {
      await AnimeService.AssignTagToAnime(id, tagId);
      setTagPickerOpen(false);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const assignedTagIds = new Set(
    (details?.tags ?? []).map((t) => t.id)
  );
  const availableTags = allTags.filter((t) => !assignedTagIds.has(t.id));

  return (
    <Layout.Main
      actionHeader={
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
      }
    >
      <Box sx={{ p: 2 }}>
        {loading && <Typography>Loading...</Typography>}
        {error && (
          <Typography color="danger" level="body-md">
            {error}
          </Typography>
        )}
        {details != null && (
          <Stack spacing={3}>
            <Box>
              <Button
                variant="soft"
                onClick={() =>
                  navigate(`/search?animeId=${encodeURIComponent(id)}`)
                }
              >
                View images for this anime
              </Button>
            </Box>

            {/* Folder tree */}
            <Box>
              <Typography level="title-md" sx={{ mb: 1 }}>
                Folders
              </Typography>
              {details.folderTree != null ? (
                <Box
                  sx={{
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: "sm",
                    p: 1,
                    maxWidth: 640,
                  }}
                >
                  <FolderTreeItem
                    node={details.folderTree}
                    depth={0}
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

            {/* Tags */}
            <Box>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <Typography level="title-md">Tags</Typography>
                <Button
                  size="sm"
                  variant="outlined"
                  startDecorator={<Add />}
                  onClick={openTagPicker}
                >
                  Add tag
                </Button>
              </Stack>
              {details.tags.length === 0 ? (
                <Typography level="body-sm" sx={{ color: "text.secondary" }}>
                  No tags assigned.
                </Typography>
              ) : (
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                  {details.tags.map((tag) => (
                    <Chip
                      key={tag.id}
                      variant="outlined"
                      color="primary"
                      onClick={() => handleUnassignTag(tag.id)}
                      endDecorator={
                        <Typography level="body-xs">
                          {tag.imageCount}
                        </Typography>
                      }
                    >
                      {tag.name}
                    </Chip>
                  ))}
                </Stack>
              )}
              <Typography level="body-xs" sx={{ color: "text.tertiary", mt: 1 }}>
                Click a tag to unassign it.
              </Typography>
            </Box>
          </Stack>
        )}
      </Box>

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

      {/* Tag picker modal */}
      <Modal open={tagPickerOpen} onClose={() => setTagPickerOpen(false)}>
        <ModalDialog sx={{ minWidth: 360, maxHeight: "60vh" }}>
          <ModalClose />
          <Typography level="title-md">Assign a tag</Typography>
          {availableTags.length === 0 ? (
            <Typography level="body-sm" sx={{ mt: 2, color: "text.secondary" }}>
              No available tags to assign.
            </Typography>
          ) : (
            <List
              variant="outlined"
              sx={{
                borderRadius: "sm",
                mt: 2,
                maxHeight: 300,
                overflow: "auto",
              }}
            >
              {availableTags.map((tag, idx) => (
                <Box key={tag.id}>
                  {idx > 0 && <ListDivider inset="gutter" />}
                  <ListItem>
                    <ListItemButton onClick={() => handleAssignTag(tag.id)}>
                      <ListItemContent>
                        <Typography level="body-sm">{tag.name}</Typography>
                      </ListItemContent>
                    </ListItemButton>
                  </ListItem>
                </Box>
              ))}
            </List>
          )}
        </ModalDialog>
      </Modal>
    </Layout.Main>
  );
};

export default AnimeDetailPage;
