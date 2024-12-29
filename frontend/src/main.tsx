import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { StyledEngineProvider } from "@mui/joy";
import { BrowserRouter, Route, Routes } from "react-router";
import DirectoryImageListPage from "./pages/directories/DirectoryImageListPage";
import DirectoryExplorer from "./components/DirectoryExplorer";
import Layout from "./Layout";
import ImageTagEditPage from "./pages/tags/ImageTagEditPage";
import TagsListPage from "./pages/tags/TagsListPage";
import DirectoryTagsEditPage from "./pages/tags/DirectoryTagEditPage";
import ImageTagSuggestionPage from "./pages/tags/ImageTagSuggestionPage";
import SearchPage from "./pages/search/SearchPage";
import DirectoryEditPage from "./pages/directories/DirectoryEditPage";
import DirectorySelectPage from "./pages/directories/DirectorySelectPage";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <StyledEngineProvider injectFirst>
      <BrowserRouter>
        <Routes>
          <Route element={<App />}>
            {/* Home. Currently same as /directories */}
            <Route
              element={
                <Layout.ThreeColumnLayout
                  sideNavigation={<DirectoryExplorer />}
                />
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
                <Route
                  path=":directoryId"
                  element={<DirectoryImageListPage />}
                />
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
      </BrowserRouter>
    </StyledEngineProvider>
  </React.StrictMode>
);
