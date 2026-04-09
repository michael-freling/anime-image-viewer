import { Bookmark, Folder, Tv } from "@mui/icons-material";
import {
  Accordion,
  AccordionDetails,
  AccordionGroup,
  AccordionSummary,
  Avatar,
  Box,
  ListItemContent,
  Option,
  Select,
  Stack,
  Switch,
  Typography,
} from "@mui/joy";
import { FC, useEffect, useState } from "react";
import { createSearchParams, useNavigate, useSearchParams } from "react-router";
import {
  AnimeListItem,
  AnimeService,
  Image,
  SearchImagesRequest,
  SearchService,
  TagService,
} from "../../../bindings/github.com/michael-freling/anime-image-viewer/internal/frontend";
import { Tag } from "../../../bindings/github.com/michael-freling/anime-image-viewer/internal/tag";
import ImageListMain from "../../components/Images/ImageList";
import SelectDirectoryExplorer from "../../components/SelectDirectoryExplorer";
import SelectTagExplorer from "../../components/SelectTagExplorer";
import Layout from "../../Layout";

type AnimeFilter = "all" | "unassigned" | number;

interface SearchCondition extends SearchImagesRequest {
  animeFilter?: AnimeFilter;
}

interface SearchSidebarProps {
  condition: SearchCondition;
  animeList: AnimeListItem[];
  onSelect: (
    condition: SearchCondition,
    searchParams?: URLSearchParams
  ) => void;
  onAnimeFilterChange: (filter: AnimeFilter) => void;
}

const SearchSidebar: FC<SearchSidebarProps> = ({
  condition,
  animeList,
  onSelect,
  onAnimeFilterChange,
}) => {
  const animeFilter: AnimeFilter = condition.animeFilter ?? "all";
  const animeSelectValue =
    typeof animeFilter === "number" ? String(animeFilter) : animeFilter;
  return (
    <AccordionGroup>
      <Accordion defaultExpanded={true}>
        <AccordionSummary>
          <Avatar color="primary">
            <Tv />
          </Avatar>
          <ListItemContent>
            <Typography level="title-md">Anime</Typography>
          </ListItemContent>
        </AccordionSummary>
        <AccordionDetails>
          <Box sx={{ p: 1 }}>
            <Select
              value={animeSelectValue}
              onChange={(_e, value) => {
                if (value == null) return;
                if (value === "all") {
                  onAnimeFilterChange("all");
                } else if (value === "unassigned") {
                  onAnimeFilterChange("unassigned");
                } else {
                  const parsed = parseInt(value, 10);
                  if (!Number.isNaN(parsed)) {
                    onAnimeFilterChange(parsed);
                  }
                }
              }}
            >
              <Option value="all">All</Option>
              <Option value="unassigned">Unassigned</Option>
              {animeList.map((a) => (
                <Option key={a.id} value={String(a.id)}>
                  {a.name}
                </Option>
              ))}
            </Select>
          </Box>
        </AccordionDetails>
      </Accordion>
      <Accordion defaultExpanded={true}>
        <AccordionSummary>
          <Avatar color="primary">
            <Folder />
          </Avatar>
          <ListItemContent>
            <Typography level="title-md">Folders</Typography>
          </ListItemContent>
        </AccordionSummary>
        <AccordionDetails>
          <Box
            sx={{
              mt: -1,
              ml: -2,
              mr: -2,
              p: 1,
              height: "100%",
            }}
          >
            <SelectDirectoryExplorer
              selectedDirectoryId={condition.directoryId}
              isMultiSelect={false}
              isOnlyDirectoryShown={true}
              onSelect={(directory) => {
                const req =
                  directory == null ? {} : { directoryId: directory.id };
                onSelect(req);
              }}
            />
          </Box>
        </AccordionDetails>
      </Accordion>
      <Accordion defaultExpanded={true}>
        <AccordionSummary>
          <Avatar color="primary">
            <Bookmark />
          </Avatar>
          <ListItemContent>
            <Typography level="title-md">Tags</Typography>
          </ListItemContent>
        </AccordionSummary>
        <AccordionDetails>
          <Box
            sx={{
              mt: -1,
              ml: -2,
              mr: -2,
              p: 1,
              height: "100%",
            }}
          >
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              sx={{ m: 1, mb: 2 }}
            >
              <Typography>Search images without tags</Typography>
              <Switch
                checked={condition.isInvertedTagSearch}
                disabled={condition.directoryId == null}
                onChange={(event) => {
                  onSelect({
                    isInvertedTagSearch: event.target.checked,
                  });
                }}
              />
            </Stack>
            <SelectTagExplorer
              selectedTagId={condition.tagId}
              isMultiSelect={false}
              onSelect={(tag: Tag | null) => {
                const req = tag == null ? {} : { tagId: tag.id };
                onSelect(req);
              }}
            />
          </Box>
        </AccordionDetails>
      </Accordion>
    </AccordionGroup>
  );
};

