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
import { createBrowserRouter, Navigate, Outlet } from "react-router";
import RootErrorPage from "../RootErrorPage";
import { AppShell } from "../components/layout/app-shell";

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

/* ---------- placeholder pages (Phase D replaces these) ---------- */

const HomePage = () => <Placeholder name="Home" />;
/** Anime detail is a layout page: the shell + tabs render here, and the
 *  active tab renders inside <Outlet />. Phase D will wrap this with its
 *  own tab bar; for now we just pass through. */
const AnimeDetailPage = () => <Outlet />;
const ImagesTab = () => <Placeholder name="Images tab" />;
const EntriesTab = () => <Placeholder name="Entries tab" />;
const CharactersTab = () => <Placeholder name="Characters tab" />;
const TagsTab = () => <Placeholder name="Tags tab" />;
const InfoTab = () => <Placeholder name="Info tab" />;
const SearchPage = () => <Placeholder name="Search" />;
const TagManagementPage = () => <Placeholder name="Tag Management" />;
const ImageTagEditorPage = () => <Placeholder name="Image Tag Editor" />;
const SettingsPage = () => <Placeholder name="Settings" />;

/* ---------- route path constants (stable API for tests & nav) ---------- */

export const ROUTE_PATHS = {
  home: "/",
  animeDetail: "/anime/:animeId",
  animeImages: "/anime/:animeId/images",
  animeEntries: "/anime/:animeId/entries",
  animeCharacters: "/anime/:animeId/characters",
  animeTags: "/anime/:animeId/tags",
  animeInfo: "/anime/:animeId/info",
  search: "/search",
  tags: "/tags",
  imagesEditTags: "/images/edit/tags",
  settings: "/settings",
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
        element: <AnimeDetailPage />,
        children: [
          { index: true, element: <Navigate to="images" replace /> },
          { path: "images", element: <ImagesTab /> },
          { path: "entries", element: <EntriesTab /> },
          { path: "characters", element: <CharactersTab /> },
          { path: "tags", element: <TagsTab /> },
          { path: "info", element: <InfoTab /> },
        ],
      },
      { path: "search", element: <SearchPage /> },
      { path: "tags", element: <TagManagementPage /> },
      { path: "images/edit/tags", element: <ImageTagEditorPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);

export default router;
