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
import {
  DirectoryService,
  ImageFile,
} from "../../../bindings/github.com/michael-freling/anime-image-viewer/internal/image";
import LazyImage from "../../components/LazyImage";

export interface UserImages {
  userImages: Array<
    ImageFile & {
      selected: boolean;
    }
  >;
}

const DirectoryImageListPage: FC = () => {
  const { directoryId } = useParams();
  const [, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [images, setImages] = useState<UserImages>({
    userImages: [],
  });

  const readDirectory = async (directoryId: string) => {
    if (!directoryId) {
      return;
    }
    const images = await DirectoryService.ReadImageFiles(
      parseInt(directoryId, 10)
    );
    setImages({
      userImages: images.map((image) => ({
        ...image,
        selected: false,
      })),
    });
  };

  useEffect(() => {
    if (directoryId) {
      readDirectory(directoryId);
    }
  }, [directoryId]);

  const selectedImageCount = images.userImages.filter(
    (image) => image.selected
  ).length;
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Stack direction="row" gap={2} alignItems="center">
        <Typography>Selected {selectedImageCount} images</Typography>
        <Button
          color="primary"
          disabled={selectedImageCount === 0}
          onClick={() => {
            const imageIds = images.userImages
              .filter((image) => image.selected)
              .map((image) => String(image.id));
            setSearchParams({
              imageIds: imageIds,
            });
            navigate(
              "/images/edit/tags/suggestion?imageIds=" +
                encodeURIComponent(imageIds.join(","))
            );
          }}
        >
          Suggest tags
        </Button>
        <Button
          variant="outlined"
          color="primary"
          disabled={selectedImageCount === 0}
          onClick={() => {
            const imageIds = images.userImages
              .filter((image) => image.selected)
              .map((image) => String(image.id));
            setSearchParams({
              imageIds: imageIds,
            });
            navigate(
              "/images/edit/tags?imageIds=" +
                encodeURIComponent(imageIds.join(","))
            );
          }}
        >
          Edit tags manually
        </Button>
      </Stack>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
        }}
      >
        {images.userImages.map((userImage, imageIndex) => (
          <Card
            key={userImage.path}
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
                  images.userImages[imageIndex].selected = !userImage.selected;
                  setImages({
                    ...images,
                  });
                }}
              />
              <Typography level="title-sm">
                {userImage.name.substring(0, 10)}...
                {userImage.name.substring(userImage.name.length - 10)}
              </Typography>
            </CardActions>
            <CardOverflow>
              <LazyImage src={userImage.path} />
            </CardOverflow>
          </Card>
        ))}
      </Box>
    </Box>
  );
};
export default DirectoryImageListPage;
