import {
  Box,
  Card,
  CardOverflow,
  Checkbox,
  //  Link,
  Typography,
} from "@mui/joy";
import { CardActions } from "@mui/material";
import { FC, useEffect, useState } from "react";
import { useParams } from "react-router";
import {
  DirectoryService,
  ImageFile,
} from "../../bindings/github.com/michael-freling/anime-image-viewer/internal/image";
import LazyImage from "../components/LazyImage";

export interface UserImages {
  userImages: Array<
    ImageFile & {
      selected: boolean;
    }
  >;
}

const ImageListPage: FC = () => {
  const { directoryId, tagId } = useParams();
  const [images, setImages] = useState<UserImages>({
    userImages: [],
  });
  console.debug("image list page", {
    directoryId,
    tagId,
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

  const readTag = async (tagId: string) => {
    // todo
  };

  useEffect(() => {
    if (directoryId) {
      readDirectory(directoryId);
    }
    if (tagId) {
      // todo
      readTag(tagId);
    }
  }, [directoryId]);

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
      }}
    >
      {images.userImages.map((userImage, imageIndex) => (
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
                images.userImages[imageIndex].selected = !userImage.selected;
                setImages({
                  ...images,
                });
              }}
            />
            <Typography level="title-sm">{userImage.Name}</Typography>
          </CardActions>
          <CardOverflow>
            <LazyImage src={userImage.Path} />
          </CardOverflow>
        </Card>
      ))}
    </Box>
  );
};
export default ImageListPage;
