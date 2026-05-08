/**
 * Route tree for the rebuilt frontend.
 *
 * Mirrors frontend-design.md §3 EXACTLY. Phase D will replace the placeholder
 * page components below with real implementations; the route structure itself
 * (paths, nesting, redirect, errorElement) is permanent.
 *
 * We avoid `React.lazy` + Suspense here because:
 *   1. The placeholder pages do not exist as modules yet — lazy-importing a
 *      non-existent path would force either a `.catch` fallback on every
 *      page or temporary stub files, both of which leak into Phase D's
 *      diff. The brief explicitly allows a trivial-swap approach.
 *   2. At ~1000 images and ~9 pages, code splitting buys very little; we
 *      can add per-page lazy in Phase G or later without changing anything
 *      Phase B wrote.
 */
import { Box, Heading, Text } from "@chakra-ui/react";
import { createBrowserRouter, Navigate } from "react-router";
import RootErrorPage from "../RootErrorPage";
import { AppShell } from "../components/layout/app-shell";
import { AnimeDetailLayout } from "../pages/anime-detail";
import { CharactersTab } from "../pages/anime-detail/characters-tab";
import { SeasonsTab } from "../pages/anime-detail/seasons-tab";
import { ImagesTab } from "../pages/anime-detail/images-tab";
import { InfoTab } from "../pages/anime-detail/info-tab";
import { TagsTab } from "../pages/anime-detail/tags-tab";
import { HomePage } from "../pages/home";
import { ImageEditorPage } from "../pages/image-editor";
import { ImageTagEditorPage } from "../pages/image-tag-editor";
import { SearchPage } from "../pages/search";
import {
  SettingsLayout,
  GeneralSection,
  AppearanceSection,
  BackupSection,
  AboutSection,
} from "../pages/settings";
import { TagManagementPage } from "../pages/tags";

/**
 * Temporary placeholder rendered by every not-yet-built page. Phase D
 * replaces each `<Placeholder name="..."/>` call with the real component.
 */
export function Placeholder({ name }: { name: string }): JSX.Element {
  return (
    <Box p="6">
      <Heading as="h1" size="xl" color="fg">
        {name}
      </Heading>
      <Text mt="2" color="fg.muted">
        Coming from Phase D
      </Text>
    </Box>
  );
}

/* ---------- route path constants (stable API for tests & nav) ---------- */

export const ROUTE_PATHS = {
  home: "/",
  animeDetail: "/anime/:animeId",
  animeImages: "/anime/:animeId/images",
  animeSeasons: "/anime/:animeId/seasons",
  animeCharacters: "/anime/:animeId/characters",
  animeTags: "/anime/:animeId/tags",
  animeInfo: "/anime/:animeId/info",
  search: "/search",
  tags: "/tags",
  imagesEdit: "/images/edit",
  imagesEditTags: "/images/edit/tags",
  settings: "/settings",
  settingsGeneral: "/settings/general",
  settingsAppearance: "/settings/appearance",
  settingsBackup: "/settings/backup",
  settingsAbout: "/settings/about",
} as const;

/**
 * Route objects. Exported separately from the router so tests can mount
 * them under MemoryRouter / `createMemoryRouter` without relying on the
 * browser router's history API (which jsdom implements via window.location).
 */
export const routes = [
  {
    element: <AppShell />,
    errorElement: <RootErrorPage />,
    children: [
      { index: true, element: <HomePage /> },
      {
        path: "anime/:animeId",
        element: <AnimeDetailLayout />,
        children: [
          { index: true, element: <Navigate to="images" replace /> },
          { path: "images", element: <ImagesTab /> },
          { path: "seasons", element: <SeasonsTab /> },
          { path: "characters", element: <CharactersTab /> },
          { path: "tags", element: <TagsTab /> },
          { path: "info", element: <InfoTab /> },
        ],
      },
      { path: "search", element: <SearchPage /> },
      { path: "tags", element: <TagManagementPage /> },
      { path: "images/edit", element: <ImageEditorPage /> },
      { path: "images/edit/tags", element: <ImageTagEditorPage /> },
      {
        path: "settings",
        element: <SettingsLayout />,
        children: [
          { index: true, element: <Navigate to="general" replace /> },
          { path: "general", element: <GeneralSection /> },
          { path: "appearance", element: <AppearanceSection /> },
          { path: "backup", element: <BackupSection /> },
          { path: "about", element: <AboutSection /> },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(routes);

export default router;
