import {
  Box,
  Button,
  Card,
  CardActions,
  CardOverflow,
  Checkbox,
  //  Link,
  Typography,
} from "@mui/joy";
import { FC } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Image } from "../../../bindings/github.com/michael-freling/anime-image-viewer/internal/frontend";

import LazyImage from "../../components/LazyImage";

export type ImageListType = Array<
  Image & {
    selected: boolean;
  }
>;

export interface ImageListProps {
  images: ImageListType;
  onSelect: (index: number) => void;
}

const ImageList: FC<ImageListProps> = ({ images, onSelect }) => {
  const [, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const selectedImageCount = images.filter((image) => image.selected).length;

  return (
    <Box>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 1,

          p: 2,
          height: "calc(100vh - 120px)",
          overflowY: "auto",
        }}
      >
        {images.map((image, imageIndex) => (
          <Card
            key={image.id}
            size="sm"
            color={image.selected ? "primary" : "neutral"}
            variant={image.selected ? "solid" : "outlined"}
            invertedColors={image.selected}
            sx={{
              "&:hover": {
                borderColor: "neutral.outlinedHoverBorder",
                borderWidth: 2,
                opacity: 0.8,
              },
            }}
          >
            <CardActions
              sx={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              <Checkbox
                overlay
                onChange={() => {
                  onSelect(imageIndex);
                }}
              />
              <Typography level="title-sm">
                {image.name.substring(0, 10)}...
                {image.name.substring(image.name.length - 10)}
              </Typography>
            </CardActions>
            <CardOverflow>
              <LazyImage src={image.path} />
            </CardOverflow>
          </Card>
        ))}
      </Box>

      <Card
        sx={{
          position: "sticky",
          bottom: 0,
          p: 1,
          zIndex: 1,

          display: "flex",
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <Typography>Selected {selectedImageCount} images</Typography>
        <Button
          color="primary"
          disabled={selectedImageCount === 0}
          onClick={() => {
            const imageIds = images
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
            const imageIds = images
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
      </Card>
    </Box>
  );
};
export default ImageList;
