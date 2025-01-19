import {
  AspectRatio,
  Button,
  Card,
  CardActions,
  CardOverflow,
  Checkbox,
  Modal,
  ModalDialog,
  ModalOverflow,
  //  Link,
  Typography,
} from "@mui/joy";
import {
  ChangeEvent,
  FC,
  PropsWithChildren,
  useCallback,
  useEffect,
  useState,
} from "react";
import { createSearchParams, useNavigate } from "react-router";
import AutoSizer from "react-virtualized-auto-sizer";
import { FixedSizeGrid } from "react-window";
import { Image } from "../../../bindings/github.com/michael-freling/anime-image-viewer/internal/frontend";
import Layout from "../../Layout";
import ModeButtons from "../ModeButtons";
import ImageWindow from "./ImageWindow";
import { ViewImageType } from "./ViewImage";

function ImageCard({
  mode,
  image,
  width,
  onChange,
  onView,
}: {
  mode: Mode;
  image: ViewImageType;
  width: number;
  onChange: (
    event: ChangeEvent<HTMLInputElement>,
    image: ViewImageType
  ) => void;
  onView: (image: ViewImageType) => void;
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
      onClick={() => {
        if (mode === "view") {
          onView(image);
        }
      }}
    >
      <CardActions
        sx={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        {mode == "edit" && (
          <Checkbox
            overlay
            checked={image.selected}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              onChange(event, image);
            }}
          />
        )}
        <Typography level="title-sm">
          {image.name.substring(0, 10)}...
          {image.name.substring(image.name.length - 10)}
        </Typography>
      </CardActions>
      <CardOverflow>
        <AspectRatio ratio="16/9" objectFit="contain">
          <img
            src={image.path + "?width=" + (2 * width).toFixed(0)}
            loading="lazy"
          />
        </AspectRatio>
      </CardOverflow>
    </Card>
  );
}

export const ImageList: FC<{
  mode: Mode;
  images: ViewImageType[];
  onChange: (
    checkboxEvent: ChangeEvent<HTMLInputElement>,
    image: ViewImageType
  ) => void;
  onView: (image: ViewImageType) => void;
}> = ({ mode, images, onChange, onView }) => {
  const minImageWidth = 240;

  return (
    <AutoSizer>
      {({ height, width }) => {
        const columnCount = Math.floor(width / minImageWidth);
        const imageWidth = Math.floor(width / columnCount);
        const imageHeight = Math.ceil(imageWidth * 9) / 16 + 48;

        // todo: make memoized grid works: https://react-window.vercel.app/#/examples/list/memoized-list-items
        return (
          <FixedSizeGrid
            height={height}
            width={width}
            columnCount={columnCount}
            columnWidth={imageWidth}
            overscanRowCount={5}
            rowCount={Math.ceil(images.length / columnCount)}
            rowHeight={imageHeight}
          >
            {({ columnIndex, rowIndex, style }) => {
              const index = rowIndex * columnCount + columnIndex;
              if (index >= images.length) {
                return null;
              }

              const image = images[index];
              return (
                <div style={style}>
                  <ImageCard
                    key={image.id}
                    mode={mode}
                    image={image}
                    width={minImageWidth}
                    onChange={onChange}
                    onView={onView}
                  />
                </div>
              );
            }}
          </FixedSizeGrid>
        );
      }}
    </AutoSizer>
  );
};

