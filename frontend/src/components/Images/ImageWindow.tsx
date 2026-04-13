import {
  ArrowBackIos,
  ArrowForwardIos,
  OpenInNew,
  ZoomIn,
  ZoomOut,
  ZoomOutMap,
} from "@mui/icons-material";
import { Box, IconButton, ModalClose } from "@mui/joy";
import { FC, useEffect, useState } from "react";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import { ImageService } from "../../../bindings/github.com/michael-freling/anime-image-viewer/internal/frontend";
import { ViewImageType } from "./ViewImage";

interface ImageWindowProps {
  images: ViewImageType[];
  initialId: number;
}

const controlButtonSx = {
  color: "white",
  bgcolor: "rgba(0,0,0,0.5)",
  "&:hover": { bgcolor: "rgba(0,0,0,0.7)" },
};

const ImageWindow: FC<ImageWindowProps> = ({ images, initialId }) => {
  const initialIndex = images.findIndex((image) => image.id === initialId);
  const [index, setIndex] = useState(initialIndex);

  useEffect(() => {
    setIndex(initialIndex);
  }, [images]);

  console.debug("ImageWindow", { images, initialId, initialIndex, index });

  const handleOpenInOS = async () => {
    try {
      await ImageService.OpenImageInOS(images[index].id);
    } catch (e) {
      console.error("Failed to open image in OS", e);
    }
  };

  // https://github.com/BetterTyped/react-zoom-pan-pinch
  return (
    <Box
      sx={{
        width: "100%",
        height: "100vh",
        bgcolor: "#1e1e1e",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <TransformWrapper
        key={images[index].id}
        initialScale={1}
        minScale={0.5}
        maxScale={20}
        centerOnInit={true}
        centerZoomedOut={true}
        doubleClick={{ mode: "toggle", step: 2 }}
      >
        {({ zoomIn, zoomOut, resetTransform }) => (
          <>
            <TransformComponent
              wrapperStyle={{ width: "100%", height: "100vh" }}
            >
              <img
                src={images[index].path}
                style={{ maxWidth: "100vw", maxHeight: "100vh" }}
              />
            </TransformComponent>
            <Box
              sx={{
                position: "absolute",
                top: 10,
                left: 10,
                zIndex: 10,
                display: "flex",
                flexDirection: "column",
                gap: 0.5,
              }}
            >
              <IconButton
                size="lg"
                sx={controlButtonSx}
                onClick={() => zoomIn()}
              >
                <ZoomIn />
              </IconButton>
              <IconButton
                size="lg"
                sx={controlButtonSx}
                onClick={() => zoomOut()}
              >
                <ZoomOut />
              </IconButton>
              <IconButton
                size="lg"
                sx={controlButtonSx}
                onClick={() => resetTransform()}
              >
                <ZoomOutMap />
              </IconButton>
              <IconButton
                size="lg"
                sx={controlButtonSx}
                onClick={handleOpenInOS}
              >
                <OpenInNew />
              </IconButton>
            </Box>
          </>
        )}
      </TransformWrapper>

      <ModalClose
        sx={{
          color: "white",
          zIndex: 10,
          bgcolor: "rgba(0,0,0,0.5)",
          "&:hover": { bgcolor: "rgba(0,0,0,0.7)" },
        }}
      />

      <IconButton
        sx={{
          position: "absolute",
          left: 8,
          top: "50%",
          transform: "translateY(-50%)",
          zIndex: 10,
          ...controlButtonSx,
        }}
        onClick={() => setIndex((index - 1 + images.length) % images.length)}
      >
        <ArrowBackIos />
      </IconButton>
      <IconButton
        sx={{
          position: "absolute",
          right: 8,
          top: "50%",
          transform: "translateY(-50%)",
          zIndex: 10,
          ...controlButtonSx,
        }}
        onClick={() => setIndex((index + 1) % images.length)}
      >
        <ArrowForwardIos />
      </IconButton>
    </Box>
  );
};
export default ImageWindow;