function useRequest(searchParams: URLSearchParams): SearchCondition {
  const params: any = {};
  if (searchParams.has("directoryId")) {
    params.directoryId = parseInt(searchParams.get("directoryId")!);
  }
  if (searchParams.has("tagId")) {
    params.tagId = parseInt(searchParams.get("tagId")!);
  }
  if (searchParams.has("isInvertedTagSearch")) {
    params.isInvertedTagSearch =
      searchParams.get("isInvertedTagSearch") === "true";
  }
  if (searchParams.has("animeId")) {
    const raw = searchParams.get("animeId")!;
    if (raw === "unassigned") {
      params.animeFilter = "unassigned";
    } else {
      const parsed = parseInt(raw, 10);
      if (!Number.isNaN(parsed)) {
        params.animeFilter = parsed;
      }
    }
  }
  return params as SearchCondition;
}

const SearchPage: FC = () => {
  const navigate = useNavigate();

  const [searchParams] = useSearchParams();
  const condition: SearchCondition = useRequest(searchParams);
  const [allTagMap, setAllTagMap] = useState<{
    [id: number]: Tag;
  }>({});
  const [images, setImages] = useState<Image[]>([]);
  const [animeList, setAnimeList] = useState<AnimeListItem[]>([]);

  console.debug("SearchPage", {
    allTagMap,
    images,
    condition,
  });

  useEffect(() => {
    if (Object.keys(allTagMap).length > 0) {
      return;
    }

    TagService.ReadAllMap().then((tagMap) => {
      setAllTagMap(tagMap);
    });
  }, []);

  useEffect(() => {
    AnimeService.ListAnime().then((list) => {
      setAnimeList(list ?? []);
    });
  }, []);

  useEffect(() => {
    const fetcher = async () => {
      const { animeFilter } = condition;
      if (animeFilter === "unassigned") {
        const { images } = await AnimeService.SearchImagesUnassigned();
        return images ?? [];
      }
      if (typeof animeFilter === "number") {
        const { images } = await AnimeService.SearchImagesByAnime(animeFilter);
        return images ?? [];
      }
      const { images } = await SearchService.SearchImages(condition);
      return images ?? [];
    };
    fetcher().then((fetched) => {
      setImages(
        fetched.map((image) => ({ ...image, selected: false }))
      );
    });
  }, [
    condition.directoryId,
    condition.tagId,
    condition.isInvertedTagSearch,
    condition.animeFilter,
  ]);

  const onSelect = (
    { directoryId, tagId, isInvertedTagSearch }: SearchCondition,
    newSearchParams?: URLSearchParams
  ) => {
    const params: any = {};
    for (const key of searchParams.keys()) {
      params[key] = searchParams.get(key);
    }

    if (directoryId != null) {
      params.directoryId = directoryId;
    }
    if (tagId != null) {
      params.tagId = tagId;
    }
    if (isInvertedTagSearch != null) {
      params.isInvertedTagSearch = isInvertedTagSearch;
    }
    if (newSearchParams != null) {
      for (const key of newSearchParams.keys()) {
        params[key] = newSearchParams.get(key);
      }
    }

    console.debug("onSelect", params);

    navigate({
      search: createSearchParams(params).toString(),
    });
  };

  const onAnimeFilterChange = (filter: AnimeFilter) => {
    const params: any = {};
    for (const key of searchParams.keys()) {
      if (key === "animeId") continue;
      params[key] = searchParams.get(key);
    }
    if (filter === "unassigned") {
      params.animeId = "unassigned";
    } else if (typeof filter === "number") {
      params.animeId = String(filter);
    }
    navigate({
      search: createSearchParams(params).toString(),
    });
  };

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: {
          xs: "1fr",
          sm: "minmax(450px, 1fr)",
          md: "minmax(240px, 320px) minmax(500px, 1fr)",
        },
        gridTemplateRows: "64px 1fr",
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
        <SearchSidebar
          condition={condition}
          animeList={animeList}
          onSelect={onSelect}
          onAnimeFilterChange={onAnimeFilterChange}
        />
      </Layout.SideNav>
      <ImageListMain
        loadedImages={images}
        searchParams={searchParams}
        setSearchParams={(newSearchParams) => {
          onSelect({}, newSearchParams);
        }}
      />
    </Box>
  );
};
export default SearchPage;
