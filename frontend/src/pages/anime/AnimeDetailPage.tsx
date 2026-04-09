import { ArrowBack, Delete, Edit, Folder } from "@mui/icons-material";
import {
  Box,
  Button,
  Chip,
  IconButton,
  Input,
  List,
  ListDivider,
  ListItem,
  ListItemContent,
  ListItemDecorator,
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
  AnimeService,
} from "../../../bindings/github.com/michael-freling/anime-image-viewer/internal/frontend";
import Layout from "../../Layout";

const AnimeDetailPage: FC = () => {
  const { animeId } = useParams<{ animeId: string }>();
  const navigate = useNavigate();
  const [details, setDetails] = useState<AnimeDetailsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);

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

  const handleUnassignFolder = async (folderId: number) => {
    try {
      await AnimeService.UnassignFolderFromAnime(folderId);
      await load();
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

            <Box>
              <Typography level="title-md" sx={{ mb: 1 }}>
                Tags
              </Typography>
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

            <Box>
              <Typography level="title-md" sx={{ mb: 1 }}>
                Folders
              </Typography>
              {details.folders.length === 0 ? (
                <Typography level="body-sm" sx={{ color: "text.secondary" }}>
                  No folders assigned. Assign a folder from the folder edit
                  page.
                </Typography>
              ) : (
                <List
                  variant="outlined"
                  sx={{ borderRadius: "sm", maxWidth: 640 }}
                >
                  {details.folders.map((folder, idx) => (
                    <Box key={folder.id}>
                      {idx > 0 && <ListDivider inset="gutter" />}
                      <ListItem>
                        <ListItemDecorator>
                          <Folder color="primary" />
                        </ListItemDecorator>
                        <ListItemContent>
                          <Stack
                            direction="row"
                            justifyContent="space-between"
                            alignItems="center"
                          >
                            <Box sx={{ minWidth: 0 }}>
                              <Typography
                                level="title-sm"
                                sx={{
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {folder.name}
                              </Typography>
                              <Typography
                                level="body-xs"
                                sx={{ color: "text.tertiary" }}
                              >
                                {folder.path}
                              </Typography>
                            </Box>
                            <Stack
                              direction="row"
                              spacing={1}
                              alignItems="center"
                            >
                              <Typography
                                level="body-sm"
                                sx={{ color: "text.secondary" }}
                              >
                                {folder.imageCount} image
                                {folder.imageCount === 1 ? "" : "s"}
                              </Typography>
                              <IconButton
                                size="sm"
                                color="danger"
                                variant="plain"
                                onClick={() => handleUnassignFolder(folder.id)}
                                aria-label={`Unassign folder ${folder.name}`}
                              >
                                <Delete />
                              </IconButton>
                            </Stack>
                          </Stack>
                        </ListItemContent>
                      </ListItem>
                    </Box>
                  ))}
                </List>
              )}
            </Box>
          </Stack>
        )}
      </Box>

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
    </Layout.Main>
  );
};

export default AnimeDetailPage;
