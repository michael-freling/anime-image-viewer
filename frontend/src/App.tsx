import { useEffect, useState } from "react";
import DirectoryExplorer from "./components/DirectoryExplorer";
import {
  ImageFile,
  DirectoryService,
  Tag,
} from "../bindings/github.com/michael-freling/anime-image-viewer/internal/image";
import Box from "@mui/joy/Box";
import LazyImage from "./components/LazyImage";
import Header from "./components/Header";
import Navigation, { Menu } from "./components/Navigation";
import {
  Card,
  CardOverflow,
  Checkbox,
  CssBaseline,
  CssVarsProvider,
  extendTheme as joyExtendTheme,
  //  Link,
  Typography,
} from "@mui/joy";
import {
  extendTheme as materialExtendTheme,
  THEME_ID as MATERIAL_THEME_ID,
} from "@mui/material/styles";
import {
  CardActions,
  ThemeProvider as MaterialThemeProvider,
} from "@mui/material";
import Layout from "./Layout";
import TagExplorer from "./components/TagExplorer";

const materialTheme = materialExtendTheme({
  colorSchemes: { light: true, dark: true },
});

// Set the default properties: https://mui.com/joy-ui/customization/themed-components/
const joyTheme = joyExtendTheme({
  components: {
    JoyChip: {
      defaultProps: {},
      styleOverrides: {
        root: {},
      },
    },
  },
});

export interface UserImages {
  userImages: Array<
    ImageFile & {
      selected: boolean;
    }
  >;
}

function App() {
  const [images, setImages] = useState<UserImages>({
    userImages: [],
  });
  const [currentSelectedMenu, setCurrentSelectedMenu] = useState<Menu>(
    Menu.Series
  );

  useEffect(() => {
    // Reload WML so it picks up the wml tags
    // WML.Reload();
  }, []);

  const handleDirectory = async (directory) => {
    const images = await DirectoryService.ReadImageFiles(directory);
    setImages({
      userImages: images.map((image) => ({
        ...image,
        selected: false,
      })),
    });
  };
  const handleTag = async (tag: Tag) => {
    // todo
  };
  const selectMenu = (mode: Menu) => {
    setCurrentSelectedMenu(mode);
  };

  const columnCount = [Menu.Tags, Menu.Directories].includes(
    currentSelectedMenu
  )
    ? 2
    : 3;

  // Use MUI and JoyUI at the same time for the tree view
  // https://mui.com/joy-ui/integrations/material-ui/
  return (
    <MaterialThemeProvider theme={{ [MATERIAL_THEME_ID]: materialTheme }}>
      <CssVarsProvider theme={joyTheme}>
        <CssBaseline />
        <Layout.Root columnCount={columnCount}>
          <Layout.Header>
            <Header />
          </Layout.Header>
          <Layout.SideNav>
            <Navigation
              selectedMenu={currentSelectedMenu}
              selectMenu={selectMenu}
            />
          </Layout.SideNav>

          {[Menu.Series, Menu.SeriesByTags].includes(currentSelectedMenu) && (
            <Layout.SideNav sx={{ overflowY: "auto", maxHeight: "100%" }}>
              {currentSelectedMenu === Menu.Series && (
                <DirectoryExplorer
                  editable={false}
                  selectDirectory={handleDirectory}
                />
              )}
              {currentSelectedMenu === Menu.SeriesByTags && (
                <TagExplorer editable={false} selectTag={handleTag} />
              )}
            </Layout.SideNav>
          )}

          <Layout.Main sx={{ overflowY: "auto", maxHeight: "100%" }}>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              }}
            >
              {currentSelectedMenu === Menu.Directories && (
                <DirectoryExplorer editable={true} />
              )}

              {currentSelectedMenu === Menu.Tags && (
                <TagExplorer editable={true} selectTag={handleTag} />
              )}

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
                        images.userImages[imageIndex].selected =
                          !userImage.selected;
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
          </Layout.Main>
        </Layout.Root>
      </CssVarsProvider>
    </MaterialThemeProvider>
  );
}

export default App;
