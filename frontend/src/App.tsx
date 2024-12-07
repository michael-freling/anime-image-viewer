import {
  CssBaseline,
  CssVarsProvider,
  extendTheme as joyExtendTheme,
} from "@mui/joy";
import Box from "@mui/joy/Box";
import { ThemeProvider as MaterialThemeProvider } from "@mui/material";
import {
  THEME_ID as MATERIAL_THEME_ID,
  extendTheme as materialExtendTheme,
} from "@mui/material/styles";
import { useEffect, useState } from "react";
import Layout from "./Layout";
import DirectoryExplorer from "./components/DirectoryExplorer";
import Header from "./components/Header";
import Navigation, { Menu } from "./components/Navigation";
import TagExplorer from "./components/TagExplorer";
import { Outlet, useLocation } from "react-router";

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

export function App() {
  const location = useLocation();
  console.debug("current url", {
    location: location,
  });

  const [currentSelectedMenu, setCurrentSelectedMenu] = useState<Menu>(
    Menu.Series
  );

  useEffect(() => {
    // Reload WML so it picks up the wml tags
    // WML.Reload();
  }, []);

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
                <DirectoryExplorer editable={false} />
              )}
              {currentSelectedMenu === Menu.SeriesByTags && (
                <TagExplorer editable={false} />
              )}
            </Layout.SideNav>
          )}

          <Layout.Main sx={{ overflowY: "auto", maxHeight: "100%" }}>
            <Box>
              <Outlet />
            </Box>
          </Layout.Main>
        </Layout.Root>
      </CssVarsProvider>
    </MaterialThemeProvider>
  );
}

export default App;
