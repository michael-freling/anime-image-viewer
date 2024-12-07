import {
  CssBaseline,
  CssVarsProvider,
  extendTheme as joyExtendTheme,
} from "@mui/joy";
import { ThemeProvider as MaterialThemeProvider } from "@mui/material";
import {
  THEME_ID as MATERIAL_THEME_ID,
  extendTheme as materialExtendTheme,
} from "@mui/material/styles";
import { useEffect } from "react";
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

  useEffect(() => {
    // Reload WML so it picks up the wml tags
    // WML.Reload();
  }, []);

  // Use MUI and JoyUI at the same time for the tree view
  // https://mui.com/joy-ui/integrations/material-ui/
  return (
    <MaterialThemeProvider theme={{ [MATERIAL_THEME_ID]: materialTheme }}>
      <CssVarsProvider theme={joyTheme}>
        <CssBaseline />
        <Outlet />
      </CssVarsProvider>
    </MaterialThemeProvider>
  );
}

export default App;
