import { Add, FileOpen } from "@mui/icons-material";
import {
  Box,
  Button,
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
import { useNavigate } from "react-router";
import {
  AnimeListItem,
  AnimeService,
  UnassignedFolder,
} from "../../../bindings/github.com/michael-freling/anime-image-viewer/internal/frontend";
import Layout from "../../Layout";

const AnimeListPage: FC = () => {
  const [items, setItems] = useState<AnimeListItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [unassignedFolders, setUnassignedFolders] = useState<UnassignedFolder[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const navigate = useNavigate();

  const refresh = async () => {
    setLoading(true);
    try {
      const list = await AnimeService.ListAnime();
      setItems(list ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleCreate = async () => {
    const name = newName.trim();
    if (name === "") {
      setCreateError("Name is required");
      return;
    }
    try {
      const created = await AnimeService.CreateAnime(name);
      setCreateOpen(false);
      setNewName("");
      setCreateError(null);
      navigate(`/anime/${created.id}`);
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleOpenImport = async () => {
    setImportError(null);
    setImportLoading(true);
    setImportOpen(true);
    try {
      const folders = await AnimeService.ListUnassignedTopFolders();
      setUnassignedFolders(folders ?? []);
    } catch (err: unknown) {
      setImportError(err instanceof Error ? err.message : String(err));
    } finally {
      setImportLoading(false);
    }
  };

  const handleImportFolder = async (folderId: number) => {
    try {
      const created = await AnimeService.ImportFolderAsAnime(folderId);
      setImportOpen(false);
      navigate(`/anime/${created.id}`);
    } catch (err: unknown) {
      setImportError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Layout.Main
      actionHeader={
        <>
          <Typography level="title-lg">Anime</Typography>
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              color="primary"
              startDecorator={<Add />}
              onClick={() => {
                setCreateError(null);
                setNewName("");
                setCreateOpen(true);
              }}
            >
              Create anime
            </Button>
            <Button
              variant="outlined"
              color="neutral"
              startDecorator={<FileOpen />}
              onClick={handleOpenImport}
            >
              Import folder
            </Button>
          </Stack>
        </>
      }
    >
      <Box sx={{ p: 2 }}>
        {loading && <Typography>Loading...</Typography>}
        {!loading && items != null && items.length === 0 && (
          <Typography level="body-md" sx={{ color: "text.secondary" }}>
            No anime yet. Click &quot;Create anime&quot; to get started, or
            &quot;Import folder&quot; to import an existing folder.
          </Typography>
        )}
        {!loading && items != null && items.length > 0 && (
          <List
            variant="outlined"
            sx={{
              borderRadius: "sm",
              maxWidth: 640,
            }}
          >
            {items.map((item, idx) => (
              <Box key={item.id}>
                {idx > 0 && <ListDivider inset="gutter" />}
                <ListItem>
                  <ListItemButton
                    onClick={() => navigate(`/anime/${item.id}`)}
                  >
                    <ListItemContent>
                      <Stack
                        direction="row"
                        justifyContent="space-between"
                        alignItems="center"
                      >
                        <Typography level="title-md">{item.name}</Typography>
                        <Typography level="body-sm" sx={{ color: "text.secondary" }}>
                          {item.imageCount} image
                          {item.imageCount === 1 ? "" : "s"}
                        </Typography>
                      </Stack>
                    </ListItemContent>
                  </ListItemButton>
                </ListItem>
              </Box>
            ))}
          </List>
        )}
      </Box>

      {/* Create anime modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)}>
        <ModalDialog sx={{ minWidth: 360 }}>
          <ModalClose />
          <Typography level="title-md">Create anime</Typography>
          <Stack spacing={2} sx={{ mt: 2 }}>
            <Input
              autoFocus
              placeholder="Anime name"
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                setCreateError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleCreate();
                }
              }}
            />
            {createError && (
              <Typography level="body-sm" color="danger">
                {createError}
              </Typography>
            )}
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button
                variant="plain"
                color="neutral"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleCreate}>Create</Button>
            </Stack>
          </Stack>
        </ModalDialog>
      </Modal>

      {/* Import folder modal */}
      <Modal open={importOpen} onClose={() => setImportOpen(false)}>
        <ModalDialog sx={{ minWidth: 400, maxHeight: "60vh" }}>
          <ModalClose />
          <Typography level="title-md">Import existing folder as anime</Typography>
          <Box sx={{ mt: 2 }}>
            {importLoading && <Typography>Loading folders...</Typography>}
            {importError && (
              <Typography level="body-sm" color="danger" sx={{ mb: 1 }}>
                {importError}
              </Typography>
            )}
            {!importLoading && unassignedFolders.length === 0 && (
              <Typography level="body-sm" sx={{ color: "text.secondary" }}>
                No unassigned top-level folders available.
              </Typography>
            )}
            {!importLoading && unassignedFolders.length > 0 && (
              <List
                variant="outlined"
                sx={{
                  borderRadius: "sm",
                  maxHeight: 300,
                  overflow: "auto",
                }}
              >
                {unassignedFolders.map((folder, idx) => (
                  <Box key={folder.id}>
                    {idx > 0 && <ListDivider inset="gutter" />}
                    <ListItem>
                      <ListItemButton
                        onClick={() => handleImportFolder(folder.id)}
                      >
                        <ListItemContent>
                          <Typography level="body-sm">{folder.name}</Typography>
                        </ListItemContent>
                      </ListItemButton>
                    </ListItem>
                  </Box>
                ))}
              </List>
            )}
          </Box>
        </ModalDialog>
      </Modal>
    </Layout.Main>
  );
};

export default AnimeListPage;
