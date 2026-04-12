import { Add, Close, FileOpen, Search } from "@mui/icons-material";
import {
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
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
import { FC, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
  AniListSearchResult,
  AnimeListItem,
  AnimeService,
  UnassignedFolder,
} from "../../../bindings/github.com/michael-freling/anime-image-viewer/internal/frontend";
import Layout from "../../Layout";

function formatSeason(season: string): string {
  if (!season) return "";
  return season.charAt(0).toUpperCase() + season.slice(1).toLowerCase();
}

const AnimeListPage: FC = () => {
  const [items, setItems] = useState<AnimeListItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [unassignedFolders, setUnassignedFolders] = useState<UnassignedFolder[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<number>>(new Set());
  const [importingBatch, setImportingBatch] = useState(false);
  const [selectedAniList, setSelectedAniList] = useState<AniListSearchResult | null>(null);
  const [aniListResults, setAniListResults] = useState<AniListSearchResult[]>([]);
  const [aniListLoading, setAniListLoading] = useState(false);
  const [aniListSearched, setAniListSearched] = useState(false);
  const aniListTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  // Cleanup AniList debounce timer on unmount
  useEffect(() => {
    return () => {
      if (aniListTimerRef.current != null) {
        clearTimeout(aniListTimerRef.current);
      }
    };
  }, []);

  const doAniListSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (trimmed === "") {
      setAniListResults([]);
      setAniListSearched(false);
      setAniListLoading(false);
      return;
    }
    setAniListLoading(true);
    try {
      const res = await AnimeService.SearchAniList(trimmed);
      setAniListResults(res ?? []);
      setAniListSearched(true);
    } catch {
      setAniListResults([]);
      setAniListSearched(true);
    } finally {
      setAniListLoading(false);
    }
  }, []);

  const handleNameChange = (value: string) => {
    setNewName(value);
    setCreateError(null);
    setSelectedAniList(null);
    setAniListResults([]);
    setAniListSearched(false);
    if (aniListTimerRef.current != null) {
      clearTimeout(aniListTimerRef.current);
    }
    aniListTimerRef.current = setTimeout(() => {
      doAniListSearch(value);
    }, 300);
  };

  const handleAniListSelect = (result: AniListSearchResult) => {
    setSelectedAniList(result);
    const title = result.titleEnglish || result.titleRomaji;
    if (title) {
      setNewName(title);
    }
    setAniListResults([]);
    setAniListSearched(false);
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (name === "") {
      setCreateError("Name is required");
      return;
    }
    setCreating(true);
    setCreateError(null);
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
    } finally {
      setCreating(false);
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
                setAniListResults([]);
                setAniListSearched(false);
                setAniListLoading(false);
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
      <Modal open={createOpen} onClose={() => { if (!creating) setCreateOpen(false); }}>
        <ModalDialog sx={{ minWidth: 360 }}>
          {!creating && <ModalClose />}
          <Typography level="title-md">Create anime</Typography>
          <Stack spacing={2} sx={{ mt: 2 }}>
            <Input
              autoFocus
              disabled={creating}
              placeholder="Anime name"
              startDecorator={<Search />}
              value={newName}
              onChange={(e) => handleNameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !aniListLoading && !creating) {
                  handleCreate();
                }
              }}
            />
            {selectedAniList && (
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
            )}
            {aniListLoading && (
              <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
                <CircularProgress size="sm" />
              </Box>
            )}
            {!selectedAniList && !aniListLoading && aniListSearched && aniListResults.length === 0 && (
              <Typography
                level="body-sm"
                sx={{ color: "text.secondary", textAlign: "center", py: 1 }}
              >
                No AniList results found
              </Typography>
            )}
            {!selectedAniList && !aniListLoading && aniListResults.length > 0 && (
              <List
                variant="outlined"
                sx={{ borderRadius: "sm", maxHeight: 300, overflow: "auto" }}
              >
                {aniListResults.map((result, idx) => {
                  const displayTitle =
                    result.titleEnglish || result.titleRomaji || "Unknown";
                  const seasonStr = formatSeason(result.season);
                  const subtitleParts: string[] = [];
                  if (result.format) subtitleParts.push(result.format);
                  if (seasonStr && result.seasonYear) {
                    subtitleParts.push(`${seasonStr} ${result.seasonYear}`);
                  } else if (result.seasonYear) {
                    subtitleParts.push(`${result.seasonYear}`);
                  }
                  if (result.episodes > 0) {
                    subtitleParts.push(
                      `${result.episodes} episode${result.episodes === 1 ? "" : "s"}`
                    );
                  }

                  return (
                    <Box key={result.id}>
                      {idx > 0 && <ListDivider inset="gutter" />}
                      <ListItem>
                        <ListItemButton onClick={() => handleAniListSelect(result)}>
                          <ListItemContent>
                            <Typography level="title-sm">
                              {displayTitle}
                            </Typography>
                            {subtitleParts.length > 0 && (
                              <Typography
                                level="body-xs"
                                sx={{ color: "text.secondary" }}
                              >
                                {subtitleParts.join(" \u00B7 ")}
                              </Typography>
                            )}
                            {result.titleNative && (
                              <Typography
                                level="body-xs"
                                sx={{ color: "text.tertiary" }}
                              >
                                {result.titleNative}
                              </Typography>
                            )}
                          </ListItemContent>
                        </ListItemButton>
                      </ListItem>
                    </Box>
                  );
                })}
              </List>
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
                disabled={creating}
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button
                disabled={creating}
                loading={creating}
                onClick={handleCreate}
              >
                Create
              </Button>
            </Stack>
          </Stack>
        </ModalDialog>
      </Modal>

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
