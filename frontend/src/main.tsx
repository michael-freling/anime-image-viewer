import {
  CssBaseline,
  CssVarsProvider,
  extendTheme as joyExtendTheme,
  StyledEngineProvider,
} from "@mui/joy";
import { ThemeProvider as MaterialThemeProvider } from "@mui/material";
import {
  THEME_ID as MATERIAL_THEME_ID,
  extendTheme as materialExtendTheme,
} from "@mui/material/styles";
import React from "react";
import ReactDOM from "react-dom/client";
import {
  createBrowserRouter,
  Route,
  RouterProvider,
  Routes,
  useLocation,
} from "react-router";
import DirectoryExplorer from "./components/DirectoryExplorer";
import Layout from "./Layout";
import DirectoryEditPage from "./pages/directories/DirectoryEditPage";
import DirectoryImageListPage from "./pages/directories/DirectoryImageListPage";
import DirectorySelectPage from "./pages/directories/DirectorySelectPage";
import SearchPage from "./pages/search/SearchPage";
import DirectoryTagsEditPage from "./pages/tags/DirectoryTagEditPage";
import ImageTagEditPage from "./pages/tags/ImageTagEditPage";
import ImageTagSuggestionPage from "./pages/tags/ImageTagSuggestionPage";
import TagsListPage from "./pages/tags/TagsListPage";
import RootErrorPage from "./RootErrorPage";
import { ImportImageProgressProvider } from "./components/contexts/ImportImageContext";

function Root() {
  const location = useLocation();
  console.debug("current url", {
    location: location,
  });

  return (
    <Routes>
      <Route>
        {/* Home. Currently same as /directories */}
        <Route
          element={
            <Layout.ThreeColumnLayout sideNavigation={<DirectoryExplorer />} />
          }
        >
          <Route index element={<DirectoryImageListPage />} />
        </Route>

        {/* Search */}
        <Route element={<Layout.TwoColumnLayout />} path="search">
          <Route index element={<SearchPage />} />
        </Route>

        {/* Directory */}
        <Route path="directories">
          <Route element={<Layout.TwoColumnLayout />}>
            <Route path="edit" element={<DirectoryEditPage />} />
          </Route>
          <Route element={<Layout.TwoColumnLayout />}>
            <Route path="tags/select" element={<DirectorySelectPage />} />
            <Route path="tags/edit" element={<DirectoryTagsEditPage />} />
          </Route>
          <Route
            element={
              <Layout.ThreeColumnLayout
                sideNavigation={<DirectoryExplorer />}
              />
            }
          >
            <Route index element={<DirectoryImageListPage />} />
            <Route path=":directoryId" element={<DirectoryImageListPage />} />
          </Route>
        </Route>

        {/* Image edit */}
        <Route path="images" element={<Layout.TwoColumnLayout />}>
          <Route path="edit/tags" element={<ImageTagEditPage />} />
          <Route
            path="edit/tags/suggestion"
            element={<ImageTagSuggestionPage />}
          />
        </Route>

        {/* Tags */}
        <Route path="tags">
          <Route element={<Layout.TwoColumnLayout />}>
            <Route path="edit" element={<TagsListPage />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}

const router = createBrowserRouter([
  {
    path: "*",
    element: <Root />,
    errorElement: <RootErrorPage />,
  },
]);

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

// Use MUI and JoyUI at the same time for the tree view
// https://mui.com/joy-ui/integrations/material-ui/
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <StyledEngineProvider injectFirst>
      <MaterialThemeProvider theme={{ [MATERIAL_THEME_ID]: materialTheme }}>
        <CssVarsProvider theme={joyTheme}>
          <CssBaseline />

          <ImportImageProgressProvider>
            <RouterProvider router={router} />
          </ImportImageProgressProvider>
        </CssVarsProvider>
      </MaterialThemeProvider>
    </StyledEngineProvider>
  </React.StrictMode>
);
