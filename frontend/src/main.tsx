import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { StyledEngineProvider } from "@mui/joy";
import { BrowserRouter, Route, Routes } from "react-router";
import ImageListPage from "./pages/ImageListPage";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <StyledEngineProvider injectFirst>
        <BrowserRouter>
          <Routes>
            <Route element={<App /> }>
              <Route index element={<ImageListPage /> } />
              <Route path="directories/:directoryId" element={<ImageListPage /> } />
            </Route>
          </Routes>
        </BrowserRouter>
    </StyledEngineProvider>
  </React.StrictMode>
);
