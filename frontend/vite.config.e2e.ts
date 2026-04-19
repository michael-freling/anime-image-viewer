/**
 * Vite config for E2E tests.
 *
 * Extends the base config with a `resolve.alias` that redirects the
 * `@wailsio/runtime` import to a mock module. This lets the generated
 * Wails binding code run unchanged while `Call.ByID` returns canned
 * responses instead of attempting an RPC to a Go backend.
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Redirect the Wails runtime to our mock so that all generated
      // binding files (animeservice.ts, models.ts, etc.) import mock
      // Call/Create instead of the real RPC bridge.
      "@wailsio/runtime": path.resolve(__dirname, "e2e/wails-runtime-mock.ts"),
    },
  },
});
