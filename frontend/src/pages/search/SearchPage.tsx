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
import {
  SearchService,
  TagService,
} from "../../../bindings/github.com/michael-freling/anime-image-viewer/internal/frontend";
import { Directory } from "../../../bindings/github.com/michael-freling/anime-image-viewer/internal/image";
import { Tag } from "../../../bindings/github.com/michael-freling/anime-image-viewer/internal/tag";
import ImageListContainer, {
  ImageList,
  ViewImage,
} from "../../components/Images/ImageList";
import SelectDirectoryExplorer from "../../components/SelectDirectoryExplorer";
import SelectTagExplorer from "../../components/SelectTagExplorer";
import Layout from "../../Layout";

interface SearchSidebarProps {
  onSelect(directoryId: number, tagId: number): void;
}

const SearchSidebar: FC<SearchSidebarProps> = ({ onSelect }) => {
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [tag, setTag] = useState<Tag | null>();

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
                onSelect(directory?.id ?? 0, tag?.id ?? 0);
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
              <Switch />
            </Stack>
            <SelectTagExplorer
              isMultiSelect={false}
              onSelect={(tag: Tag | null) => {
                setTag(tag);
                onSelect(directory?.id ?? 0, tag?.id ?? 0);
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
  setImages: (images: ViewImage[]) => void;
  imageIdIndexes: { [id: number]: number };
}> = ({ images, taggedImageIds, allTagMap, setImages, imageIdIndexes }) => {
  return (
    <ImageListContainer images={images}>
      {Object.entries(taggedImageIds).map(([tagId, imageIds]) => {
        const tag = allTagMap[tagId];
        return (
          <Box key={tagId}>
            <Box>
              <Typography variant="soft" level="h4" sx={{ p: 2 }}>
                {tag?.fullName}
              </Typography>
            </Box>
            <ImageList
              images={images.filter((image) => imageIds.includes(image.id))}
              onSelect={(selectedImageId) => {
                const index = imageIdIndexes[selectedImageId];
                images[index].selected = !images[index].selected;
                setImages([...images]);
              }}
            />
          </Box>
        );
      })}
    </ImageListContainer>
  );
};

const SearchPage: FC = () => {
  const [allTagMap, setAllTagMap] = useState<{
    [id: number]: Tag;
  }>({});
  const [images, setImages] = useState<ViewImage[]>([]);
  const [imageIdIndexes, setImageIdIndexes] = useState<{
    [id: number]: number;
  }>({});
  const [taggedImageIds, setTaggedImageIds] = useState<{
    [tagId: number]: number[];
  }>({});

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
          onSelect={(directoryId: number, tagId: number) => {
            console.debug("SearchSidebar", {
              directoryId,
              tagId,
            });
            SearchService.SearchImages({
              parentDirectoryId: directoryId,
              tagId: tagId,
            }).then(({ images, taggedImages }) => {
              setImages(images.map((image) => ({ ...image, selected: false })));
              setImageIdIndexes(
                images.reduce((acc, image, index) => {
                  acc[image.id] = index;
                  return acc;
                }, {})
              );
              setTaggedImageIds(taggedImages);
            });
          }}
        />
      </Layout.SideNav>
      <Layout.Main>
        {Object.keys(taggedImageIds).length === 0 && (
          <ImageList
            images={images}
            onSelect={(selectedImageId) => {
              const index = imageIdIndexes[selectedImageId];
              images[index].selected = !images[index].selected;
              setImages([...images]);
            }}
          />
        )}
        {Object.keys(taggedImageIds).length > 0 && (
          <ImageListWithTags
            images={images}
            taggedImageIds={taggedImageIds}
            allTagMap={allTagMap}
            setImages={setImages}
            imageIdIndexes={imageIdIndexes}
          />
        )}
      </Layout.Main>
    </Box>
  );
};
export default SearchPage;
