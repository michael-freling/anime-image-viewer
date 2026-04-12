import { Add, Close, FileOpen, Search } from "@mui/icons-material";
import {
  Box,
  Button,
  Checkbox,
  Chip,
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
  AniListSearchResult,
  AnimeListItem,
  AnimeService,
  UnassignedFolder,
} from "../../../bindings/github.com/michael-freling/anime-image-viewer/internal/frontend";
import Layout from "../../Layout";
import AniListSearchModal from "./AniListSearchModal";

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
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<number>>(new Set());
  const [importingBatch, setImportingBatch] = useState(false);
  const [aniListSearchOpen, setAniListSearchOpen] = useState(false);
  const [selectedAniList, setSelectedAniList] = useState<AniListSearchResult | null>(null);
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
      if (selectedAniList) {
        await AnimeService.ImportFromAniList(created.id, selectedAniList.id);
      }
      setCreateOpen(false);
      setNewName("");
      setCreateError(null);
      setSelectedAniList(null);
      navigate(`/${created.id}`);
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleOpenImport = async () => {
    setImportError(null);
    setImportLoading(true);
    setImportOpen(true);
    setSelectedFolderIds(new Set());
    try {
      const folders = await AnimeService.ListUnassignedTopFolders();
      setUnassignedFolders(folders ?? []);
    } catch (err: unknown) {
      setImportError(err instanceof Error ? err.message : String(err));
    } finally {
      setImportLoading(false);
    }
  };

  const toggleFolder = (id: number) => {
    setSelectedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedFolderIds.size === unassignedFolders.length) {
      setSelectedFolderIds(new Set());
    } else {
      setSelectedFolderIds(new Set(unassignedFolders.map((f) => f.id)));
    }
  };

  const handleImportSelected = async () => {
    if (selectedFolderIds.size === 0) return;
    setImportingBatch(true);
    setImportError(null);
    try {
      await AnimeService.ImportMultipleFoldersAsAnime(
        Array.from(selectedFolderIds)
      );
      setImportOpen(false);
      await refresh();
    } catch (err: unknown) {
      setImportError(err instanceof Error ? err.message : String(err));
    } finally {
      setImportingBatch(false);
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
                setSelectedAniList(null);
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
              Import folders
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
            &quot;Import folders&quot; to import existing folders.
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
                    onClick={() => navigate(`/${item.id}`)}
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
            {selectedAniList ? (
              <Chip
                variant="soft"
                color="primary"
                endDecorator={
                  <Close
                    sx={{ fontSize: 16, cursor: "pointer" }}
                    onClick={() => setSelectedAniList(null)}
                  />
                }
              >
                AniList linked: {selectedAniList.titleEnglish || selectedAniList.titleRomaji}
              </Chip>
            ) : (
              <Button
                variant="plain"
                color="neutral"
                size="sm"
                startDecorator={<Search />}
                onClick={() => setAniListSearchOpen(true)}
                sx={{ alignSelf: "flex-start" }}
              >
                Search AniList
              </Button>
            )}
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

      {/* AniList search modal */}
      <AniListSearchModal
        open={aniListSearchOpen}
        onClose={() => setAniListSearchOpen(false)}
        onSelect={(result) => {
          setSelectedAniList(result);
          const title = result.titleEnglish || result.titleRomaji;
          if (title && newName.trim() === "") {
            setNewName(title);
          }
        }}
      />

      {/* Import folders modal */}
      <Modal open={importOpen} onClose={() => setImportOpen(false)}>
        <ModalDialog sx={{ minWidth: 440, maxHeight: "70vh" }}>
          <ModalClose />
          <Typography level="title-md">Import folders as anime</Typography>
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
              <>
                <Box sx={{ mb: 1 }}>
                  <Checkbox
                    label="Select all"
                    checked={selectedFolderIds.size === unassignedFolders.length}
                    indeterminate={
                      selectedFolderIds.size > 0 &&
                      selectedFolderIds.size < unassignedFolders.length
                    }
                    onChange={toggleAll}
                  />
                </Box>
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
                        <ListItemButton onClick={() => toggleFolder(folder.id)}>
                          <Checkbox
                            checked={selectedFolderIds.has(folder.id)}
                            sx={{ mr: 1 }}
                            readOnly
                          />
                          <ListItemContent>
                            <Typography level="body-sm">
                              {folder.name}
                            </Typography>
                          </ListItemContent>
                        </ListItemButton>
                      </ListItem>
                    </Box>
                  ))}
                </List>
                <Stack
                  direction="row"
                  spacing={1}
                  justifyContent="flex-end"
                  sx={{ mt: 2 }}
                >
                  <Button
                    variant="plain"
                    color="neutral"
                    onClick={() => setImportOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    disabled={selectedFolderIds.size === 0 || importingBatch}
                    loading={importingBatch}
                    onClick={handleImportSelected}
                  >
                    Import {selectedFolderIds.size > 0
                      ? `${selectedFolderIds.size} folder${selectedFolderIds.size === 1 ? "" : "s"}`
                      : ""}
                  </Button>
                </Stack>
              </>
            )}
          </Box>
        </ModalDialog>
      </Modal>
    </Layout.Main>
  );
};

export default AnimeListPage;
