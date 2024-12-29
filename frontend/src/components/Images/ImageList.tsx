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
import { FC, memo, PropsWithChildren } from "react";
import { createSearchParams, useNavigate } from "react-router";
import { Image } from "../../../bindings/github.com/michael-freling/anime-image-viewer/internal/frontend";

import LazyImage from "../../components/LazyImage";
import Layout from "../../Layout";

export type ViewImage = Image & {
  selected: boolean;
};

export interface ImageListProps {
  images: ViewImage[];
  onSelect: (selectedImageId: number) => void;
}

const ImageCard = memo(function ImageCard({
  image,
  width,
  onSelect,
}: {
  image: ViewImage;
  width: number;
  onSelect: (selectedImageId: number) => void;
}) {
  return (
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
            onSelect(image.id);
          }}
        />
        <Typography level="title-sm">
          {image.name.substring(0, 10)}...
          {image.name.substring(image.name.length - 10)}
        </Typography>
      </CardActions>
      <CardOverflow>
        <LazyImage src={image.path} width={width} />
      </CardOverflow>
    </Card>
  );
});

export const ImageList: FC<ImageListProps> = ({
  images,
  onSelect,
}: ImageListProps) => {
  const width = 240;
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fit, minmax(${width}px, 1fr))`,
        gap: 1,
      }}
    >
      {images.map((image) => (
        <ImageCard image={image} width={width} onSelect={onSelect} />
      ))}
    </Box>
  );
};

export interface ImageListContainerProps {
  images: ViewImage[];
}

const ImageListMain: FC<ImageListContainerProps & PropsWithChildren> = ({
  images,
  children,
}) => {
  const selectedImageCount = images.filter((image) => image.selected).length;
  const navigate = useNavigate();

  return (
    <Layout.Main
      actionHeader={
        <>
          <Typography>Selected {selectedImageCount} images</Typography>
          <Button
            color="primary"
            disabled={selectedImageCount === 0}
            onClick={() => {
              const imageIds = images
                .filter((image) => image.selected)
                .map((image) => String(image.id));
              navigate({
                pathname: "/images/edit/tags/suggestion",
                search: createSearchParams({
                  imageIds: imageIds,
                }).toString(),
              });
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
              navigate({
                pathname: "/images/edit/tags",
                search: createSearchParams({
                  imageIds: imageIds,
                }).toString(),
              });
            }}
          >
            Edit tags manually
          </Button>
        </>
      }
    >
      {children}
    </Layout.Main>
  );
};
export default ImageListMain;
