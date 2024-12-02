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
  CssBaseline,
  CssVarsProvider,
  extendTheme as joyExtendTheme,
  Link,
} from "@mui/joy";
import {
  extendTheme as materialExtendTheme,
  THEME_ID as MATERIAL_THEME_ID,
} from "@mui/material/styles";
import { ThemeProvider as MaterialThemeProvider } from "@mui/material";
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
  userImages: ImageFile[];
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
      userImages: images,
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

              {images.userImages.map((userImage) => (
                <Card
                  key={userImage.Path}
                  size="sm"
                  sx={{
                    "&:hover": {
                      boxShadow: "sm",
                      borderColor: "neutral.outlinedHoverBorder",
                      borderWidth: 2,
                      opacity: 0.8,
                    },
                  }}
                >
                  <CardOverflow>
                    <LazyImage src={userImage.Path} />
                    {/* Enable to change a whole card actionable: https://mui.com/joy-ui/react-card/#actions */}
                    <Link overlay />
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
