import {
  ArrowBackIos,
  ArrowForwardIos,
  ZoomIn,
  ZoomOut,
  ZoomOutMap,
} from "@mui/icons-material";
import { Box, IconButton, ModalClose } from "@mui/joy";
import { FC, useEffect, useState } from "react";
import {
  TransformComponent,
  TransformWrapper,
  useControls,
} from "react-zoom-pan-pinch";
import { ViewImageType } from "./ViewImage";

interface ImageWindowProps {
  images: ViewImageType[];
  initialId: number;
}

const TransformControls = () => {
  const { zoomIn, zoomOut, resetTransform } = useControls();

  const iconSize = "lg";
  return (
    <Box
      sx={{
        position: "absolute",
        top: 10,
        left: 10,
        zIndex: 10,
        p: 0,
        m: 0,
      }}
    >
      <IconButton size={iconSize} onClick={() => zoomIn()}>
        <ZoomIn />
      </IconButton>
      <IconButton size={iconSize} onClick={() => zoomOut()}>
        <ZoomOut />
      </IconButton>
      <IconButton size={iconSize} onClick={() => resetTransform()}>
        <ZoomOutMap />
      </IconButton>
    </Box>
  );
};

const ImageWindow: FC<ImageWindowProps> = ({ images, initialId }) => {
  const initialIndex = images.findIndex((image) => image.id === initialId);
  const [index, setIndex] = useState(initialIndex);

  useEffect(() => {
    setIndex(initialIndex);
  }, [images]);

  console.debug("ImageWindow", { images, initialId, initialIndex, index });

  // https://github.com/BetterTyped/react-zoom-pan-pinch
  return (
    <TransformWrapper initialScale={1}>
      {({ zoomIn, zoomOut, resetTransform }) => (
        <>
          <Box sx={{ position: "relative" }}>
            <TransformComponent>
              <img
                src={images[index].path}
                style={{ width: "100%", height: "auto" }}
              />
            </TransformComponent>

            <ModalClose />
            <TransformControls />
            <IconButton
              sx={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: 0,
                height: "100%",
              }}
              onClick={() =>
                setIndex((index - 1 + images.length) % images.length)
              }
            >
              <ArrowBackIos />
            </IconButton>
            <IconButton
              sx={{
                position: "absolute",
                height: "100%",
                top: 0,
                bottom: 0,
                right: 0,
              }}
              onClick={() => setIndex((index + 1) % images.length)}
            >
              <ArrowForwardIos />
            </IconButton>
          </Box>
        </>
      )}
    </TransformWrapper>
  );
};
export default ImageWindow;
