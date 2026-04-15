/**
 * Application entry point.
 *
 * Bootstrap order (matters for both runtime correctness and visual FOUC):
 *   1. `@fontsource-variable/inter` — loads the variable Inter font before
 *      any component mounts so Chakra's typography tokens resolve against
 *      the right metrics on first paint.
 *   2. `./styles/globals.css` — defines the CSS custom properties Chakra
 *      and the app shell read for color / spacing / motion tokens.
 *   3. `AppProviders` — theme, React Query client, and color-mode provider.
 *      Must wrap the router so every route has access to the shared query
 *      cache and theme tokens.
 *   4. `RouterProvider` — react-router v7 router created in `./app/routes`.
 *
 * No MUI / Joy UI imports remain: the rebuilt frontend is Chakra-v3 only.
 */
import "@fontsource-variable/inter";
import "./styles/globals.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";

import { AppProviders } from "./app/providers";
import { router } from "./app/routes";

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>
);
