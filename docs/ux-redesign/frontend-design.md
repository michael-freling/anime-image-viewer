# Frontend Implementation Design: UX Redesign v2

## 1. Design Overview

### New Tech Stack

| Layer | Current | New | Rationale |
|-------|---------|-----|-----------|
| Component library | MUI Joy UI + MUI Material | Chakra UI v3 | Cohesive DX with built-in dark mode + theming, pre-built components. Chakra v3 is built on Ark UI internally, so we retain Radix-quality a11y primitives with less boilerplate than shadcn/ui. Eliminates MUI Joy/Material dual-theme complexity. Mobile-ready out of the box. |
| Styling | Emotion CSS-in-JS (via MUI `sx` prop) | Chakra `sx` + style props, with CSS custom properties for tokens | Chakra v3's style system with atomic props and tokens. Dark/light mode via `useColorMode`, no runtime theme recompilation. |
| Icons | `@mui/icons-material` | `lucide-react` | Tree-shakeable, consistent stroke style, 1KB per icon. |
| Image grid layout | `react-window` (FixedSizeGrid) | `react-photo-album` (rows / columns / masonry) | Layout-only library: arranges mixed-aspect-ratio photos without forcing uniform cell sizes. At current scale (~1000 images) no windowing is needed. |
| Image grid virtualization | none at current scale | none (future: Masonic if we exceed ~3k items) | At 1k images, windowing solves a different problem than layout. Adding it now would be premature. |
| Image viewer | `react-zoom-pan-pinch` | `react-zoom-pan-pinch` (keep) | Already works well. |
| State management | `useState` + 2 React Contexts | Zustand | Eliminates prop drilling. Small API, no boilerplate, selectors for re-render optimization. |
| Data fetching | Manual `useEffect` + `useState` | `@tanstack/react-query` v5 | Automatic cache, deduplication, background refetch. Replaces the repetitive load/refresh/setLoading/setError pattern. |
| Command palette | none | `cmdk` | Linear-style Ctrl+K palette. |
| Utility hooks | none (hand-rolled) | `@mantine/hooks` | Standalone hooks package. Provides `useHotkeys`, `useDebouncedValue`, `useLocalStorage`, `useClickOutside`. |
| Routing | `react-router` v7 (`createBrowserRouter`) | `react-router` v7 (keep) | Restructure route tree for new page hierarchy. |
| Runtime bridge | `@wailsio/runtime` | `@wailsio/runtime` (keep) | Required for Wails v3. |
| Font | `@fontsource/inter` | `@fontsource-variable/inter` | Variable font, single file. |

Migration is a big-bang rebuild: every component changes, layout fundamentally changes (icon-rail + full-width content replaces `TwoColumnLayout` / `ThreeColumnLayout`), state management changes, and the codebase is small enough (~35 files, ~4500 LOC) to make incremental migration more painful than a rewrite.


---

## 2. Directory Structure

```
frontend/src/
  app/
    routes.tsx                    # Route definitions (createBrowserRouter)
    providers.tsx                 # App-level providers (QueryClient, Zustand, Theme)
    layout.tsx                    # Root layout with AppShell

  components/
    ui/                           # App-specific wrappers over Chakra + third-party primitives
      confirm-dialog.tsx           # Chakra AlertDialog wrapper with danger/default variants
      command-palette.tsx          # cmdk-powered Ctrl+K palette
      toaster.tsx                  # Chakra `createToaster` singleton + helpers
      tri-state-checkbox.tsx       # Checkbox supporting indeterminate/checked/unchecked
      collapsible.tsx              # Chakra Collapse wrapper

    layout/
      app-shell.tsx               # Grid wrapper: icon-rail + content area
      icon-rail.tsx               # 64px collapsed, 180px on hover
      bottom-tab-bar.tsx          # Mobile 4-tab bar
      page-header.tsx             # Sticky header per page (title + actions)

    shared/
      anime-card.tsx              # Netflix-style cover card (also exports NewAnimeCard)
      image-thumbnail.tsx         # Single image render helper used by ImageGrid
      image-grid.tsx              # react-photo-album wrapper (masonry/rows/columns)
      tag-chip.tsx                # Colored tag pill
      category-section.tsx        # Collapsible tag category group
      search-bar.tsx              # Large search input with suggestions
      filter-chip.tsx             # Inline filter pill (removable)
      entry-tab.tsx               # Horizontal entry filter tab
      empty-state.tsx             # Centered illustration + message
      loading-skeleton.tsx        # Skeleton placeholders per component shape
      error-alert.tsx             # Inline error display
      import-progress-bar.tsx     # Bottom progress for image imports
      import-folders-dialog.tsx   # Folder picker for multi-anime import flow

    selection/
      rubber-band-overlay.tsx     # Canvas-based drag-select rectangle
      selection-action-bar.tsx    # Floating bar with count + bulk actions

    image-viewer/
      image-viewer-overlay.tsx    # Full-screen dark overlay
      image-viewer-controls.tsx   # Navigation arrows, close button

  pages/
    home/
      home-page.tsx               # Anime card grid + "New Anime" card
      create-anime-dialog.tsx     # Create dialog with AniList search

    anime-detail/
      anime-detail-page.tsx       # Shell with tabs
      tabs/
        images-tab.tsx            # Entry sub-tabs + tag filter + masonry grid
        entries-tab.tsx           # Entry table with inline edit
        characters-tab.tsx        # Character card grid
        tags-tab.tsx              # Chip toggles by category
        info-tab.tsx              # Centered edit form + danger zone

    search/
      search-page.tsx             # Search bar + filter chips + masonry results

    tags/
      tag-management-page.tsx     # Categories with tag rows

    image-tag-editor/
      image-tag-editor-page.tsx   # Selected images strip + tri-state checkboxes

    settings/
      settings-page.tsx           # Horizontal section tabs (active section is local state)
      sections/
        general-section.tsx
        appearance-section.tsx
        backup-section.tsx
        about-section.tsx

  hooks/
    use-anime-list.ts             # React Query: list all anime
    use-anime-detail.ts           # React Query: anime details + entries
    use-anime-images.ts           # React Query: images for an anime/entry
    use-search-images.ts          # React Query: search with filters
    use-tags.ts                   # React Query: all tags, tag map
    use-tag-stats.ts              # React Query: tag stats for file IDs
    use-backup.ts                 # React Query: backup list + backup/restore mutations
    use-config.ts                 # React Query: app config
    use-image-selection.ts        # Selection state (click, shift-click, ctrl-click)
    use-rubber-band.ts            # Rubber band drag-select geometry
    use-anilist-search.ts         # Debounced AniList search
    use-wails-event.ts            # Subscribe/unsubscribe to Wails events
    use-image-prefetch.ts         # Prefetch next/prev images in viewer
    # Utility hooks (useHotkeys, useDebouncedValue, useLocalStorage, useClickOutside)
    # are imported directly from `@mantine/hooks`; do not re-wrap them.

  stores/
    selection-store.ts            # Zustand: selected image IDs, select mode
    ui-store.ts                   # Zustand: sidebar state, theme, command palette open
    import-progress-store.ts      # Zustand: import progress (replaces ImportImageContext)

  lib/
    api.ts                        # Re-export Wails bindings with typed wrappers
    query-keys.ts                 # React Query key factory
    image-urls.ts                 # Helpers: build `?width=N` thumbnail URLs and srcset strings
    format.ts                     # Date, season, count formatters
    constants.ts                  # Color maps, entry type configs, thumbnail width tiers

  types/
    index.ts                      # Shared TypeScript interfaces (app-level)

  styles/
    globals.css                   # CSS custom properties, font-face, `content-visibility: auto` utility
    theme.ts                      # Chakra v3 `createSystem` theme: tokens, semantic tokens, recipes
```


