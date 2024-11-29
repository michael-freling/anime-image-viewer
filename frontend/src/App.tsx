import { useEffect, useState } from "react";
import DirectoryExplorer from "./DirectoryExplorer";
import {
  ImageFile,
  Service,
} from "../bindings/github.com/michael-freling/anime-image-viewer/internal/image";
import { Box, Container, ImageList, ImageListItem } from "@mui/material";
import LazyImage from "./components/LazyImage";

// window size
// https://bobbyhadz.com/blog/react-get-window-width-height
function getWindowSize() {
  const { innerWidth, innerHeight } = window;
  return { innerWidth, innerHeight };
}

export interface UserImages {
  userImages: ImageFile[];
}

function App() {
  const [windowSize, setWindowSize] = useState(getWindowSize());
  const [images, setImages] = useState<UserImages>({
    userImages: [],
  });

  useEffect(() => {
    function handleWindowResize() {
      setWindowSize(getWindowSize());
    }

    window.addEventListener("resize", handleWindowResize);

    return () => {
      window.removeEventListener("resize", handleWindowResize);
    };
  }, []);

  useEffect(() => {
    // Reload WML so it picks up the wml tags
    // WML.Reload();
  }, []);

  const handleDirectory = async (directory) => {
    const images = await Service.ReadImageFiles(directory);
    setImages({
      userImages: images,
    });
  };

  const directoryExplorerWidth = windowSize.innerWidth * 0.2;
  const columns = 3;
  const aspectRatio = 16.0 / 9.0;
  const rowHeight =
    (windowSize.innerWidth - directoryExplorerWidth) / columns / aspectRatio;

  return (
    <Container maxWidth={false} style={{ display: "flex" }}>
      <Box width={directoryExplorerWidth}>
        <DirectoryExplorer selectDirectory={handleDirectory} />
      </Box>
      <Box>
        <ImageList
          sx={{
            margin: 0,
            padding: 0,
          }}
          cols={columns}
          rowHeight={rowHeight}
        >
          {images.userImages.map((userImage) => (
            <ImageListItem key={userImage.Path}>
              <LazyImage
                src={userImage.Path}
                width={windowSize.innerWidth / columns}
                height={rowHeight}
                style={{
                  height: "100%",
                }}
              />
            </ImageListItem>
          ))}
        </ImageList>
        <Box>
          <div className="card">
            <div></div>
          </div>
          <div className="footer">
            <div>
              <p>Footer</p>
            </div>
          </div>
        </Box>
      </Box>
    </Container>
  );
}

export default App;
