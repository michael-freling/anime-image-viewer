import { useEffect, useState } from "react";
import DirectoryExplorer from "./DirectoryExplorer";
import {
  ImageFile,
  Service,
} from "../bindings/github.com/michael-freling/anime-image-viewer/internal/image";
import { Box, ImageList, ImageListItem, Toolbar } from "@mui/material";
import LazyImage from "./components/LazyImage";
import Header from "./components/Header";
import Navigation from "./components/Navigation";

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

  const drawerWidth = 240;
  const directoryExplorerWidth = (windowSize.innerWidth - drawerWidth) * 0.2;
  const columns = 4;
  const aspectRatio = 16.0 / 9.0;
  const rowHeight =
    (windowSize.innerWidth - drawerWidth - directoryExplorerWidth) /
    columns /
    aspectRatio;

  return (
    <Box
      component="div"
      style={{ display: "flex", minWidth: "100vw", minHeight: "100vh" }}
    >
      <Header />
      <Navigation drawerWidth={drawerWidth} />
      <Box
        style={{
          maxHeight: "100%",
          margin: 0,
          padding: 0,
        }}
      >
        {/* Put a toolbar for the space of the AppBar */}
        <Toolbar />

        <Box
          style={{
            maxHeight: "100%",
            display: "flex",
            alignItems: "flex-start",
          }}
        >
          {/* todo: maxHeight: 100% doesn't work with overflowY for some reason */}
          <Box
            width={directoryExplorerWidth}
            style={{ maxHeight: "100vh", overflowY: "scroll" }}
          >
            <DirectoryExplorer selectDirectory={handleDirectory} />
          </Box>

          <Box
            component="main"
            minWidth="50vw"
            style={{
              height: "100vh",
              overflowY: "auto",
              flexGrow: 1,
            }}
          >
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
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

export default App;
