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
import { FC, useCallback, useEffect, useState } from "react";
import {
  SearchService,
  TagService,
} from "../../../bindings/github.com/michael-freling/anime-image-viewer/internal/frontend";
import { Directory } from "../../../bindings/github.com/michael-freling/anime-image-viewer/internal/image";
import { Tag } from "../../../bindings/github.com/michael-freling/anime-image-viewer/internal/tag";
import ImageListMain, {
  ImageList,
  ViewImage,
} from "../../components/Images/ImageList";
import SelectDirectoryExplorer from "../../components/SelectDirectoryExplorer";
import SelectTagExplorer from "../../components/SelectTagExplorer";
import Layout from "../../Layout";

interface SearchSidebarProps {
  isDirectorySelected: boolean;
  onSelect(
    directoryId: number,
    tagId: number,
    isInvertedTagSearch: boolean
  ): void;
}

const SearchSidebar: FC<SearchSidebarProps> = ({
  isDirectorySelected,
  onSelect,
}) => {
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [tag, setTag] = useState<Tag | null>();
  const [isInvertedTagSearch, setTagInvertedSearch] = useState<boolean>(false);

  return (
    <AccordionGroup>
      <Accordion defaultExpanded={true}>
        <AccordionSummary>
          <Avatar color="primary">
            <Folder />
          </Avatar>
          <ListItemContent>
            <Typography level="title-md">Directory</Typography>
            <Typography level="body-sm">
              {directory == null ? "Not selected" : directory.name}
            </Typography>
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
              isMultiSelect={false}
              onSelect={(directory) => {
                setDirectory(directory);
                onSelect(directory?.id ?? 0, tag?.id ?? 0, isInvertedTagSearch);
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
            <Typography level="body-sm">
              {tag == null ? "Not selected" : tag.full_name}
            </Typography>
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
                checked={isInvertedTagSearch}
                disabled={!isDirectorySelected}
                onChange={(event) => {
                  setTagInvertedSearch(event.target.checked);
                  onSelect(
                    directory?.id ?? 0,
                    tag?.id ?? 0,
                    event.target.checked
                  );
                }}
              />
            </Stack>
            <SelectTagExplorer
              isMultiSelect={false}
              onSelect={(tag: Tag | null) => {
                setTag(tag);
                onSelect(directory?.id ?? 0, tag?.id ?? 0, isInvertedTagSearch);
              }}
            />
          </Box>
        </AccordionDetails>
      </Accordion>
    </AccordionGroup>
  );
};

const ImageListWithTags: FC<{
  images: ViewImage[];
  taggedImageIds: { [tagId: number]: number[] };
  allTagMap: { [id: number]: Tag };
  onSelect: (selectedImageId: number) => void;
}> = ({ images, taggedImageIds, allTagMap, onSelect }) => {
  return (
    <>
      {Object.entries(taggedImageIds).map(([tagId, imageIds]) => {
        const tag = allTagMap[tagId];
        return (
          <Box key={tagId} sx={{ gap: 2 }}>
            <Box>
              <Typography variant="soft" level="h4" sx={{ p: 2 }}>
                {tag?.fullName}
              </Typography>
            </Box>
            <ImageList
              images={images.filter((image) => imageIds.includes(image.id))}
              onSelect={onSelect}
            />
          </Box>
        );
      })}
    </>
  );
};

const SearchPage: FC = () => {
  const [isDirectorySelected, setDirectorySelected] = useState<boolean>(false);
  const [allTagMap, setAllTagMap] = useState<{
    [id: number]: Tag;
  }>({});
  const [images, setImages] = useState<ViewImage[]>([]);
  const [taggedImageIds, setTaggedImageIds] = useState<{
    [tagId: number]: number[];
  }>({});

  const onSelect = useCallback((selectedImageId: number) => {
    // https://alexsidorenko.com/blog/react-list-rerender
    setImages((previousImages) =>
      previousImages.map((image) => {
        if (image.id !== selectedImageId) {
          return image;
        }

        return {
          ...image,
          selected: !image.selected,
        };
      })
    );
  }, []);

  console.debug("SearchPage", {
    allTagMap,
    images,
    taggedImageIds,
  });

  useEffect(() => {
    if (Object.keys(allTagMap).length > 0) {
      return;
    }

    TagService.ReadAllMap().then((tagMap) => {
      setAllTagMap(tagMap);
    });
  }, []);

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
          isDirectorySelected={isDirectorySelected}
          onSelect={(
            directoryId: number,
            tagId: number,
            isInvertedTagSearch: boolean
          ) => {
            if (directoryId === 0) {
              setDirectorySelected(false);
            } else {
              setDirectorySelected(true);
            }

            console.debug("SearchSidebar", {
              directoryId,
              tagId,
              isInvertedTagSearch,
            });
            SearchService.SearchImages({
              directoryId,
              tagId,
              isInvertedTagSearch,
            }).then(({ images, taggedImages }) => {
              setImages(images.map((image) => ({ ...image, selected: false })));
              setTaggedImageIds(taggedImages);
            });
          }}
        />
      </Layout.SideNav>
      <ImageListMain images={images}>
        {Object.keys(taggedImageIds).length === 0 && (
          <ImageList images={images} onSelect={onSelect} />
        )}
        {Object.keys(taggedImageIds).length > 0 && (
          <ImageListWithTags
            images={images}
            taggedImageIds={taggedImageIds}
            allTagMap={allTagMap}
            onSelect={onSelect}
          />
        )}
      </ImageListMain>
    </Box>
  );
};
export default SearchPage;