const useChangeWithShirtKey = ({ loadedImages, toggleImageSelects }) => {
  const [imageIndexes, setImageIndexes] = useState<{ [id: number]: number }>(
    {}
  );

  const [, setSelectedElements] = useState<{
    startElement: { id: number } | null;
    endElement: { id: number } | null;
  }>();
  useEffect(() => {
    if (loadedImages.length === 0) {
      return;
    }

    setSelectedElements({
      startElement: null,
      endElement: null,
    });
    const indexes: { [id: number]: number } = {};
    loadedImages.forEach((image, index) => {
      indexes[image.id] = index;
    });
    setImageIndexes(indexes);
  }, [loadedImages]);

  return useCallback(
    (checkboxEvent: ChangeEvent<HTMLInputElement>, image: ViewImageType) => {
      // @ts-ignore
      const isShiftKeyPressed: boolean = checkboxEvent.nativeEvent.shiftKey;

      setSelectedElements((selectedElements) => {
        if (
          !isShiftKeyPressed ||
          selectedElements == null ||
          !selectedElements.startElement
        ) {
          toggleImageSelects([image.id]);
          return {
            startElement: {
              id: image.id,
            },
            endElement: null,
          };
        }

        const { startElement, endElement } = selectedElements;
        let startIndex = imageIndexes[startElement.id];
        let endIndex = imageIndexes[image.id];
        if (startIndex === -1 || endIndex === -1) {
          throw new Error(
            "Image not found in the list while selecting with a shift key"
          );
        }

        const getImageIds = (startIndex: number, endIndex: number) => {
          if (startIndex > endIndex) {
            [startIndex, endIndex] = [endIndex, startIndex - 1];
          } else {
            startIndex++;
          }
          let imageIds: number[] = [];
          for (let i = startIndex; i <= endIndex; i++) {
            for (const [id, index] of Object.entries(imageIndexes)) {
              if (index === i) {
                imageIds.push(parseInt(id));
                break;
              }
            }
          }
          return imageIds;
        };

        let imageIds: any[] = [];
        if (endElement != null) {
          if (endElement.id === image.id) {
            return selectedElements;
          }

          // if there is an image chosen at the last time, then
          // 1. Select the images outside of the last selected range
          // 2. Deselect the images inside of the last selected range if they are not selected by the current selection
          // This can be achieved by exclusive OR operation on each index
          // But exclude the image selected the first index
          let previousEndIndex = imageIndexes[endElement.id];
          const minIndex = Math.min(startIndex, endIndex, previousEndIndex);
          const maxIndex = Math.max(startIndex, endIndex, previousEndIndex);
          const selecteds: boolean[] = [];
          for (let i = 0; i <= maxIndex - minIndex; i++) {
            const imageIndex = minIndex + i;

            const isSelected =
              (startIndex < imageIndex && imageIndex <= endIndex) ||
              (endIndex <= imageIndex && imageIndex < startIndex);
            const isPreviousSelected =
              (startIndex < imageIndex && imageIndex <= previousEndIndex) ||
              (previousEndIndex <= imageIndex && imageIndex < startIndex);
            selecteds.push(isSelected !== isPreviousSelected);
          }
          for (let i = 0; i <= maxIndex - minIndex; i++) {
            const imageIndex = minIndex + i;
            if (!selecteds[i]) {
              continue;
            }
            for (const [id, index] of Object.entries(imageIndexes)) {
              if (index === imageIndex) {
                imageIds.push(parseInt(id));
                break;
              }
            }
          }
        } else {
          imageIds = getImageIds(startIndex, endIndex);
        }

        toggleImageSelects(imageIds);
        return {
          startElement,
          endElement: {
            id: image.id,
          },
        };
      });
    },
    [loadedImages, imageIndexes, toggleImageSelects]
  );
};
type Mode = "view" | "edit" | "detail";

export interface ImageListContainerProps {
  loadedImages: Image[];
}

const ImageListMain: FC<ImageListContainerProps & PropsWithChildren> = ({
  loadedImages,
}) => {
  const [images, setImages] = useState<ViewImageType[]>([]);

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
  }, [loadedImages]);

  const selectedImageCount = images.filter((image) => image.selected).length;
  const navigate = useNavigate();

  const toggleImageSelects = useCallback(
    (selectedImageIds: number[]) => {
      // https://alexsidorenko.com/blog/react-list-rerender
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
          return newImage;
        })
      );
    },
    [setImages]
  );

  const [mode, setMode] = useState<Mode>("view");
  const [selectedViewImageId, setSelectedViewImageId] = useState<number | null>(
    null
  );

  const onView = useCallback(
    (image: ViewImageType) => {
      console.debug("onView", {
        image,
        images,
      });
      setSelectedViewImageId(() => {
        return image.id;
      });
      setMode("detail");
    },
    [setMode]
  );

  const onChange = useChangeWithShirtKey({ loadedImages, toggleImageSelects });

  return (
    <Layout.Main
      actionHeader={
        <>
          <Typography>Selected {selectedImageCount} images</Typography>
          <ModeButtons
            defaultMode="view"
            enabledModes={[
              { value: "view", text: "View" },
              { value: "edit", text: "Edit" },
            ]}
            onChange={(newMode) => {
              setMode(newMode);
              if (newMode === "view") {
                setImages(
                  images.map((image) => {
                    if (!image.selected) {
                      return image;
                    }

                    return {
                      ...image,
                      selected: false,
                    };
                  })
                );
              }
            }}
          />

          {mode == "edit" && (
            <>
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
          )}
        </>
      }
    >
      <ImageList
        mode={mode}
        images={images}
        onChange={onChange}
        onView={onView}
      />
      {selectedViewImageId && (
        <Modal open={mode == "detail"} onClose={() => setMode("view")}>
          <ModalOverflow>
            <ModalDialog
              aria-labelledby="modal-dialog-overflow"
              layout="fullscreen"
              sx={{ p: 0, m: 0 }}
            >
              <ImageWindow images={images} initialId={selectedViewImageId} />
            </ModalDialog>
          </ModalOverflow>
        </Modal>
      )}
    </Layout.Main>
  );
};

export default ImageListMain;
