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
import {
  ChangeEvent,
  FC,
  memo,
  PropsWithChildren,
  useCallback,
  useEffect,
  useState,
} from "react";
import { createSearchParams, useNavigate } from "react-router";
import { Image } from "../../../bindings/github.com/michael-freling/anime-image-viewer/internal/frontend";

import LazyImage from "../../components/LazyImage";
import Layout from "../../Layout";

export type ViewImageType = Image & {
  selected: boolean;
};

const ImageCard = memo(function ImageCard({
  image,
  width,
  onChange,
}: {
  image: ViewImageType;
  width: number;
  onChange: (
    event: ChangeEvent<HTMLInputElement>,
    image: ViewImageType
  ) => void;
}) {
  return (
    <Card
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
          checked={image.selected}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            onChange(event, image);
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

export const ImageList: FC<{
  images: ViewImageType[];
  onChange: (
    checkboxEvent: ChangeEvent<HTMLInputElement>,
    image: ViewImageType
  ) => void;
}> = ({ images, onChange }) => {
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
        <ImageCard
          key={image.id}
          image={image}
          width={width}
          onChange={onChange}
        />
      ))}
    </Box>
  );
};

export interface ImageListContainerProps {
  loadedImages: Image[];
  withListWrappedComponent?: (children: JSX.Element) => JSX.Element[];
}

const ImageListMain: FC<ImageListContainerProps & PropsWithChildren> = ({
  loadedImages,
  withListWrappedComponent,
}) => {
  const [images, setImages] = useState<ViewImageType[]>([]);
  const [imageIndexes, setImageIndexes] = useState<{ [id: number]: number }>(
    {}
  );

  useEffect(() => {
    if (!loadedImages) {
      return;
    }

    setImages(
      loadedImages.map((image) => ({
        ...image,
        selected: false,
      }))
    );

    const indexes: { [id: number]: number } = {};
    loadedImages.forEach((image, index) => {
      indexes[image.id] = index;
    });
    setImageIndexes(indexes);
  }, [loadedImages]);

  const selectedImageCount = images.filter((image) => image.selected).length;
  const navigate = useNavigate();

  const toggleImageSelects = (selectedImageIds: number[]) => {
    // https://alexsidorenko.com/blog/react-list-rerender
    let result: { [id: number]: ViewImageType } = [];
    const imageIdSet = new Set(selectedImageIds);
    setImages((previousImages) =>
      previousImages.map((image) => {
        if (!imageIdSet.has(image.id)) {
          return image;
        }

        const newImage = {
          ...image,
          selected: !image.selected,
        };
        result[image.id] = newImage;
        return newImage;
      })
    );
    return result;
  };

  // Enable to select images by a shirt key
  const [, setStartElement] = useState<ViewImageType>();
  useEffect(() => {
    if (loadedImages.length === 0) {
      return;
    }

    setStartElement(undefined);
  }, [loadedImages]);

  const onChange = useCallback(
    (checkboxEvent: ChangeEvent<HTMLInputElement>, image: ViewImageType) => {
      // @ts-ignore
      const isShiftKeyPressed: boolean = checkboxEvent.nativeEvent.shiftKey;

      setStartElement((startElement) => {
        if (!isShiftKeyPressed || !startElement || !startElement.id) {
          const results = toggleImageSelects([image.id]);
          return {
            ...results[image.id],
          };
        }

        let startIndex = imageIndexes[startElement.id];
        let endIndex = imageIndexes[image.id];
        if (startIndex === -1 || endIndex === -1) {
          throw new Error(
            "Image not found in the list while selecting with a shift key"
          );
        }

        if (startIndex > endIndex) {
          [startIndex, endIndex] = [endIndex, startIndex - 1];
        } else {
          startIndex++;
        }
        const imageIds: number[] = [];
        for (let i = startIndex; i <= endIndex; i++) {
          for (const [id, index] of Object.entries(imageIndexes)) {
            if (index === i) {
              imageIds.push(parseInt(id));
              break;
            }
          }
        }
        toggleImageSelects(imageIds);
        return startElement;
      });
    },
    [loadedImages, imageIndexes]
  );

  const children = withListWrappedComponent ? (
    withListWrappedComponent(<ImageList images={images} onChange={onChange} />)
  ) : (
    <ImageList images={images} onChange={onChange} />
  );

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
