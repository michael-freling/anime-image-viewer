import { Search } from "@mui/icons-material";
import {
  Box,
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
import {
  AniListSearchResult,
  AnimeService,
} from "../../../bindings/github.com/michael-freling/anime-image-viewer/internal/frontend";

interface AniListSearchModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (result: AniListSearchResult) => void;
  title?: string;
}

function formatSeason(season: string): string {
  if (!season) return "";
  return season.charAt(0).toUpperCase() + season.slice(1).toLowerCase();
}

const AniListSearchModal: FC<AniListSearchModalProps> = ({
  open,
  onClose,
  onSelect,
  title = "Search AniList",
}) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AniListSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setLoading(false);
      setError(null);
      setSearched(false);
    }
  }, [open]);

  const doSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (trimmed === "") {
      setResults([]);
      setSearched(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await AnimeService.SearchAniList(trimmed);
      setResults(res ?? []);
      setSearched(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setResults([]);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      doSearch(value);
    }, 300);
  };

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current != null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleSelect = (result: AniListSearchResult) => {
    onSelect(result);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog sx={{ minWidth: 520, maxHeight: "80vh" }}>
        <ModalClose />
        <Typography level="title-md">{title}</Typography>
        <Stack spacing={2} sx={{ mt: 2 }}>
          <Input
            autoFocus
            placeholder="Search anime on AniList..."
            startDecorator={<Search />}
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
          />

          {loading && (
            <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
              <CircularProgress size="sm" />
            </Box>
          )}

          {error && (
            <Typography level="body-sm" color="danger">
              {error}
            </Typography>
          )}

          {!loading && !error && !searched && (
            <Typography
              level="body-sm"
              sx={{ color: "text.secondary", textAlign: "center", py: 3 }}
            >
              Type to search AniList
            </Typography>
          )}

          {!loading && !error && searched && results.length === 0 && (
            <Typography
              level="body-sm"
              sx={{ color: "text.secondary", textAlign: "center", py: 3 }}
            >
              No results found
            </Typography>
          )}

          {!loading && results.length > 0 && (
            <List
              variant="outlined"
              sx={{
                borderRadius: "sm",
                maxHeight: 400,
                overflow: "auto",
              }}
            >
              {results.map((result, idx) => {
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
                      <ListItemButton onClick={() => handleSelect(result)}>
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
        </Stack>
      </ModalDialog>
    </Modal>
  );
};

export default AniListSearchModal;
