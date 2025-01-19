import { Bookmark, Folder } from "@mui/icons-material";
import {
  Accordion,
  AccordionDetails,
  AccordionGroup,
  AccordionSummary,
  Avatar,
  Box,
  ListItemContent,
  Stack,
  Switch,
  Typography,
} from "@mui/joy";
import { FC, useEffect, useState } from "react";
import { createSearchParams, useNavigate, useSearchParams } from "react-router";
import {
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

type SearchCondition = SearchImagesRequest;

interface SearchSidebarProps {
  condition: SearchCondition;
  onSelect: (
    condition: SearchCondition,
    searchParams?: URLSearchParams
  ) => void;
}

const SearchSidebar: FC<SearchSidebarProps> = ({ condition, onSelect }) => {
  return (
    <AccordionGroup>
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
  let params: any = {};
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
    SearchService.SearchImages(condition).then(({ images }) => {
      setImages(images.map((image) => ({ ...image, selected: false })));
    });
  }, [condition.directoryId, condition.tagId, condition.isInvertedTagSearch]);

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
        <SearchSidebar condition={condition} onSelect={onSelect} />
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