---

## 3. Routing Structure

```
createBrowserRouter([
  {
    element: <AppShell />,
    errorElement: <RootErrorPage />,
    children: [
      { index: true, element: <HomePage /> },
      {
        path: 'anime/:animeId',
        element: <AnimeDetailPage />,
        children: [
          { index: true, element: <Navigate to="images" replace /> },
          { path: 'images', element: <ImagesTab /> },
          { path: 'entries', element: <EntriesTab /> },
          { path: 'characters', element: <CharactersTab /> },
          { path: 'tags', element: <TagsTab /> },
          { path: 'info', element: <InfoTab /> },
        ]
      },
      { path: 'search', element: <SearchPage /> },
      { path: 'tags', element: <TagManagementPage /> },
      { path: 'images/edit/tags', element: <ImageTagEditorPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ]
  }
])
```

Key changes from current app:
1. Anime detail uses nested routes for tabs, enabling direct linking and browser back/forward within tabs.
2. Directories routes removed entirely — users never navigate to folders.
3. Backup page merged into Settings (no `/backup` route).
4. Image tag edit route simplified — single route handles both anime-context and global tag editing via query params.
5. Settings section is local state, not URL state (settings aren't shareable).


---

## 4. Image Optimization Strategy

The highest-leverage correctness concern in the app. Scale is ~1000 images, each a 4K PNG (3840x2160) at 3-10 MB on disk, ~33 MB decoded as a bitmap. Thirty visible decoded images is ~1 GB of resident memory — enough to OOM the Wails WebView on modest hardware. `loading="lazy"` defers *fetching*, not *decoding*, so we must serve smaller sources.

**Backend must:**
- Serve `?width=N` resize endpoint with thumbnails generated server-side on first request and cached. Supported widths: `520` (grid), `1040` (grid @2x), `1920` (preview). Original only served when the zoom-pan-pinch viewer opens.
- Convert PNG to WebP at resize time (quality ~80, ~30% smaller than PNG with imperceptible difference).
- Set `Cache-Control: public, max-age=31536000, immutable` on resized variants (URL is content-addressed).
- Use `ETag` + `If-None-Match` on originals (user can replace a file). Resized variants embed a short hash of the source ETag.

**Frontend must:**
- `loading="lazy"` on every `<img>`.
- `decoding="async"` to let the browser decode off the main thread.
- `srcset` for DPR-aware sizes: `?width=520 1x, ?width=1040 2x`.
- `content-visibility: auto` with `contain-intrinsic-size` on the tile wrapper to skip layout/paint/decoding for offscreen tiles.
- `react-photo-album` for layout only; no hand-rolled masonry math.
- React Query `staleTime: 5 * 60 * 1000` for image metadata (not bytes — browser HTTP cache owns those).

**Deliberately NOT doing at current scale:**
- No windowing. 1000 `<img>` nodes is ~1 MB of DOM overhead, negligible. Revisit if grid exceeds ~3000 items (swap `ImageGrid` internals for Masonic).
- No manual intersection observer. `loading="lazy"` already uses the browser's native IO.
- No prefetching of grid thumbnails — only adjacent full-size previews in the image viewer.
