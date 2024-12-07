import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { StyledEngineProvider } from "@mui/joy";
import { BrowserRouter, Route, Routes } from "react-router";
import ImageListPage from "./pages/ImageListPage";
import DirectoryExplorer from "./components/DirectoryExplorer";
import TagExplorer from "./components/TagExplorer";
import Layout from "./Layout";
import ImageTagEditPage from "./pages/ImageTagEditPage";
import TagsListPage from "./pages/tags/TagsListPage";

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
                  sideNavigation={<DirectoryExplorer editable={false} />}
                />
              }
            >
              <Route index element={<ImageListPage />} />
            </Route>

            {/* Directory */}
            <Route path="directories">
              <Route element={<Layout.TwoColumnLayout />}>
                <Route
                  path="edit"
                  element={<DirectoryExplorer editable={true} />}
                />
              </Route>
              <Route
                element={
                  <Layout.ThreeColumnLayout
                    sideNavigation={<DirectoryExplorer editable={false} />}
                  />
                }
              >
                <Route index element={<ImageListPage />} />
                <Route path=":directoryId" element={<ImageListPage />} />
              </Route>
            </Route>

            {/* Image edit */}
            <Route path="images" element={<Layout.TwoColumnLayout />}>
              <Route path="edit/tags" element={<ImageTagEditPage />} />
            </Route>

            {/* Tags */}
            <Route path="tags">
              <Route element={<Layout.TwoColumnLayout />}>
                <Route path="edit" element={<TagsListPage />} />
              </Route>
              <Route
                element={
                  <Layout.ThreeColumnLayout
                    sideNavigation={
                      <TagExplorer title="Search by tags" editable={false} />
                    }
                  />
                }
              >
                <Route index element={<ImageListPage />} />
                <Route path=":tagId" element={<ImageListPage />} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </StyledEngineProvider>
  </React.StrictMode>
);
