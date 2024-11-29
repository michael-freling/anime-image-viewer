import { useEffect, useState } from "react";
import DirectoryExplorer from "./DirectoryExplorer";
import {
  ImageFile,
  Service,
} from "../bindings/github.com/michael-freling/anime-image-viewer/internal/image";
import Box from "@mui/joy/Box";
import LazyImage from "./components/LazyImage";
import Header from "./components/Header";
import Navigation from "./components/Navigation";
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

  // Use MUI and JoyUI at the same time for the tree view
  // https://mui.com/joy-ui/integrations/material-ui/
  return (
    <MaterialThemeProvider theme={{ [MATERIAL_THEME_ID]: materialTheme }}>
      <CssVarsProvider theme={joyTheme}>
        <CssBaseline />
        <Layout.Root>
          <Layout.Header>
            <Header />
          </Layout.Header>
          <Layout.SideNav>
            <Navigation />
          </Layout.SideNav>
          <Layout.SideNav sx={{ overflowY: "auto", maxHeight: "100%" }}>
            <DirectoryExplorer selectDirectory={handleDirectory} />
          </Layout.SideNav>
          <Layout.Main sx={{ overflowY: "auto", maxHeight: "100%" }}>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              }}
            >
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
