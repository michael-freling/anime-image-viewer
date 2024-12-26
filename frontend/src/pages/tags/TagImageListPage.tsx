import {
  Box,
  Button,
  Card,
  CardOverflow,
  Checkbox,
  Stack,
  //  Link,
  Typography,
} from "@mui/joy";
import { CardActions } from "@mui/material";
import { FC, useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { ImageFile } from "../../../bindings/github.com/michael-freling/anime-image-viewer/internal/image";
import {
  Tag,
  TagFrontendService,
} from "../../../bindings/github.com/michael-freling/anime-image-viewer/internal/tag";
import LazyImage from "../../components/LazyImage";

export interface UserImages {
  tags: Array<Tag>;
  userImages: {
    [key: number]: Array<
      ImageFile & {
        selected: boolean;
      }
    >;
  };
}

const TagImageListPage: FC = () => {
  const { tagId } = useParams();
  const [, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [images, setImages] = useState<UserImages>({
    tags: [],
    userImages: {},
  });

  const readTag = async (tagId: string) => {
    const response = await TagFrontendService.ReadImageFiles(
      parseInt(tagId, 10)
    );
    let userImages: {
      [key: number]: Array<ImageFile & { selected: boolean }>;
    } = {};
    for (let [tagID, images] of Object.entries(response.ImageFiles)) {
      userImages[tagID] = images.map((image) => ({
        ...image,
        selected: false,
      }));
    }
    setImages({
      tags: response.Tags,
      userImages,
    });
  };

  useEffect(() => {
    if (tagId) {
      readTag(tagId);
    }
  }, [tagId]);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Box>
        <Button
          variant="outlined"
          color="primary"
          onClick={() => {
            let selectedImageIds: string[] = [];
            for (let tagID in images.userImages) {
              selectedImageIds = selectedImageIds.concat(
                images.userImages[tagID]
                  .filter((image) => image.selected)
                  .map((image) => String(image.ID))
              );
            }
            selectedImageIds = Array.from(new Set(selectedImageIds)).sort();
            setSearchParams({
              imageIds: selectedImageIds,
            });
            navigate(
              "/images/edit/tags?imageIds=" +
                encodeURIComponent(selectedImageIds.join(","))
            );
          }}
        >
          Edit tags
        </Button>
      </Box>
      {images.tags.map((tag) => (
        <Stack key={tag.id} spacing={2}>
          <Box>
            <Typography variant="soft" level="h4">
              {tag.full_name}
            </Typography>
          </Box>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            }}
          >
            {images.userImages[tag.id].map((userImage, imageIndex) => (
              <Card
                key={userImage.Path}
                size="sm"
                color={userImage.selected ? "primary" : "neutral"}
                variant={userImage.selected ? "solid" : "outlined"}
                invertedColors={userImage.selected}
                sx={{
                  "&:hover": {
                    borderColor: "neutral.outlinedHoverBorder",
                    borderWidth: 2,
                    opacity: 0.8,
                  },
                }}
              >
                <CardActions>
                  <Checkbox
                    overlay
                    onChange={() => {
                      images.userImages[tag.id][imageIndex].selected =
                        !userImage.selected;
                      setImages({
                        ...images,
                      });
                    }}
                  />
                  <Typography level="title-sm">
                    {userImage.Name.substring(0, 10)}...
                    {userImage.Name.substring(userImage.Name.length - 10)}
                  </Typography>
                </CardActions>
                <CardOverflow>
                  <LazyImage src={userImage.Path} />
                </CardOverflow>
              </Card>
            ))}
          </Box>
        </Stack>
      ))}
    </Box>
  );
};
export default TagImageListPage;
