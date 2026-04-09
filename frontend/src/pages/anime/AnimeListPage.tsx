import { Add } from "@mui/icons-material";
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
} from "../../../bindings/github.com/michael-freling/anime-image-viewer/internal/frontend";
import Layout from "../../Layout";

const AnimeListPage: FC = () => {
  const [items, setItems] = useState<AnimeListItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
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

  return (
    <Layout.Main
      actionHeader={
        <>
          <Typography level="title-lg">Anime</Typography>
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
        </>
      }
    >
      <Box sx={{ p: 2 }}>
        {loading && <Typography>Loading...</Typography>}
        {!loading && items != null && items.length === 0 && (
          <Typography level="body-md" sx={{ color: "text.secondary" }}>
            No anime yet. Click &quot;Create anime&quot; to get started.
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
    </Layout.Main>
  );
};

export default AnimeListPage;
