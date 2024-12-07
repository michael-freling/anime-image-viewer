import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { StyledEngineProvider } from "@mui/joy";
import { BrowserRouter, Route, Routes } from "react-router";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <StyledEngineProvider injectFirst>
        <BrowserRouter>
          <Routes>
            <Route index element={<App /> } />
          </Routes>
        </BrowserRouter>
    </StyledEngineProvider>
  </React.StrictMode>
);
