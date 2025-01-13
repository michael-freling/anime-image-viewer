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
}

const SearchSidebar: FC<SearchSidebarProps> = ({ condition }) => {
  const navigate = useNavigate();

  const onSelect = ({
    directoryId,
    tagId,
    isInvertedTagSearch,
  }: SearchCondition) => {
    const params: any = { ...condition };
    if (directoryId != null) {
      params.directoryId = directoryId;
    }
    if (tagId != null) {
      params.tagId = tagId;
    }
    if (isInvertedTagSearch != null) {
      params.isInvertedTagSearch = isInvertedTagSearch;
    }

    navigate({
      search: createSearchParams(params).toString(),
    });
  };

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

function useRequest(): SearchCondition {
  const [searchParams] = useSearchParams();
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
  const condition: SearchCondition = useRequest();
  const [allTagMap, setAllTagMap] = useState<{
    [id: number]: Tag;
  }>({});
  const [images, setImages] = useState<Image[]>([]);
  const [taggedImageIds, setTaggedImageIds] = useState<{
    [tagId: number]: number[];
  }>({});

  console.debug("SearchPage", {
    allTagMap,
    images,
    taggedImageIds,
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
    SearchService.SearchImages(condition).then(({ images, taggedImages }) => {
      setImages(images.map((image) => ({ ...image, selected: false })));
      setTaggedImageIds(taggedImages);
    });
  }, [condition.directoryId, condition.tagId, condition.isInvertedTagSearch]);

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
        <SearchSidebar condition={condition} />
      </Layout.SideNav>
      {Object.keys(taggedImageIds).length == 0 && (
        <ImageListMain loadedImages={images} />
      )}
      {Object.keys(taggedImageIds).length > 0 && (
        <ImageListMain
          loadedImages={images}
          withListWrappedComponent={(children) => {
            return Object.entries(taggedImageIds).map(([tagId]) => {
              const tag = allTagMap[tagId];
              return (
                <Box key={tagId} sx={{ gap: 2 }}>
                  <Box>
                    <Typography variant="soft" level="h4" sx={{ p: 2 }}>
                      {tag?.fullName}
                    </Typography>
                  </Box>
                  {children}
                </Box>
              );
            });
          }}
        />
      )}
    </Box>
  );
};
export default SearchPage;
