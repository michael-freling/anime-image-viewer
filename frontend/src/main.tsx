import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { StyledEngineProvider } from "@mui/joy";
import { BrowserRouter, Route, Routes } from "react-router";
import ImageListPage from "./pages/ImageListPage";
import DirectoryExplorer from "./components/DirectoryExplorer";
import TagExplorer from "./components/TagExplorer";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <StyledEngineProvider injectFirst>
      <BrowserRouter>
        <Routes>
          <Route element={<App />}>
            <Route index element={<ImageListPage />} />

            <Route
              path="directories/edit"
              element={<DirectoryExplorer editable={true} />}
            />
            <Route path="tags/edit" element={<TagExplorer editable={true} />} />

            <Route
              path="directories/:directoryId"
              element={<ImageListPage />}
            />
            <Route path="/tags" element={<TagExplorer editable={false} />} />
            <Route path="tags/:tagId" element={<ImageListPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </StyledEngineProvider>
  </React.StrictMode>
);
